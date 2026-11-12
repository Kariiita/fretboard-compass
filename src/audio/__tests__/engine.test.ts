import { describe, expect, it } from 'vitest';
import {
  KS,
  BiquadCoefficients,
  TIMBRE,
  biquadCoefficients,
  feedbackFor,
  renderPluck,
} from '../engine';
import { midiToFreq } from '../../theory/tuning';

/**
 * 验证「环路增益小于 1」，这是防啸叫的护栏。
 *
 * 2026-11 翻车记录：第一版直接把 Q 塞给 BiquadFilterNode，按 RBJ 的线性 Q
 * 算出来一切正常，但 Web Audio 的 lowpass/highpass 是按 **dB** 解释 Q 的，
 * Q=0.5 → 实际峰值 1.2015，反馈 0.965 × 1.2015 = 1.16 > 1 → 点播放就啸叫。
 *
 * 所以现在 engine 自己算 RBJ 系数喂 IIRFilterNode，**测试直接 import 那份系数**，
 * 不再自己复制一套公式 —— 否则测试和线上各说各话。
 */

const FS = 48000;

/** 用线上同一份系数算 |H(f)| */
function magnitude(c: BiquadCoefficients, f: number): number {
  const w = (2 * Math.PI * f) / FS;
  const [b0, b1, b2] = c.feedforward;
  const [, a1, a2] = c.feedback;
  const re = b0 + b1 * Math.cos(w) + b2 * Math.cos(2 * w);
  const im = -(b1 * Math.sin(w) + b2 * Math.sin(2 * w));
  const dre = 1 + a1 * Math.cos(w) + a2 * Math.cos(2 * w);
  const dim = -(a1 * Math.sin(w) + a2 * Math.sin(2 * w));
  return Math.hypot(re, im) / Math.hypot(dre, dim);
}

