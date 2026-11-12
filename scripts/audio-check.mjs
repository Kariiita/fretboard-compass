/**
 * 音频回归检查：把 src/audio/engine.ts 打包注入 headless Chrome，
 * 用 OfflineAudioContext 渲染**真实的播放链路**，量音高、量峰值、量衰减。
 *
 * 为什么不能只在 Node 里算公式：Web Audio 有几件事公式里根本没有 ——
 *  - lowpass/highpass 的 Q 是按 **dB** 解释的（Q=0.5 → 峰值 1.2015）
 *  - DelayNode 只要在反馈环里，浏览器就额外加一个渲染量子（128 采样）的延迟
 *  - AudioBufferSourceNode 的 playbackRate 重采样只存在于浏览器里
 * 这三条都翻过车：单元测试全绿，浏览器里要么啸叫，要么整个音阶偏低 255 音分。
 *
 * 判据：
 *  1. 每个音的实测基频与十二平均律的偏差 < 10 音分（走音 = 音阶听不出调）
 *  2. 每 0.5 秒的峰值必须单调下降（任何一段变大 = 环路增益 ≥ 1，啸叫）
 *
 * 用法：node scripts/audio-check.mjs
 * 退出码 1 = 检测到自激或走音。
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from 'esbuild';

const PORT = 9337;
const SECS = 4;
const FS = 48000;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const bundled = await build({
  entryPoints: ['src/audio/engine.ts'],
  bundle: true,
  format: 'iife',
  globalName: 'ENGINE',
  write: false,
});
const bundle = bundled.outputFiles[0].text;

const profile = mkdtempSync(join(tmpdir(), 'audio-check-'));
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function wsUrl() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      /* 浏览器还没起来 */
    }
    await sleep(250);
  }
  throw new Error('连不上 Chrome DevTools');
}

const ws = new WebSocket(await wsUrl());
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pend = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) {
    pend.get(m.id)(m);
    pend.delete(m.id);
  }
});
const send = (method, params = {}) => {
  const i = ++id;
  ws.send(JSON.stringify({ id: i, method, params }));
  return new Promise((res) => pend.set(i, res));
};
const evaluate = async (expr, wrap = true) => {
  const r = await send('Runtime.evaluate', {
    expression: wrap ? `(async () => { ${expr} })()` : expr,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.result?.exceptionDetails) {
    throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 1200));
  }
  return r.result?.result?.value;
};

