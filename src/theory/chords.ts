/**
 * 和弦层。
 *
 * 核心原则：**不维护 1000 条和弦数据**，只维护 30 多个「类型模板」，
 * 和弦 = 根音 + 类型，音由公式算出来。
 */

import { mod, pcName } from './pitch';
import { isHeptatonic, parentScale, ScaleDef, scalePitches } from './scales';

export interface ChordType {
  id: string;
  /** 和弦符号后缀，如 'm7' */
  suffix: string;
  name: string;
  /** 相对根音的半音偏移 */
  intervals: number[];
  degrees: string[];
  /** 必须在发声里出现的音程（缺了这个音就不算这个和弦） */
  required: number[];
}

export const CHORD_TYPES: ChordType[] = [
  { id: 'maj', suffix: '', name: '大三和弦', intervals: [0, 4, 7], degrees: ['1', '3', '5'], required: [0, 4] },
  { id: 'min', suffix: 'm', name: '小三和弦', intervals: [0, 3, 7], degrees: ['1', 'b3', '5'], required: [0, 3] },
  { id: '5', suffix: '5', name: '强力和弦', intervals: [0, 7], degrees: ['1', '5'], required: [0, 7] },
  { id: 'dim', suffix: '°', name: '减三和弦', intervals: [0, 3, 6], degrees: ['1', 'b3', 'b5'], required: [0, 3, 6] },
  { id: 'aug', suffix: '+', name: '增三和弦', intervals: [0, 4, 8], degrees: ['1', '3', '#5'], required: [0, 4, 8] },
  { id: 'sus2', suffix: 'sus2', name: '挂二和弦', intervals: [0, 2, 7], degrees: ['1', '2', '5'], required: [0, 2] },
  { id: 'sus4', suffix: 'sus4', name: '挂四和弦', intervals: [0, 5, 7], degrees: ['1', '4', '5'], required: [0, 5] },
  { id: '6', suffix: '6', name: '六和弦', intervals: [0, 4, 7, 9], degrees: ['1', '3', '5', '6'], required: [0, 4, 9] },
  { id: 'm6', suffix: 'm6', name: '小六和弦', intervals: [0, 3, 7, 9], degrees: ['1', 'b3', '5', '6'], required: [0, 3, 9] },
  { id: '7', suffix: '7', name: '属七和弦', intervals: [0, 4, 7, 10], degrees: ['1', '3', '5', 'b7'], required: [0, 4, 10] },
  { id: 'maj7', suffix: 'maj7', name: '大七和弦', intervals: [0, 4, 7, 11], degrees: ['1', '3', '5', '7'], required: [0, 4, 11] },
  { id: 'm7', suffix: 'm7', name: '小七和弦', intervals: [0, 3, 7, 10], degrees: ['1', 'b3', '5', 'b7'], required: [0, 3, 10] },
  { id: 'm7b5', suffix: 'm7b5', name: '半减七和弦', intervals: [0, 3, 6, 10], degrees: ['1', 'b3', 'b5', 'b7'], required: [0, 3, 6] },
  { id: 'dim7', suffix: '°7', name: '减七和弦', intervals: [0, 3, 6, 9], degrees: ['1', 'b3', 'b5', 'bb7'], required: [0, 3, 6] },
  { id: 'mMaj7', suffix: 'mMaj7', name: '小大七和弦', intervals: [0, 3, 7, 11], degrees: ['1', 'b3', '5', '7'], required: [0, 3, 11] },
  { id: 'add9', suffix: 'add9', name: '加九和弦', intervals: [0, 2, 4, 7], degrees: ['1', '9', '3', '5'], required: [0, 2, 4] },
  { id: 'madd9', suffix: 'madd9', name: '小加九和弦', intervals: [0, 2, 3, 7], degrees: ['1', '9', 'b3', '5'], required: [0, 2, 3] },
  { id: '9', suffix: '9', name: '属九和弦', intervals: [0, 2, 4, 7, 10], degrees: ['1', '9', '3', '5', 'b7'], required: [0, 4, 10] },
  { id: 'maj9', suffix: 'maj9', name: '大九和弦', intervals: [0, 2, 4, 7, 11], degrees: ['1', '9', '3', '5', '7'], required: [0, 4, 11] },
  { id: 'm9', suffix: 'm9', name: '小九和弦', intervals: [0, 2, 3, 7, 10], degrees: ['1', '9', 'b3', '5', 'b7'], required: [0, 3, 10] },
  { id: '69', suffix: '6/9', name: '六九和弦', intervals: [0, 2, 4, 7, 9], degrees: ['1', '9', '3', '5', '6'], required: [0, 4, 9] },
  { id: '11', suffix: '11', name: '属十一和弦', intervals: [0, 2, 4, 5, 7, 10], degrees: ['1', '9', '3', '11', '5', 'b7'], required: [0, 4, 10] },
  { id: 'm11', suffix: 'm11', name: '小十一和弦', intervals: [0, 2, 3, 5, 7, 10], degrees: ['1', '9', 'b3', '11', '5', 'b7'], required: [0, 3, 10] },
  { id: '13', suffix: '13', name: '属十三和弦', intervals: [0, 2, 4, 5, 7, 9, 10], degrees: ['1', '9', '3', '11', '5', '13', 'b7'], required: [0, 4, 10] },
  { id: '7sus4', suffix: '7sus4', name: '属七挂四', intervals: [0, 5, 7, 10], degrees: ['1', '4', '5', 'b7'], required: [0, 5, 10] },
  { id: '9sus4', suffix: '9sus4', name: '属九挂四', intervals: [0, 2, 5, 7, 10], degrees: ['1', '9', '4', '5', 'b7'], required: [0, 5, 10] },
  { id: '7b5', suffix: '7b5', name: '属七降五', intervals: [0, 4, 6, 10], degrees: ['1', '3', 'b5', 'b7'], required: [0, 4, 10] },
  { id: '7#5', suffix: '7#5', name: '属七升五', intervals: [0, 4, 8, 10], degrees: ['1', '3', '#5', 'b7'], required: [0, 4, 10] },
  { id: '7b9', suffix: '7b9', name: '属七降九', intervals: [0, 1, 4, 7, 10], degrees: ['1', 'b9', '3', '5', 'b7'], required: [0, 4, 10] },
  { id: '7#9', suffix: '7#9', name: '属七升九', intervals: [0, 3, 4, 7, 10], degrees: ['1', '#9', '3', '5', 'b7'], required: [0, 4, 10] },
  { id: 'maj7#11', suffix: 'maj7#11', name: '大七升十一', intervals: [0, 4, 6, 7, 11], degrees: ['1', '3', '#11', '5', '7'], required: [0, 4, 11] },
];

