/**
 * 调弦层。
 *
 * 关键设计：存的是**绝对 MIDI 音高**，不是音高类。
 * 这样音频播放、指板取音、变调夹都能共用同一套坐标。
 *
 * 弦索引约定：0 = 6 弦（最粗 / 最低），5 = 1 弦（最细 / 最高）。
 */

import { mod } from './pitch';

export interface Tuning {
  id: string;
  name: string;
  short: string;
  /** 6 根弦的空弦 MIDI 音高，低 → 高 */
  midi: number[];
}

export const TUNINGS: Tuning[] = [
  { id: 'standard', name: '标准调弦', short: 'E A D G B E', midi: [40, 45, 50, 55, 59, 64] },
  { id: 'dropD', name: 'Drop D', short: 'D A D G B E', midi: [38, 45, 50, 55, 59, 64] },
  { id: 'dadgad', name: 'DADGAD', short: 'D A D G A D', midi: [38, 45, 50, 55, 57, 62] },
  { id: 'openD', name: 'Open D', short: 'D A D F# A D', midi: [38, 45, 50, 54, 57, 62] },
  { id: 'facgce', name: 'FACGCE', short: 'F A C G C E', midi: [41, 45, 48, 55, 60, 64] },
];

export const getTuning = (id: string): Tuning => TUNINGS.find((t) => t.id === id) ?? TUNINGS[0];

/**
 * 物理品格 `fret` 处某根弦的实际 MIDI 音高。
 * 变调夹不改变音高，只把可用把位限制在 [capo, ∞) —— 见 isPlayableFret。
 */
export function midiAt(tuning: Tuning, stringIndex: number, fret: number): number {
  return tuning.midi[stringIndex] + fret;
}

export function pcAt(tuning: Tuning, stringIndex: number, fret: number): number {
  return mod(midiAt(tuning, stringIndex, fret));
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** 变调夹所在把位以下的位置按不到 */
export function isPlayableFret(fret: number, capo: number): boolean {
  return fret >= capo;
}
