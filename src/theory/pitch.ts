/**
 * 音高基础层 —— 全部是纯函数，不依赖任何 UI。
 * 约定：PitchClass 用 0-11，0 = C。
 */

export type PitchClass = number;

export const NOTES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
export const NOTES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

export const mod = (n: number, m = 12): number => ((n % m) + m) % m;

/** 音高类 → 音名 */
export function pcName(pc: number, flats = false): string {
  return (flats ? NOTES_FLAT : NOTES_SHARP)[mod(pc)];
}

/** 根据调性决定用升号还是降号记谱 */
export function keyUsesFlats(rootPc: number, minor = false): boolean {
  const pc = mod(rootPc);
  // 大调：F Bb Eb Ab Db Gb
  if (!minor) return [5, 10, 3, 8, 1, 6].includes(pc);
  // 小调：Dm Gm Cm Fm Bbm Ebm Abm
  return [2, 7, 0, 5, 10, 3, 8].includes(pc);
}

/** "C#"/"Db" → 0-11，非法输入返回 null */
export function parseNoteName(name: string): number | null {
  const iSharp = NOTES_SHARP.indexOf(name as (typeof NOTES_SHARP)[number]);
  if (iSharp >= 0) return iSharp;
  const iFlat = NOTES_FLAT.indexOf(name as (typeof NOTES_FLAT)[number]);
  if (iFlat >= 0) return iFlat;
  return null;
}

/** 解析 "3" / "b3" / "#5" 这类音级写法为半音数 */
export function parseDegree(deg: string): number {
  const m = /^([b#]?)(\d+)$/.exec(deg);
  if (!m) return 0;
  const acc = m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0;
  const d = parseInt(m[2], 10);
  const base: Record<number, number> = { 1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11, 8: 12, 9: 14 };
  return (base[d] ?? 0) + acc;
}