describe('Karplus-Strong 环路稳定性', () => {
  /** 吉他实际会发的音：midi 40（低音 E2）到 88（高音 E6） */
  const guitarRange = Array.from({ length: 49 }, (_, i) => 40 + i);

  const sweep = [
    0.1, 20, 41, 60, 82, 110, 147, 196, 247, 330, 440, 587, 784, 988, 1319, 2000, 4000, 8000, 16000,
  ];

  it('环路增益在所有频率上都小于 1（否则会自激啸叫）', () => {
    for (const cutoff of [KS.dampMinHz, 3000, KS.dampMaxHz]) {
      const lp = biquadCoefficients('lowpass', cutoff, KS.dampQ, FS);
      const hp = biquadCoefficients('highpass', KS.dcHz, KS.dcQ, FS);
      for (const midi of guitarRange) {
        const g = feedbackFor(midiToFreq(midi));
        for (const f of sweep) {
          expect(g * magnitude(lp, f) * magnitude(hp, f)).toBeLessThan(1);
        }
      }
    }
  });

  it('反馈增益随音高变化，但永远小于 1', () => {
    let prev = 0;
    for (const midi of guitarRange) {
      const g = feedbackFor(midiToFreq(midi));
      expect(g).toBeLessThan(1);
      expect(g).toBeGreaterThan(0.9);
      expect(g).toBeGreaterThanOrEqual(prev);
      prev = g;
    }
    // 低音 E2 和 高音 E6 的每周期衰减差别很大 —— 写死常数就必然有一端是错的
    expect(feedbackFor(midiToFreq(88)) - feedbackFor(midiToFreq(40))).toBeGreaterThan(0.02);
  });

  it('每个音的衰减时长都在目标值附近（不会高音秒没 / 低音轰不散）', () => {
    for (const midi of guitarRange) {
      const freq = midiToFreq(midi);
      const g = feedbackFor(freq);
      const periodsPerSecond = freq;
      // 到 -60 dB 需要的秒数
      const t60 = (-3 / Math.log10(g)) / periodsPerSecond;
      expect(t60).toBeGreaterThan(KS.t60 * 0.8);
      expect(t60).toBeLessThan(KS.t60 * 1.25);
    }
  });

  it('低通没有谐振峰：无论截止频率在哪，峰值增益都不超过 1', () => {
    for (const cutoff of [500, KS.dampMinHz, 3000, KS.dampMaxHz]) {
      const lp = biquadCoefficients('lowpass', cutoff, KS.dampQ, FS);
      let peak = 0;
      for (let f = 10; f < 20000; f += 5) peak = Math.max(peak, magnitude(lp, f));
      expect(peak).toBeLessThan(1.001);
    }
  });

  it('Q 是线性 Q，必须 ≤ 1/√2（巴特沃斯）；再高就有谐振峰', () => {
    // 这条防的是「有人觉得 Q 越大越像吉他」然后把环路调自激
    expect(KS.dampQ).toBeLessThanOrEqual(Math.SQRT1_2 + 1e-9);
    expect(KS.dampQ).toBeGreaterThan(0);
    expect(KS.dcQ).toBeLessThanOrEqual(Math.SQRT1_2 + 1e-9);
    // 反证：线性 Q 到 1 时截止点附近确实会冒尖，说明这个上限不是摆设
    const resonant = biquadCoefficients('lowpass', 3000, 1, FS);
    let peak = 0;
    for (let f = 10; f < 20000; f += 5) peak = Math.max(peak, magnitude(resonant, f));
    expect(peak).toBeGreaterThan(1.15);
  });

  it('隔直高通把直流掐掉了（低通对直流增益是 1，不掐就会累积 25 倍）', () => {
    const hp = biquadCoefficients('highpass', KS.dcHz, KS.dcQ, FS);
    expect(magnitude(hp, 0.1)).toBeLessThan(0.001);
    // 但吉他最低音（Drop D 的 D2 ≈ 73 Hz）几乎不衰减
    expect(magnitude(hp, 73)).toBeGreaterThan(0.97);
    // 低通对直流必须是 1，否则「积累 25 倍」这个说法就不成立
    expect(magnitude(biquadCoefficients('lowpass', 3000, KS.dampQ, FS), 0.1)).toBeCloseTo(1, 3);
  });

  it('反馈增益本身小于 1（留了余量给滤波器的数值误差）', () => {
    expect(KS.maxFeedback).toBeGreaterThan(0.99);
    expect(KS.maxFeedback).toBeLessThan(1);
    for (const midi of guitarRange) {
      expect(feedbackFor(midiToFreq(midi))).toBeLessThanOrEqual(KS.maxFeedback);
    }
  });

  it('固定音色的后处理参数在安全范围内', () => {
    // 削波量和混响都只是环外后处理，但参数写飞了仍会很难听
    expect(TIMBRE.id).toBe('steel');
    expect(TIMBRE.drive).toBeGreaterThanOrEqual(0);
    expect(TIMBRE.drive).toBeLessThan(1);
    expect(TIMBRE.reverb).toBeGreaterThanOrEqual(0);
    expect(TIMBRE.reverb).toBeLessThan(1);
    expect(TIMBRE.toneHz).toBeGreaterThan(1000);
    expect(TIMBRE.highpassHz).toBeGreaterThan(0);
    expect(TIMBRE.level).toBeGreaterThan(0.5);
    expect(TIMBRE.level).toBeLessThan(2);
  });
});

/**
 * 测基频：Hann 窗 + 零填充 FFT + 抛物线插值，只在期望值附近 ±15% 里找峰。
 *
 * 为什么不用自相关 / YIN：KS 是衰减 + 谐波丰富的信号，
 * 自相关在低音上会锁到次谐波（实测把 85.88 Hz 报成 81.6 Hz），
 * 高音段能量已经衰减，清晰度 0.05 以下，报出 67 Hz 这种离谱值。
 * 0.4 秒窗 + 2^18 零填充的分辨率是 0.18 Hz，插值后误差远小于 1 音分。
 *
 * 只在期望附近找峰而不是全局最大：KS 的二次、三次谐波经常比基频响，
 * 全局取最大会测到高八度（这个坑之前踩过）。
 */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k];
        const ai = im[i + k];
        const br = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const bi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ar + br;
        im[i + k] = ai + bi;
        re[i + k + len / 2] = ar - br;
        im[i + k + len / 2] = ai - bi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

