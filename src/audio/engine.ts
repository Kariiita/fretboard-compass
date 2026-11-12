/**
 * 音频引擎：Karplus-Strong 拨弦合成。
 *
 * 为什么不用采样：几百 KB 的采样包对一个学习工具太重，
 * 而 KS 算法 30 行就能得到相当像吉他的声音，且任意音高都能发。
 *
 * 波形在 JS 里离线算（renderPluck），播放用的是 AudioBufferSourceNode。
 * ⚠️ 不要改回 Web Audio 的 DelayNode 反馈环：浏览器会给环里的 DelayNode
 * 额外加 128 采样（一个渲染量子）的延迟，音高全错。
 */

import { midiToFreq } from '../theory/tuning';

let ctx: AudioContext | null = null;

const VOLUME_KEY = 'fret-compass-volume';
const DEFAULT_VOLUME = 0.7;

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function loadVolume(): number {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    if (raw === null) return DEFAULT_VOLUME;
    const v = Number(raw);
    return Number.isFinite(v) ? clamp01(v) : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
}

let volume = loadVolume();
let master: GainNode | null = null;

/* ── 固定音色 ───────────────────────────────────────────── */

/**
 * 音色只做**环外后处理**（滤波、软削波、混响），不改 Karplus-Strong 环路本身，
 * 所以波形缓存不需要按音色分开——缓存的永远是同一份「裸拨弦」。
 * 现在只保留原声钢弦这一套参数，不再是可切换的预设列表。
 */
export interface TimbrePreset {
  id: string;
  name: string;
  hint: string;
  /** 音色低通：越高越亮，尼龙 / 爵士需要压暗 */
  toneHz: number;
  /** 隔掉低音弦的隆隆声 */
  highpassHz: number;
  /** 箱体共鸣（lowshelf） */
  bodyHz: number;
  bodyDb: number;
  /** 0 = 干声；越大越接近轻失真。软削波在 0 附近斜率是 1，不会把尾音放大 */
  drive: number;
  /** 混响发送量 0–1 */
  reverb: number;
  /** 输出补偿，补回滤波吃掉的响度 */
  level: number;
}

/** 唯一的音色：原声钢弦。参数只影响环外后处理，不碰 KS 环路。 */
export const TIMBRE: TimbrePreset = {
  id: 'steel',
  name: '原声 · 钢弦',
  hint: '明亮、颗粒感清晰',
  toneHz: 5600,
  highpassHz: 70,
  bodyHz: 190,
  bodyDb: 3.5,
  drive: 0,
  reverb: 0.2,
  level: 1,
};

let reverbSend: GainNode | null = null;

export function getAudioContext(): AudioContext {
  if (!ctx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** RBJ 系数的 IIRFilterNode。环外滤波用它，避开 Web Audio 对 Q 的 dB 解释 */
function iirFilter(
  context: BaseAudioContext,
  type: 'lowpass' | 'highpass',
  hz: number,
  q: number,
): IIRFilterNode {
  const c = biquadCoefficients(type, hz, q, context.sampleRate);
  return context.createIIRFilter(c.feedforward, c.feedback);
}

/** 程序生成的房间混响脉冲：前 12 ms 留空当作预延迟，之后按指数衰减 */
function makeImpulse(context: BaseAudioContext): AudioBuffer {
  const seconds = 1.5;
  const rate = context.sampleRate;
  const len = Math.max(1, Math.floor(rate * seconds));
  const pre = Math.floor(rate * 0.012);
  const buf = context.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / (len - pre);
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.6);
    }
  }
  return buf;
}

/**
 * 主输出链：总音量 → 限幅器 → 扬声器，另外并联一路混响发送。
 *
 * 限幅器是必须的：扫弦是 6 个音同时发声，峰值会叠到 1 以上直接削波。
 * 混响是干湿并联，不构成反馈环；湿声也进限幅器，所以不会绕过保护。
 */
