/** 音阶模板库 —— 音阶 = 一组相对根音的半音偏移 */

import { mod } from './pitch';

export interface ScaleDef {
  id: string;
  name: string;
  short: string;
  intervals: number[];
  degrees: string[];
  /** 是否属于小调色彩（用于决定降号记谱、并行大小调等） */
  minorish?: boolean;
}

export const SCALES: ScaleDef[] = [
  {
    id: 'major',
    name: '大调（伊奥尼亚）',
    short: 'Major',
    intervals: [0, 2, 4, 5, 7, 9, 11],
    degrees: ['1', '2', '3', '4', '5', '6', '7'],
  },
  {
    id: 'aeolian',
    name: '自然小调（爱奥利亚）',
    short: 'Natural Minor',
    intervals: [0, 2, 3, 5, 7, 8, 10],
    degrees: ['1', '2', 'b3', '4', '5', 'b6', 'b7'],
    minorish: true,
  },
  {
    id: 'dorian',
    name: '多利亚',
    short: 'Dorian',
    intervals: [0, 2, 3, 5, 7, 9, 10],
    degrees: ['1', '2', 'b3', '4', '5', '6', 'b7'],
    minorish: true,
  },
  {
    id: 'phrygian',
    name: '弗里几亚',
    short: 'Phrygian',
    intervals: [0, 1, 3, 5, 7, 8, 10],
    degrees: ['1', 'b2', 'b3', '4', '5', 'b6', 'b7'],
    minorish: true,
  },
  {
    id: 'lydian',
    name: '利底亚',
    short: 'Lydian',
    intervals: [0, 2, 4, 6, 7, 9, 11],
    degrees: ['1', '2', '3', '#4', '5', '6', '7'],
  },
  {
    id: 'mixolydian',
    name: '混合利底亚',
    short: 'Mixolydian',
    intervals: [0, 2, 4, 5, 7, 9, 10],
    degrees: ['1', '2', '3', '4', '5', '6', 'b7'],
  },
  {
    id: 'locrian',
    name: '洛克里亚',
    short: 'Locrian',
    intervals: [0, 1, 3, 5, 6, 8, 10],
    degrees: ['1', 'b2', 'b3', '4', 'b5', 'b6', 'b7'],
    minorish: true,
  },
  {
    id: 'harmonicMinor',
    name: '和声小调',
    short: 'Harmonic Minor',
    intervals: [0, 2, 3, 5, 7, 8, 11],
    degrees: ['1', '2', 'b3', '4', '5', 'b6', '7'],
    minorish: true,
  },
  {
    id: 'melodicMinor',
    name: '旋律小调（爵士）',
    short: 'Melodic Minor',
    intervals: [0, 2, 3, 5, 7, 9, 11],
    degrees: ['1', '2', 'b3', '4', '5', '6', '7'],
    minorish: true,
  },
  {
    id: 'majorPentatonic',
    name: '大调五声',
    short: 'Major Pent',
    intervals: [0, 2, 4, 7, 9],
    degrees: ['1', '2', '3', '5', '6'],
  },
  {
    id: 'minorPentatonic',
    name: '小调五声',
    short: 'Minor Pent',
    intervals: [0, 3, 5, 7, 10],
    degrees: ['1', 'b3', '4', '5', 'b7'],
    minorish: true,
  },
  {
    id: 'blues',
    name: '布鲁斯音阶',
    short: 'Blues',
    intervals: [0, 3, 5, 6, 7, 10],
    degrees: ['1', 'b3', '4', 'b5', '5', 'b7'],
    minorish: true,
  },
  {
    id: 'majorBlues',
    name: '大调布鲁斯',
    short: 'Major Blues',
    intervals: [0, 2, 3, 4, 7, 9],
    degrees: ['1', '2', 'b3', '3', '5', '6'],
  },
];

export const getScale = (id: string): ScaleDef => SCALES.find((s) => s.id === id) ?? SCALES[0];

export function scalePitches(rootPc: number, scale: ScaleDef): number[] {
  return scale.intervals.map((i) => mod(rootPc + i));
}

/** pc → { 音级标记, 相对根音半音数 } */
export function degreeMap(rootPc: number, scale: ScaleDef): Map<number, { degree: string; interval: number }> {
  const m = new Map<number, { degree: string; interval: number }>();
  scale.intervals.forEach((iv, i) => {
    m.set(mod(rootPc + iv), { degree: scale.degrees[i], interval: iv });
  });
  return m;
}

export const isHeptatonic = (scale: ScaleDef): boolean => scale.intervals.length === 7;

/**
 * 和弦进行要用七声音阶来堆三度。
 * 选了五声/布鲁斯时，退回它所属的七声母音阶。
 */
export function parentScale(scale: ScaleDef): ScaleDef {
  if (isHeptatonic(scale)) return scale;
  if (scale.minorish) return getScale('aeolian');
  return getScale('major');
}

export type DegreeClass = 'root' | 'third' | 'fifth' | 'seventh' | 'other';

/** 半音数 → 和声功能分类（用于着色） */
export function intervalClass(interval: number): DegreeClass {
  const i = mod(interval);
  if (i === 0) return 'root';
  if (i === 3 || i === 4) return 'third';
  if (i === 6 || i === 7 || i === 8) return 'fifth';
  if (i === 10 || i === 11) return 'seventh';
  return 'other';
}