export const getChordType = (id: string): ChordType => CHORD_TYPES.find((t) => t.id === id) ?? CHORD_TYPES[0];

/**
 * 听感上算「小和弦」的类型：带小三度、不带大三度。
 * 五度圈的內圈用它决定该亮外圈还是内圈（Am 亮内圈，A7 亮外圈）。
 */
export function isMinorChordType(typeId: string): boolean {
  const iv = getChordType(typeId).intervals;
  return iv.includes(3) && !iv.includes(4);
}

/**
 * 「听起来更厚」的同根音替换建议。
 *
 * 只放同根音的变体（G7 → G9 / G13 / G7b9…），不动根音：
 * 换根音属于和声重编配（三全音替代、副属和弦），那是弹窗里根音选择器的事。
 * 键是原和弦类型，值按「常用程度」排序，UI 截前几个用。
 */
const SUBSTITUTIONS: Record<string, string[]> = {
  maj: ['maj7', 'maj9', '6', '69', 'add9', 'maj7#11'],
  min: ['m7', 'm9', 'm11', 'm6', 'madd9', 'mMaj7'],
  '5': ['7', 'add9'],
  dim: ['dim7', 'm7b5'],
  aug: ['7#5'],
  sus2: ['add9', 'sus4', '9sus4'],
  sus4: ['7sus4', '9sus4', 'sus2'],
  '6': ['69', 'maj7', 'maj9'],
  m6: ['m7', 'm9', 'm11'],
  '7': ['9', '13', '7b9', '7#9', '7sus4', '9sus4', '7#5', '7b5'],
  maj7: ['maj9', 'maj7#11', '69', '6'],
  m7: ['m9', 'm11', 'm6'],
  m7b5: ['dim7', '7b9'],
  dim7: ['m7b5', '7b9'],
  mMaj7: ['m6', 'm9'],
  add9: ['maj9', '69', 'maj7'],
  madd9: ['m9', 'm6', 'm7'],
  '9': ['13', '7b9', '7#9', '9sus4'],
  maj9: ['maj7#11', '69', 'maj7'],
  m9: ['m11', 'm7', 'm6'],
  '69': ['maj9', 'maj7', '6'],
  '11': ['13', '9', '7sus4'],
  m11: ['m9', 'm7'],
  '13': ['9', '7b9', '7#9'],
  '7sus4': ['9sus4', 'sus4', '7'],
  '9sus4': ['7sus4', '9'],
  '7b5': ['7', '7#5', '13'],
  '7#5': ['7', '7#9', '7b5'],
  '7b9': ['7#9', '7b5', '13'],
  '7#9': ['7b9', '13', '7#5'],
  'maj7#11': ['maj9', 'maj7'],
};

/**
 * 某个和弦类型的常见高级替换。
 * 数据写错时宁可不显示，也不要让 getChordType 静默退化成大三和弦。
 */
export function commonSubstitutions(typeId: string): ChordType[] {
  const seen = new Set<string>();
  const out: ChordType[] = [];
  for (const id of SUBSTITUTIONS[typeId] ?? []) {
    if (id === typeId || seen.has(id)) continue;
    const type = CHORD_TYPES.find((t) => t.id === id);
    if (!type) continue;
    seen.add(id);
    out.push(type);
  }
  return out;
}

export interface Chord {
  root: number;
  type: ChordType;
  pcs: number[];
  symbol: string;
  name: string;
}