function masterBus(context: AudioContext): GainNode {
  if (!master) {
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.12;
    limiter.connect(context.destination);

    master = context.createGain();
    master.gain.value = volume;
    master.connect(limiter);

    // 混响尾巴压掉高频，否则程序噪声脉冲听起来像「沙沙的底噪」
    const convolver = context.createConvolver();
    convolver.buffer = makeImpulse(context);
    const wetTone = iirFilter(context, 'lowpass', 3400, Math.SQRT1_2);
    const wet = context.createGain();
    wet.gain.value = 0.85;
    reverbSend = context.createGain();
    reverbSend.gain.value = TIMBRE.reverb;
    master.connect(reverbSend);
    reverbSend.connect(convolver);
    convolver.connect(wetTone);
    wetTone.connect(wet);
    wet.connect(limiter);
  }
  return master;
}

export function getVolume(): number {
  return volume;
}

export function setMasterVolume(v: number): void {
  volume = clamp01(v);
  try {
    localStorage.setItem(VOLUME_KEY, String(volume));
  } catch {
    /* 隐私模式下存不了，无所谓 */
  }
  if (master) master.gain.setTargetAtTime(volume, getAudioContext().currentTime, 0.02);
}

/** 把系数包成一个流式滤波器（DF-II 转置之外的最简形式，够用） */
function biquadProcessor(c: BiquadCoefficients): (x: number) => number {
  const [b0, b1, b2] = c.feedforward;
  const [, a1, a2] = c.feedback;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  return (x: number) => {
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    return y;
  };
}

/** 二阶滤波在频率 f 处的相位（弧度）。正 = 相位超前 */
function biquadPhase(c: BiquadCoefficients, f: number, sampleRate: number): number {
  const w = (2 * Math.PI * f) / sampleRate;
  const [b0, b1, b2] = c.feedforward;
  const [, a1, a2] = c.feedback;
  const nr = b0 + b1 * Math.cos(w) + b2 * Math.cos(2 * w);
  const ni = -(b1 * Math.sin(w) + b2 * Math.sin(2 * w));
  const dr = 1 + a1 * Math.cos(w) + a2 * Math.cos(2 * w);
  const di = -(a1 * Math.sin(w) + a2 * Math.sin(2 * w));
  // arg(N / D) = arg(N) - arg(D)
  return Math.atan2(ni, nr) - Math.atan2(di, dr);
}

/**
 * 整数延期 P 下，环路真正振荡的频率。
 *
 * 闭环条件：φ(f) − 2πfP/fs = −2π（取基模）。φ 随 f 下降，方程在 (0.5, 1.5)×fs/P 内单调，
 * 二分即可。低通和高通的相位会让频率比 fs/P 高几个百分点，不解出来就是走音。
 */