function detectF0(data: Float32Array, fs: number, expect: number): number {
  const N = 1 << 18;
  const take = Math.min(Math.floor(fs * 0.4), data.length);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let i = 0; i < take; i++) {
    re[i] = data[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (take - 1)));
  }
  fft(re, im);

  const binHz = fs / N;
  const mag = (k: number) => Math.hypot(re[k], im[k]);
  const lo = Math.max(1, Math.floor((expect * 0.85) / binHz));
  const hi = Math.min(N / 2 - 2, Math.ceil((expect * 1.15) / binHz));
  let best = lo;
  let bestMag = 0;
  for (let k = lo; k <= hi; k++) {
    const m = mag(k);
    if (m > bestMag) {
      bestMag = m;
      best = k;
    }
  }
  const a = mag(best - 1);
  const b = mag(best);
  const c = mag(best + 1);
  const den = a - 2 * b + c;
  const d = den === 0 ? 0 : (0.5 * (a - c)) / den;
  return (best + d) * binHz;
}

describe('拨弦波形（renderPluck）', () => {
  const FS = 48000;

  it('音高精确：从低音 E2 到高音 E6，实际听到的误差都小于 10 音分', () => {
    for (const midi of [40, 45, 52, 59, 64, 72, 76, 81, 88]) {
      const want = midiToFreq(midi);
      const wave = renderPluck(want, FS, 1.2);
      // 缓冲区按整数周期合成，真正的音高 = 基频 × 播放速率
      const heard = detectF0(wave.data, FS, want) * wave.rate;
      const cents = 1200 * Math.log2(heard / want);
      expect(
        Math.abs(cents),
        `midi ${midi}：期望 ${want.toFixed(2)} Hz，缓冲 ${(heard / wave.rate).toFixed(2)} Hz × ${wave.rate.toFixed(5)} = ${heard.toFixed(2)} Hz（${cents.toFixed(1)} 音分）`,
      ).toBeLessThan(10);
    }
  });

  it('播放速率的校准量很小（整数周期本身就已经很接近目标）', () => {
    for (const midi of [40, 52, 64, 76, 88]) {
      const wave = renderPluck(midiToFreq(midi), FS, 1.2);
      expect(wave.rate).toBeGreaterThan(0.85);
      expect(wave.rate).toBeLessThan(1.15);
    }
  });

  it('衰减自然：不会越弹越响，2 秒后基本消失', () => {
    const { data } = renderPluck(midiToFreq(52), FS, KS.bufferSeconds);
    const seg = (a: number, b: number) => {
      let sum = 0;
      for (let i = Math.floor(a * FS); i < Math.floor(b * FS); i++) sum += data[i] * data[i];
      return Math.sqrt(sum / ((b - a) * FS));
    };
    const rms = [seg(0.05, 0.25), seg(0.5, 0.7), seg(1.0, 1.2), seg(1.8, 2.0)];
    for (let i = 1; i < rms.length; i++) expect(rms[i]).toBeLessThan(rms[i - 1]);
    // 尾音要衰减到听不见，但不至于一秒就没
    expect(rms[2]).toBeGreaterThan(rms[0] * 0.01);
    expect(rms[3]).toBeLessThan(rms[0] * 0.05);
  });

  it('高音也不会秒没（环内没有分数延迟，不额外吃高频）', () => {
    const { data } = renderPluck(midiToFreq(88), FS, KS.bufferSeconds);
    const seg = (a: number, b: number) => {
      let sum = 0;
      for (let i = Math.floor(a * FS); i < Math.floor(b * FS); i++) sum += data[i] * data[i];
      return Math.sqrt(sum / ((b - a) * FS));
    };
    const early = seg(0.05, 0.2);
    const late = seg(0.9, 1.1);
    expect(late).toBeGreaterThan(early * 0.01);
    expect(late).toBeLessThan(early);
  });

  it('峰值归一化到 0.95，所有音一样响', () => {
    for (const midi of [40, 64, 88]) {
      const { data } = renderPluck(midiToFreq(midi), FS, 1.0);
      let peak = 0;
      for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
      expect(peak).toBeCloseTo(0.95, 2);
    }
  });

  it('采样率变化后音高依然准确（44.1k）', () => {
    const fs = 44100;
    const want = midiToFreq(45);
    const wave = renderPluck(want, fs, 1.2);
    const heard = detectF0(wave.data, fs, want) * wave.rate;
    const cents = 1200 * Math.log2(heard / want);
    expect(Math.abs(cents)).toBeLessThan(10);
  });
});