export function chordPcs(rootPc: number, type: ChordType): number[] {
  return type.intervals.map((i) => mod(rootPc + i));
}

/**
 * 试听用：根音位置的和弦音 MIDI（根音落在 C3..B3 这一带）。
 *
 * 必须是纯函数并且带上 rootPc —— 之前三处播放都写死 `48 + 音程`，
 * 进行里点 G 和弦听到的却是 C 和弦，指板上高亮 G、耳朵里是 C。
 * 所有「点一下听这个和弦」的地方都从这里取音，别再手写 48。
 */
export function closeVoicingMidis(rootPc: number, type: ChordType, base = 48): number[] {
  return type.intervals.map((iv) => base + rootPc + iv);
}

export function makeChord(rootPc: number, typeId: string, flats = false): Chord {
  const type = getChordType(typeId);
  return {
    root: mod(rootPc),
    type,
    pcs: chordPcs(rootPc, type),
    symbol: pcName(rootPc, flats) + type.suffix,
    name: pcName(rootPc, flats) + ' ' + type.name,
  };
}

/** pc → 相对和弦根音的音程标签，如 Cmaj7 的 E → '3' */
export function chordDegreeMap(chord: Chord): Map<number, string> {
  const m = new Map<number, string>();
  chord.type.intervals.forEach((iv, i) => m.set(mod(chord.root + iv), chord.type.degrees[i]));
  return m;
}

// ────────────────────────────────────────────────────────────
// 调内和弦（七和弦 / 三和弦）
// ────────────────────────────────────────────────────────────

export interface DiatonicChord {
  degreeIndex: number; // 0-6
  roman: string;       // I / ii / iii° ...
  rootPc: number;
  typeId: string;
  symbol: string;
  name: string;
}

const TRIAD_LOOKUP: Record<string, string> = {
  '0,4,7': 'maj',
  '0,3,7': 'min',
  '0,3,6': 'dim',
  '0,4,8': 'aug',
  '0,2,7': 'sus2',
  '0,5,7': 'sus4',
};

const SEVENTH_LOOKUP: Record<string, string> = {
  '0,4,7,11': 'maj7',
  '0,4,7,10': '7',
  '0,3,7,10': 'm7',
  '0,3,6,10': 'm7b5',
  '0,3,6,9': 'dim7',
  '0,3,7,11': 'mMaj7',
  '0,4,8,11': 'maj7#5',
};

function lookupType(intervals: number[]): string {
  const key = intervals.map((i) => mod(i)).join(',');
  return TRIAD_LOOKUP[key] ?? SEVENTH_LOOKUP[key] ?? 'maj';
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

function romanFor(degreeIndex: number, typeId: string, seventh: boolean): string {
  const base = ROMAN[degreeIndex];
  const minorish = typeId === 'min' || typeId === 'm7' || typeId === 'm7b5' || typeId === 'dim' || typeId === 'dim7';
  const lower = minorish ? base.toLowerCase() : base;
  let out = lower;
  if (typeId === 'dim') out += '°';
  if (typeId === 'dim7') out += '°7';
  if (typeId === 'm7b5') out += 'ø7';
  if (typeId === 'aug') out += '+';
  if (typeId === 'maj7') out += 'maj7';
  if (typeId === 'm7') out = base.toLowerCase() + '7';
  if (typeId === '7') out = base + '7';
  if (typeId === 'mMaj7') out = base.toLowerCase() + 'maj7';
  if (seventh && !/7/.test(out)) out += '7';
  return out;
}

/**
 * 由七声音阶堆三度得到调内和弦。
 * @param seventh true = 七和弦，false = 三和弦
 */
export function diatonicChords(rootPc: number, scale: ScaleDef, seventh = false, flats = false): DiatonicChord[] {
  const sc = isHeptatonic(scale) ? scale : parentScale(scale);
  if (!isHeptatonic(sc)) return [];
  const iv = sc.intervals;
  const out: DiatonicChord[] = [];
  for (let i = 0; i < 7; i++) {
    const r = iv[i];
    const third = iv[(i + 2) % 7] + (i + 2 >= 7 ? 12 : 0);
    const fifth = iv[(i + 4) % 7] + (i + 4 >= 7 ? 12 : 0);
    const sev = iv[(i + 6) % 7] + (i + 6 >= 7 ? 12 : 0);
    const offsets = seventh
      ? [0, mod(third - r), mod(fifth - r), mod(sev - r)]
      : [0, mod(third - r), mod(fifth - r)];
    const typeId = lookupType(offsets);
    const root = mod(rootPc + r);
    const type = getChordType(typeId);
    out.push({
      degreeIndex: i,
      roman: romanFor(i, typeId, seventh),
      rootPc: root,
      typeId,
      symbol: pcName(root, flats) + type.suffix,
      name: pcName(root, flats) + ' ' + type.name,
    });
  }
  return out;
}

/** 由音高类集合反查最贴近的和弦类型（用于逆向推导辅助） */
export function typeFromIntervals(intervals: number[]): ChordType {
  return getChordType(lookupType(intervals));
}