function loopFrequency(
  P: number,
  lp: BiquadCoefficients,
  hp: BiquadCoefficients,
  sampleRate: number,
): number {
  const phaseAt = (f: number) =>
    biquadPhase(lp, f, sampleRate) +
    biquadPhase(hp, f, sampleRate) -
    (2 * Math.PI * f * P) / sampleRate;
  let lo = (sampleRate / P) * 0.5;
  let hi = (sampleRate / P) * 1.5;
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    if (phaseAt(mid) > -2 * Math.PI) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export interface PluckWaveform {
  data: Float32Array;
  /**
   * 播放时乘上的速率。缓冲区按整数周期合成（会有几个音分的栅格偏差），
   * 靠 AudioBufferSourceNode 的高质量重采样一次性校准到目标音高 ——
   * 校准发生在环外，不会像环内插值那样每个周期都吃掉一点高频。
   */
  rate: number;
}

/**
 * 在 JS 里离线算出一条 Karplus-Strong 拨弦波形。
 *
 * **为什么不在 Web Audio 里搭反馈环**：DelayNode 只要出现在环里，
 * 浏览器就会额外加**一个渲染量子（128 采样 ≈ 2.67 ms）**的延迟。
 * 低音 E2 的周期是 582 采样，多 128 采样 → 偏低 255 音分；
 * 高音 E6 周期只有 36 采样 → 直接偏两个八度。整个音阶都是错的。
 *
 * **为什么环内用整数延迟**：分数延迟要插值，插值对高频有衰减，
 * 而衰减是每个周期发生一次的 —— 高音一秒过 1300 个周期，
 * 0.35%/周期就是 −80 dB/s，高音半秒就没了。整数延迟没有这个问题。
 */
export function renderPluck(freq: number, sampleRate: number, seconds: number): PluckWaveform {
  const n = Math.max(1, Math.floor(sampleRate * seconds));

  const lpC = biquadCoefficients(
    'lowpass',
    Math.min(KS.dampMaxHz, Math.max(KS.dampMinHz, freq * KS.dampRatio)),
    KS.dampQ,
    sampleRate,
  );
  const hpC = biquadCoefficients('highpass', KS.dcHz, KS.dcQ, sampleRate);

  // 先把滤波器相位造成的那几个百分点补进周期，再取整
  const phi = biquadPhase(lpC, freq, sampleRate) + biquadPhase(hpC, freq, sampleRate);
  const P = Math.max(2, Math.round((sampleRate / freq) * (1 + phi / (2 * Math.PI))));
  const fps = loopFrequency(P, lpC, hpC, sampleRate);
  const rate = freq / fps;

  const out = new Float32Array(n);
  const lead = P + 2;
  const line = new Float32Array(lead + n + 2);

  // 激励：30 ms 衰减噪声，像拨片刮过弦。
  // 先用一阶低通去掉纯白噪声的「钢丝味」，再按拨弦位置（约 1/8 弦长）做一次
  // 梳状抵消，模拟拨片不在弦正中间时被削掉的那部分泛音。
  const exc = Math.max(2, Math.floor(sampleRate * 0.03));
  const noiseA = Math.exp((-2 * Math.PI * 3200) / sampleRate);
  let noiseLp = 0;
  for (let i = 0; i < Math.min(lead, exc); i++) {
    const white = Math.random() * 2 - 1;
    noiseLp = (1 - noiseA) * white + noiseA * noiseLp;
    line[i] = noiseLp * Math.pow(1 - i / exc, 1.45);
  }
  const pick = Math.max(1, Math.round(P * 0.13));
  for (let i = exc - 1; i >= pick; i--) line[i] -= 0.35 * line[i - pick];

  const lp = biquadProcessor(lpC);
  const hp = biquadProcessor(hpC);
  const g = feedbackFor(freq);

  let peak = 0;
  let w = lead;
  for (let i = 0; i < n; i++) {
    const y = line[w - P];
    out[i] = y;
    const a = Math.abs(y);
    if (a > peak) peak = a;
    line[w] = g * hp(lp(y));
    w++;
  }

  // 不同音高的激励能量有差异，归一化让每个音听起来一样响
  if (peak > 0) {
    const k = 0.95 / peak;
    for (let i = 0; i < n; i++) out[i] *= k;
  }
  return { data: out, rate };
}

/** 每个音只算一次；采样率变了（极少见）才会重算 */
const pluckCache = new Map<number, PluckWaveform>();

function pluckData(midi: number, sampleRate: number): PluckWaveform {
  const key = midi * 1e6 + sampleRate;
  const hit = pluckCache.get(key);
  if (hit) return hit;
  const wave = renderPluck(midiToFreq(midi), sampleRate, KS.bufferSeconds);
  if (pluckCache.size > 96) pluckCache.clear();
  pluckCache.set(key, wave);
  return wave;
}

/**
 * Karplus-Strong 环路参数。抽成常量是为了让测试能直接验算环路增益
 * （见 src/audio/__tests__/engine.test.ts）—— 这些数一旦调大就会啸叫。
 */
export const KS = {
  /** 目标衰减时间：响度掉 60 dB 所需的秒数 */
  t60: 1.8,
  /**
   * 阻尼低通的 Q —— **线性 Q**，巴特沃斯值 1/√2。
   *
   * ⚠️ 这个数不会塞给 BiquadFilterNode.Q（见 biquadCoefficients 的注释），
   * 超过 0.707 就会出现谐振峰，环路增益过 1 直接啸叫。
   */
  dampQ: Math.SQRT1_2,
  dampMinHz: 1600,
  dampMaxHz: 7000,
  dampRatio: 10,
  /** 隔直高通，掐掉直流累积（低通对直流增益恰好是 1），同样用线性 Q */
  dcHz: 20,
  dcQ: Math.SQRT1_2,
  /** 反馈增益上限，留一点余量给滤波器的数值误差 */
  maxFeedback: 0.9995,
  /** 每条拨弦波形的长度；超过了就把尾巴截掉 */
  bufferSeconds: 2.4,
} as const;

export interface BiquadCoefficients {
  feedforward: [number, number, number];
  feedback: [number, number, number];
}

/**
 * RBJ Audio EQ Cookbook 的二阶低通 / 高通系数。
 *
 * **为什么不直接用 BiquadFilterNode + Q**：Web Audio 把 lowpass / highpass 的
 * `Q` 参数**按 dB 解释**（Chromium 里 g = 10^(Q/20)，实测 Q=0.5 → 峰值 1.2015，
 * Q=1 → 1.2533）。我第一版就是在这里翻车的：以为 Q=0.5 是单调的，
 * 结果反馈环乘上 +1.6 dB 的谐振峰 = 1.16 > 1，点播放就啸叫。
 *
 * 自己算系数喂 IIRFilterNode，代码、单元测试、浏览器三方说的是同一个数学。
 * `q` 这里是**线性 Q**：0.707 是巴特沃斯（单调、无谐振），越大峰越高。
 */
export function biquadCoefficients(
  type: 'lowpass' | 'highpass',
  f0: number,
  q: number,
  sampleRate: number,
): BiquadCoefficients {
  // 奈奎斯特以下留余量，否则 w0 → π 时系数退化
  const w0 = (2 * Math.PI * Math.min(Math.max(f0, 1), sampleRate * 0.45)) / sampleRate;
  const alpha = Math.sin(w0) / (2 * q);
  const cos = Math.cos(w0);
  const a0 = 1 + alpha;
  const b0 = type === 'lowpass' ? (1 - cos) / 2 : (1 + cos) / 2;
  const b1 = type === 'lowpass' ? 1 - cos : -(1 + cos);
  return {
    feedforward: [b0 / a0, b1 / a0, b0 / a0],
    feedback: [1, (-2 * cos) / a0, (1 - alpha) / a0],
  };
}

/**
 * 反馈增益必须**按频率**算，不能写死一个常数。
 *
 * 因为反馈是每「一个周期」衰减一次的：写死 0.96 时，低音 E2 每个周期 12 ms，
 * 2 秒后还剩 0.96^164 ≈ 0.1%（正常）；但高音 E6 每个周期 0.76 ms，
 * 0.96^2600 ≈ 0，一出声就没了。所以要按目标 T60 反推每周期该保留多少。
 */
export function feedbackFor(freq: number): number {
  const period = 1 / freq;
  // 每周期衰减到 -60dB/T60 对应的小数
  return Math.min(KS.maxFeedback, Math.pow(10, (-3 * period) / KS.t60));
}

/**
 * 把一次拨弦接到指定的 context 上。
 *
 * 波形已经在 JS 里算好了（见 renderPluck），这里只负责播放和包络。
 * 抽出来是为了能用 OfflineAudioContext 离线渲染做回归测试（见 scripts/audio-check）。
 *
 * **不要改回 Web Audio 反馈环**：DelayNode 在环里会被浏览器额外加一个
 * 渲染量子（128 采样）的延迟，低音偏 255 音分、高音偏两个八度。
 */
/**
 * 软削波曲线：`(1-d)·x + d·x/(1+|x|)`。
 *
 * 不要在 0 附近用 tanh(kx) —— 它的斜率是 k，会把已经衰减到很小的尾音
 * 重新放大，听感变成「怎么都不消」，也会破坏峰值单调下降的回归检查。
 * 这里 x/(1+|x|) 在 0 处斜率恰好是 1，只压峰值、不抬尾巴。
 */
const driveCache = new Map<number, Float32Array<ArrayBuffer>>();
function driveCurve(amount: number): Float32Array<ArrayBuffer> {
  const key = Math.round(amount * 100);
  const hit = driveCache.get(key);
  if (hit) return hit;
  const n = 1024;
  const d = Math.min(0.95, Math.max(0, amount));
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    curve[i] = (1 - d) * x + d * (x / (1 + Math.abs(x)));
  }
  if (driveCache.size > 24) driveCache.clear();
  driveCache.set(key, curve);
  return curve;
}

