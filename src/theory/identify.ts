/**
 * 反向识别：指板上按了几个音 → 这是什么和弦。
 *
 * 设计原则：**不假装只有一个答案**。
 * C6 和 Am7 是同一堆音，靠贝斯音和常用度排序，并列返回。
 */

import { mod, pcName } from './pitch';
import { CHORD_TYPES, chordPcs, ChordType } from './chords';

export interface IdentifyCandidate {
  root: number;
  type: ChordType;
  symbol: string;
  name: string;
  score: number;
  /** 非根音贝斯时的转位标记，如 "C/E" */
  inversion: string | null;
  extra: number[];
  missing: number[];
}

export interface IdentifyResult {
  candidates: IdentifyCandidate[];
  pcs: number[];
  bassPc: number | null;
}

const POPULARITY: Record<string, number> = {
  maj: 14,
  min: 14,
  5: 8,
  7: 10,
  m7: 10,
  maj7: 9,
  6: 3,
  m6: 2,
  sus2: 3,
  sus4: 3,
  dim: 2,
  aug: 1,
  dim7: 2,
  m7b5: 3,
  add9: 5,
  madd9: 2,
  9: 4,
  maj9: 3,
  m9: 3,
  '7sus4': 2,
  '6/9': 1,
  '7b9': 2,
  '7#9': 2,
  '7#5': 1,
  '7b5': 1,
  m11: 1,
  11: 1,
  13: 1,
  mMaj7: 1,
  'maj7#11': 1,
  '9sus4': 1,
};

function inversionLabel(bassPc: number, root: number, type: ChordType, flats: boolean): string | null {
  if (bassPc === mod(root)) return null;
  const intervalFromRoot = mod(bassPc - root);
  const idx = type.intervals.findIndex((i) => mod(i) === intervalFromRoot);
  if (idx <= 0) return pcName(bassPc, flats);
  return type.degrees[idx] + ' 音在低音';
}

export function identifyChord(
  pcs: number[],
  bassPc: number | null,
  flats = false,
  limit = 5,
): IdentifyResult {
  const uniq = [...new Set(pcs.map((p) => mod(p)))];
  if (uniq.length < 2) {
    return { candidates: [], pcs: uniq, bassPc };
  }

  const set = new Set(uniq);
  const candidates: IdentifyCandidate[] = [];

  for (let root = 0; root < 12; root++) {
    for (const type of CHORD_TYPES) {
      const cpcs = chordPcs(root, type);
      const cset = new Set(cpcs);

      // 必需音程必须全部在按下的音里
      let ok = true;
      for (const r of type.required) {
        if (!set.has(mod(root + r))) ok = false;
      }
      if (!ok) continue;

      const extra = uniq.filter((p) => !cset.has(p));
      const missing = cpcs.filter((p) => !set.has(p));

      // 多出来的音太多，说明根本不是这个和弦
      if (extra.length > 2) continue;
      // 缺得太多也不行
      if (missing.length > 2) continue;

      let score = 100;
      score -= extra.length * 14;
      score -= missing.length * 7;

      if (bassPc !== null) {
        if (mod(bassPc) === root) score += 12;
        else score -= 5;
      }

      score += (POPULARITY[type.id] ?? 0) * 0.6;

      // 两个音的组合几乎无法确定和弦，整体压低
      if (uniq.length === 2) score -= 40;
      if (uniq.length === 3 && type.intervals.length >= 5) score -= 10;

      candidates.push({
        root,
        type,
        symbol: pcName(root, flats) + type.suffix,
        name: pcName(root, flats) + ' ' + type.name,
        score,
        inversion: bassPc !== null ? inversionLabel(mod(bassPc), root, type, flats) : null,
        extra,
        missing,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol));

  // 同一符号只保留最高分（等和弦会重复）
  const seen = new Set<string>();
  const out: IdentifyCandidate[] = [];
  for (const c of candidates) {
    if (seen.has(c.symbol)) continue;
    seen.add(c.symbol);
    out.push(c);
    if (out.length >= limit) break;
  }

  return { candidates: out, pcs: uniq, bassPc };
}