try {
  await send('Runtime.enable');
  await sleep(300);
  // 顶层求值，var ENGINE 才会落在全局作用域
  await evaluate(`${bundle};`, false);

  const result = await evaluate(`
    const FS = ${FS}, SECS = ${SECS};
    const segments = (data) => {
      const out = [];
      const len = Math.floor(data.length / 8);
      for (let k = 0; k < 8; k++) {
        let peak = 0;
        for (let i = k * len; i < (k + 1) * len; i++) {
          const v = Math.abs(data[i]);
          if (v > peak) peak = v;
        }
        out.push(+peak.toFixed(4));
      }
      return out;
    };
    // Goertzel：只量基频那根线的衰减，避开拨弦瞬态的高频噪声
    const goertzel = (data, a, b, f) => {
      const w = 2 * Math.PI * f / FS, c = 2 * Math.cos(w);
      let s0 = 0, s1 = 0, s2 = 0;
      for (let i = a; i < b; i++) { s0 = data[i] + c * s1 - s2; s2 = s1; s1 = s0; }
      return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2)) / (b - a);
    };
    // Hann 窗 + 零填充 FFT + 抛物线插值（自相关在 KS 信号上不可靠，见单元测试注释）
    const fft = (re, im) => {
      const n = re.length;
      for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) { const tr = re[i]; re[i] = re[j]; re[j] = tr;
                     const ti = im[i]; im[i] = im[j]; im[j] = ti; }
      }
      for (let len = 2; len <= n; len <<= 1) {
        const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
        for (let i = 0; i < n; i += len) {
          let cr = 1, ci = 0;
          for (let k = 0; k < len / 2; k++) {
            const ar = re[i + k], ai = im[i + k];
            const br = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
            const bi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
            re[i + k] = ar + br; im[i + k] = ai + bi;
            re[i + k + len / 2] = ar - br; im[i + k + len / 2] = ai - bi;
            const ncr = cr * wr - ci * wi;
            ci = cr * wi + ci * wr; cr = ncr;
          }
        }
      }
    };
    const detectF0 = (data, expect) => {
      const N = 1 << 18;
      const take = Math.min(Math.floor(FS * 0.4), data.length);
      const re = new Float64Array(N), im = new Float64Array(N);
      for (let i = 0; i < take; i++) {
        re[i] = data[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (take - 1)));
      }
      fft(re, im);
      const binHz = FS / N;
      const mag = (k) => Math.hypot(re[k], im[k]);
      const lo = Math.max(1, Math.floor(expect * 0.85 / binHz));
      const hi = Math.min(N / 2 - 2, Math.ceil(expect * 1.15 / binHz));
      let best = lo, bestMag = 0;
      for (let k = lo; k <= hi; k++) { const m = mag(k); if (m > bestMag) { bestMag = m; best = k; } }
      const a = mag(best - 1), b = mag(best), c = mag(best + 1);
      const den = a - 2 * b + c;
      const d = den === 0 ? 0 : 0.5 * (a - c) / den;
      return (best + d) * binHz;
    };
    const render = async (notes) => {
      const ctx = new OfflineAudioContext(1, FS * SECS, FS);
      const master = ctx.createGain();
      master.gain.value = 0.7;
      master.connect(ctx.destination);
      notes.forEach(([midi, when]) => ENGINE.pluckOn(ctx, master, midi, when, 0.22, 2.0));
      const buf = await ctx.startRendering();
      const d = buf.getChannelData(0);
      const f0 = 440 * Math.pow(2, (notes[0][0] - 69) / 12);
      const a1 = goertzel(d, 0.2 * FS, 0.7 * FS, f0);
      const a2 = goertzel(d, 0.8 * FS, 1.3 * FS, f0);
      const t60 = a2 > 0 ? 20 * Math.log10(a1 / a2) : 0;   // 1 秒内的衰减 dB
      return { segs: segments(d), t60: t60 > 0 ? +(60 / t60).toFixed(2) : null };
    };

    // 完整播放链路：pluckOn → AudioBufferSourceNode（带 playbackRate）→ 主音量
    const pitchOf = async (midi) => {
      const ctx = new OfflineAudioContext(1, Math.floor(FS * 1.2), FS);
      const master = ctx.createGain();
      master.gain.value = 0.7;
      master.connect(ctx.destination);
      ENGINE.pluckOn(ctx, master, midi, 0, 0.22, 1.2);
      const buf = await ctx.startRendering();
      const want = 440 * Math.pow(2, (midi - 69) / 12);
      const got = detectF0(buf.getChannelData(0), want);
      return { want: +want.toFixed(2), got: +got.toFixed(2), cents: +(1200 * Math.log2(got / want)).toFixed(2) };
    };

    const pitch = {};
    for (const midi of [40, 45, 50, 55, 59, 64, 69, 72, 76, 81, 88]) pitch[midi] = await pitchOf(midi);
    const single = {};
    for (const midi of [40, 52, 64, 76, 88]) single[midi] = await render([[midi, 0]]);
    const strum = await render([[40, 0], [45, 0.035], [50, 0.07], [55, 0.105], [59, 0.14], [64, 0.175]]);
    return { pitch, single, strum };
  `);

  console.log('音高（相对十二平均律，容差 10 音分）：');
  let offPitch = 0;
  for (const [midi, p] of Object.entries(result.pitch)) {
    const ok = Math.abs(p.cents) < 10;
    if (!ok) offPitch++;
    console.log(
      `  ${ok ? '✅' : '❌'} midi ${midi.padStart(3)}  期望 ${String(p.want).padStart(8)} Hz  实测 ${String(p.got).padStart(8)} Hz  ${p.cents >= 0 ? '+' : ''}${p.cents} 音分`,
    );
  }

  const fmt = (arr) => arr.map((v) => String(v).padStart(10)).join('');
  console.log('\n每格 0.5 秒的峰值（主音量 0.7）：');
  console.log('        ' + ['0-0.5', '0.5-1', '1-1.5', '1.5-2', '2-2.5', '2.5-3', '3-3.5', '3.5-4'].map((s) => s.padStart(10)).join('') + '   基频 T60');
  for (const [midi, r] of Object.entries(result.single)) {
    console.log(`midi ${midi.padStart(3)}${fmt(r.segs)}  ${r.t60 ?? '—'} 秒`);
  }
  console.log(`扫弦  ${fmt(result.strum.segs)}  ${result.strum.t60 ?? '—'} 秒`);

  // 判据 1：第一段之后不允许出现增长（第一段是拨弦瞬态，峰值最高是正常的）
  const rows = [...Object.values(result.single), result.strum].map((r) => r.segs);
  const bad = rows.filter((segs) => segs.some((p, i) => i > 0 && p > segs[i - 1] * 1.0001));
  // 判据 2：音高必须准确（之前整个音阶偏低 255 音分，就是这一条没守住）
  if (offPitch > 0) {
    console.error(`\n❌ ${offPitch} 个音走音超过 10 音分`);
    process.exitCode = 1;
  }
  if (bad.length > 0) {
    console.error(`\n❌ 检测到 ${bad.length} 条环路在增长 —— 反馈增益 ≥ 1，会啸叫`);
    process.exitCode = 1;
  }
  if (offPitch === 0 && bad.length === 0) {
    console.log('\n✅ 音高准确、全部单调衰减，没自激');
  }
} finally {
  ws.close();
  chrome.kill();
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}