export function pluckOn(
  context: BaseAudioContext,
  dest: AudioNode,
  midi: number,
  when = 0,
  gain = 0.22,
  duration = 2.0,
): void {
  const t = Math.max(0, when);
  const preset = TIMBRE;
  const wave = pluckData(midi, context.sampleRate);

  const buf = context.createBuffer(1, wave.data.length, context.sampleRate);
  buf.getChannelData(0).set(wave.data);

  const src = context.createBufferSource();
  src.buffer = buf;
  // 缓冲区按整数周期合成，用重采样把音高潮到目标（见 PluckWaveform.rate）
  src.playbackRate.value = wave.rate;

  // 波形本身已经衰减好了，包络只做防爆点的淡入淡出
  const level = Math.max(0.0002, gain * preset.level);
  const fadeAt = t + Math.max(0.08, Math.min(duration, KS.bufferSeconds) - 0.08);
  const out = context.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(level, t + 0.006);
  out.gain.setValueAtTime(level, fadeAt);
  out.gain.exponentialRampToValueAtTime(0.0001, fadeAt + 0.07);
  out.connect(dest);

  // 音色链：隔直高通 → 软削波（可选）→ 箱体 → 音色低通 → 包络。
  // 全部在环路外，且都是前馈节点，不会引入自激。
  const hp = iirFilter(context, 'highpass', preset.highpassHz, Math.SQRT1_2);
  const body = context.createBiquadFilter();
  body.type = 'lowshelf';
  body.frequency.value = preset.bodyHz;
  body.gain.value = preset.bodyDb;
  const tone = iirFilter(context, 'lowpass', preset.toneHz, Math.SQRT1_2);

  hp.connect(body);
  body.connect(tone);
  tone.connect(out);

  src.connect(hp);
  let shaper: WaveShaperNode | null = null;
  if (preset.drive > 0) {
    shaper = context.createWaveShaper();
    shaper.curve = driveCurve(preset.drive);
    shaper.oversample = '2x';
    // 接在箱体前面：先失真再塑形，听感更接近音箱而不是「滤镜上的破音」
    hp.disconnect();
    shaper.connect(body);
    hp.connect(shaper);
  }

  src.start(t);
  src.stop(fadeAt + 0.08);

  // 到时间断开，避免节点泄漏。context.currentTime 不是墙上时钟，要算相对时间。
  const liveMs = (t - context.currentTime + Math.min(duration, KS.bufferSeconds) + 0.2) * 1000;
  globalThis.setTimeout(
    () => {
      try {
        src.disconnect();
        hp.disconnect();
        shaper?.disconnect();
        body.disconnect();
        tone.disconnect();
        out.disconnect();
      } catch {
        /* 已断开 */
      }
    },
    Math.max(200, liveMs),
  );
}

/** 拨一根弦 */
export function pluck(midi: number, when = 0, gain = 0.22, duration = 2.0): void {
  const context = getAudioContext();
  const at = Math.max(context.currentTime, when);
  pluckOn(context, masterBus(context), midi, at, gain, duration);
}

/** 同时拨响一组音（扫弦感：音符间留一点点延迟） */
export function strum(midis: number[], when = 0, spread = 0.035, gain = 0.16): void {
  const context = getAudioContext();
  const base = when || context.currentTime;
  midis.forEach((m, i) => {
    pluck(m, base + i * spread, gain, 2.2);
  });
}

/** 按顺序弹出一串音（音阶 / 琶音） */
export function playSequence(midis: number[], step = 0.16, gain = 0.2): void {
  const context = getAudioContext();
  const base = context.currentTime + 0.02;
  midis.forEach((m, i) => pluck(m, base + i * step, gain, 1.6));
}

export function now(): number {
  return getAudioContext().currentTime;
}
