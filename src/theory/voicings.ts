/**
 * 指型搜索层。
 *
 * 这里**不写死 CAGED 偏移表**，而是用通用的「按音高搜指型」算法。
 * 原因：CAGED 模板只在标准调弦下成立。DADGAD / FACGCE 的相邻弦音程
 * 与标准调弦不同，套模板会算错音。通用搜索对任意调弦、任意变调夹都成立。
 *
 * 代价是算得慢一点，所以结果用 useMemo 缓存。
 */

import { mod } from './pitch';
import { Chord } from './chords';
import { pcAt, Tuning } from './tuning';

export interface Voicing {
  /** 长度 6，索引 0 = 6 弦；null = 不弹 */
  frets: (number | null)[];
  minFret: number;
  maxFret: number;
  span: number;
  sounding: number;
  bassPc: number | null;
  score: number;
}

export interface VoicingOptions {
  maxFret?: number;
  maxSpan?: number;
  minStrings?: number;
  /** 变调夹限制：可从 max(capo, minFret) 起算 */
  minFret?: number;
  /** 只接受贝斯音为根音的指型 */
  rootBassOnly?: boolean;
}

const DEFAULT: Required<VoicingOptions> = {
  maxFret: 15,
  maxSpan: 4,
  minStrings: 4,
  minFret: 0,
  rootBassOnly: false,
};

/**
 * 在给定调弦 / 变调夹下，搜索所有「能按出来」的和弦指型。
 *
 * 约束：
 *  - 至少 minStrings 根弦发声
 *  - 所有 required 音程必须出现
 *  - 品格跨度 ≤ maxSpan
 *  - 不同品格数 ≤ 4（近似「手指数」，横按算一个）
 */
export function findVoicings(chord: Chord, tuning: Tuning, capo: number, opts: VoicingOptions = {}): Voicing[] {
  const o = { ...DEFAULT, ...opts };
  const lo = Math.max(o.minFret, capo);

  const pcs = new Set(chord.pcs);
  const required = chord.type.required.map((i) => mod(chord.root + i));

  const candidates: (number | null)[][] = [];
  for (let s = 0; s < 6; s++) {
    const list: (number | null)[] = [null];
    for (let f = lo; f <= o.maxFret; f++) {
      if (pcs.has(pcAt(tuning, s, f))) list.push(f);
    }
    candidates.push(list);
  }

  const out: Voicing[] = [];
  const seen = new Set<string>();
  const frets: (number | null)[] = new Array(6).fill(null);

  const rec = (s: number, sounding: number, minF: number, maxF: number) => {
    if (sounding + (6 - s) < o.minStrings) return;

    if (s === 6) {
      if (sounding < o.minStrings) return;

      const pcsHere = new Set<number>();
      let bass: number | null = null;
      const fretVals = new Set<number>();
      for (let i = 0; i < 6; i++) {
        const f = frets[i];
        if (f === null) continue;
        const pc = pcAt(tuning, i, f);
        pcsHere.add(pc);
        if (bass === null) bass = pc;
        if (f > 0) fretVals.add(f);
      }
      for (const r of required) if (!pcsHere.has(r)) return;
      if (o.rootBassOnly && bass !== chord.root) return;

      // 手指数近似：不同品格数（横按只算一根手指）
      if (fretVals.size > 4) return;

      const key = frets.join(',');
      if (seen.has(key)) return;
      seen.add(key);

      const realMin = isFinite(minF) ? minF : 0;
      const realMax = isFinite(maxF) ? maxF : 0;
      const span = realMax - realMin;
      let score = 0;
      if (bass === chord.root) score += 55;
      score += 9 * pcsHere.size;
      score -= 5 * (6 - sounding);
      score -= 6 * span;
      if (realMin === 0) score += 8;
      score -= 7 * Math.max(0, fretVals.size - 3);
      // 高把位略微扣分：低把位更常用、更好按
      score -= realMin * 0.25;

      out.push({
        frets: frets.slice(),
        minFret: realMin,
        maxFret: realMax,
        span,
        sounding,
        bassPc: bass,
        score,
      });
      if (out.length > 60000) return;
      return;
    }

    for (const f of candidates[s]) {
      if (f === null) {
        frets[s] = null;
        rec(s + 1, sounding, minF, maxF);
      } else {
        const nMin = Math.min(minF, f);
        const nMax = Math.max(maxF, f);
        if (nMax - nMin > o.maxSpan) continue;
        frets[s] = f;
        rec(s + 1, sounding + 1, nMin, nMax);
      }
      frets[s] = null;
    }
  };

  // minF/maxF 用 ±Infinity 起手：前几根弦如果是闷音，不能把 0 品算进跨度
  rec(0, 0, Infinity, -Infinity);

  out.sort((a, b) => b.score - a.score);
  return out;
}

/**
 * 把指型按把位聚类，挑出每个把位最值得展示的一个。
 * 用于「框出所有能弹的 box」。
 */
export function selectPositions(voicings: Voicing[], maxCount = 5): Voicing[] {
  const picked: Voicing[] = [];
  for (const v of voicings) {
    const samePosition = picked.some((p) => {
      const overlap = Math.min(p.maxFret, v.maxFret) - Math.max(p.minFret, v.minFret);
      if (overlap > 0) return true;
      // 品区只在一条品丝上相接时（例如 0-3 与 3-5），如果按压位置有大半重合，
      // 说明是同一个把位的另一种指法，不该再单独出一个框。
      const shared = v.frets.filter((f, s) => f !== null && p.frets[s] === f).length;
      return shared >= 2;
    });
    if (samePosition) continue;
    picked.push(v);
    if (picked.length >= maxCount) break;
  }
  return picked.sort((a, b) => a.minFret - b.minFret);
}

/** 指型 → 实际 MIDI 音高列表，供音频播放 */
export function voicingMidis(v: Voicing, tuning: Tuning): number[] {
  const out: number[] = [];
  v.frets.forEach((f, i) => {
    if (f !== null) out.push(tuning.midi[i] + f);
  });
  return out.sort((a, b) => a - b);
}
