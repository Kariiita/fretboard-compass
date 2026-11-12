/**
 * 乐理深度分析：导音线、声部进行、和弦-音阶映射、
 * 调式互换、副属和弦、转调建议。
 */

import { mod, pcName } from './pitch';
import { Chord, CHORD_TYPES, chordPcs, diatonicChords, getChordType, DiatonicChord, makeChord } from './chords';
import { getScale, ScaleDef, scalePitches } from './scales';

// ────────────────────────────────────────────────────────────
// 导音线 Guide Tones
// ────────────────────────────────────────────────────────────

export interface GuideToneSet {
  third: { pc: number; label: string } | null;
  seventh: { pc: number; label: string } | null;
}

/** 三音和七音是和弦的「性格音」，决定和弦色彩与走向 */
export function guideTones(chord: Chord): GuideToneSet {
  const find = (targets: number[]) => {
    const idx = chord.type.intervals.findIndex((i) => targets.includes(mod(i)));
    if (idx < 0) return null;
    const iv = chord.type.intervals[idx];
    return { pc: mod(chord.root + iv), label: chord.type.degrees[idx] };
  };
  return { third: find([3, 4]), seventh: find([10, 11]) };
}

// ────────────────────────────────────────────────────────────
// 声部进行 Voice Leading
// ────────────────────────────────────────────────────────────

export interface VoiceMove {
  from: number;
  to: number;
  semitones: number;
  /** 向上 / 向下 / 保持 */
  direction: 'up' | 'down' | 'same';
}

export interface VoiceLeadingResult {
  common: number[];
  moves: VoiceMove[];
  /** 总移动半音数，越小越平滑 */
  motion: number;
}

/** 计算两个和弦之间的声部移动：共同音保持，其余音找最近的落点 */
export function voiceLeading(a: Chord, b: Chord): VoiceLeadingResult {
  const aPcs = [...new Set(a.pcs)];
  const bPcs = [...new Set(b.pcs)];
  const common = aPcs.filter((p) => bPcs.includes(p));
  const aRest = aPcs.filter((p) => !common.includes(p));
  const bRest = [...bPcs.filter((p) => !common.includes(p))];

  const used = new Set<number>();
  const moves: VoiceMove[] = [];
  for (const from of aRest) {
    let best: number | null = null;
    let bestDist = Infinity;
    for (const to of bRest) {
      if (used.has(to)) continue;
      const up = mod(to - from);
      const down = mod(from - to);
      const dist = Math.min(up, down);
      if (dist < bestDist) {
        bestDist = dist;
        best = to;
      }
    }
    if (best !== null) {
      used.add(best);
      const up = mod(best - from);
      const down = mod(from - best);
      const dir = up <= down ? 'up' : 'down';
      moves.push({ from, to: best, semitones: Math.min(up, down), direction: dir });
    }
  }
  const motion = moves.reduce((s, m) => s + m.semitones, 0);
  return { common, moves, motion };
}

// ────────────────────────────────────────────────────────────
// 和弦 → 可用音阶
// ────────────────────────────────────────────────────────────

const CHORD_SCALE_MAP: Record<string, string[]> = {
  maj: ['major', 'lydian', 'majorPentatonic'],
  min: ['aeolian', 'dorian', 'phrygian', 'minorPentatonic'],
  '5': ['minorPentatonic', 'blues', 'majorPentatonic'],
  dim: ['locrian', 'harmonicMinor'],
  aug: ['melodicMinor'],
  sus2: ['major', 'mixolydian', 'majorPentatonic'],
  sus4: ['major', 'mixolydian', 'majorPentatonic'],
  '6': ['major', 'majorPentatonic', 'mixolydian'],
  m6: ['melodicMinor', 'dorian'],
  '7': ['mixolydian', 'blues', 'majorPentatonic'],
  maj7: ['major', 'lydian'],
  m7: ['dorian', 'aeolian', 'minorPentatonic'],
  m7b5: ['locrian', 'harmonicMinor'],
  dim7: ['locrian', 'harmonicMinor'],
  mMaj7: ['melodicMinor', 'harmonicMinor'],
  add9: ['major', 'majorPentatonic'],
  madd9: ['aeolian', 'dorian'],
  '9': ['mixolydian', 'majorPentatonic'],
  maj9: ['major', 'lydian'],
  m9: ['dorian', 'aeolian'],
  '6/9': ['major', 'majorPentatonic'],
  '11': ['mixolydian'],
  m11: ['dorian'],
  '13': ['mixolydian'],
  '7sus4': ['mixolydian', 'majorPentatonic'],
  '9sus4': ['mixolydian'],
  '7b5': ['mixolydian', 'blues'],
  '7#5': ['melodicMinor'],
  '7b9': ['harmonicMinor'],
  '7#9': ['minorPentatonic', 'blues'],
  'maj7#11': ['lydian'],
};

export interface ChordScaleSuggestion {
  scaleId: string;
  name: string;
  short: string;
  reason: string;
}

/** 给定和弦，推荐能用的音阶（按色彩从「安全」到「进阶」） */
export function chordScaleSuggestions(chord: Chord): ChordScaleSuggestion[] {
  const ids = CHORD_SCALE_MAP[chord.type.id] ?? ['major'];
  return ids
    .filter((id) => getScale(id).id === id || id === 'wholeTone')
    .map((id, i) => {
      const sc = getScale(id);
      return {
        scaleId: id,
        name: sc.id === 'wholeTone' ? '全音音阶' : sc.name,
        short: sc.short,
        reason: i === 0 ? '最贴合、最安全' : i === 1 ? '换个色彩' : '进阶选择',
      };
    });
}

// ────────────────────────────────────────────────────────────
// 调式互换 Modal Interchange
// ────────────────────────────────────────────────────────────

export interface BorrowedChord {
  rootPc: number;
  typeId: string;
  symbol: string;
  label: string;
  note: string;
  source: string;
}

function borrowedFrom(rootPc: number, scale: ScaleDef, flats: boolean): BorrowedChord[] {
  const out: BorrowedChord[] = [];
  const push = (semitones: number, typeId: string, label: string, note: string, source: string) => {
    const root = mod(rootPc + semitones);
    const c = makeChord(root, typeId, flats);
    out.push({ rootPc: root, typeId, symbol: c.symbol, label, note, source });
  };

  if (!scale.minorish) {
    // 从同主音小调借用（自然小调音级：0 2 3 5 7 8 10）
    // bIII / bVI / bVII 惯例用降号记谱，与调号无关
    const pushFlat = (semitones: number, typeId: string, label: string, note: string) => {
      const root = mod(rootPc + semitones);
      const c = makeChord(root, typeId, true);
      out.push({ rootPc: root, typeId, symbol: c.symbol, label, note, source: '同主音小调' });
    };
    pushFlat(0, 'min', 'i', '同主音小调的主和弦，最经典的借用');
    pushFlat(3, 'maj', 'bIII', '大三度代替小三度，色彩瞬间变暗');
    pushFlat(5, 'min', 'iv', '小下属，比 IV 更忧郁');
    pushFlat(7, 'min', 'v', '小属和弦，常用于民谣 / 后摇');
    pushFlat(8, 'maj', 'bVI', '降六级的宽广感');
    pushFlat(10, 'maj', 'bVII', '摇滚最爱的降七级');
  } else {
    // 从同主音大调借用（大调音级：0 2 4 5 7 9 11）
    push(0, 'maj', 'I', '皮卡第三度：结尾用大三和弦收束', '同主音大调');
    push(2, 'min', 'ii', '大调二级小和弦', '同主音大调');
    push(4, 'min', 'iii', '小三度代替 bIII，色彩转亮', '同主音大调');
    push(5, 'maj', 'IV', '大下属，立刻明亮起来', '同主音大调');
    push(7, 'maj', 'V', '大属和弦，制造强解决（和声小调的来源）', '同主音大调');
    push(9, 'min', 'vi', '关系大调的六级', '同主音大调');
  }
  return out;
}

export function modalInterchange(rootPc: number, scale: ScaleDef, flats: boolean): BorrowedChord[] {
  return borrowedFrom(rootPc, scale, flats);
}

// ────────────────────────────────────────────────────────────
// 副属和弦 Secondary Dominants
// ────────────────────────────────────────────────────────────

export function secondaryDominants(diatonic: DiatonicChord[], flats: boolean): BorrowedChord[] {
  const out: BorrowedChord[] = [];
  const romanLabels = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
  for (const d of diatonic) {
    if (d.degreeIndex === 0) continue;
    // V/x = 目标根音上方纯五度的属七和弦
    const domRoot = mod(d.rootPc + 7);
    const c = makeChord(domRoot, '7', flats);
    out.push({
      rootPc: domRoot,
      typeId: '7',
      symbol: c.symbol,
      label: 'V/' + romanLabels[d.degreeIndex].toLowerCase(),
      note: `解决到 ${d.symbol}`,
      source: '副属',
    });
  }
  return out;
}

// ────────────────────────────────────────────────────────────
// 转调建议
// ────────────────────────────────────────────────────────────

export interface ModulationSuggestion {
  targetRoot: number;
  targetMinor: boolean;
  name: string;
  reason: string;
  shared: string[];
  strength: number;
}

function diatonicSet(root: number, scale: ScaleDef): Set<number> {
  return new Set(scalePitches(root, scale));
}

export function modulationSuggestions(
  rootPc: number,
  scale: ScaleDef,
  flats: boolean,
): ModulationSuggestion[] {
  const current = diatonicSet(rootPc, scale);
  const list: { targetRoot: number; minor: boolean; reason: string; bonus: number }[] = [];

  const relativeMinor = mod(rootPc + 9);
  const relativeMajor = mod(rootPc + 3);
  if (scale.minorish) {
    list.push({ targetRoot: relativeMajor, minor: false, reason: '关系大调：只差一个音，最自然的转调', bonus: 25 });
  } else {
    list.push({ targetRoot: relativeMinor, minor: true, reason: '关系小调：共用全部音，转过去毫无痕迹', bonus: 25 });
  }
  list.push({
    targetRoot: rootPc,
    minor: !scale.minorish,
    reason: '同主音大小调：主和弦一换，情绪翻转',
    bonus: 18,
  });

  for (const step of [1, 2, 4, 5]) {
    list.push({
      targetRoot: mod(rootPc + step),
      minor: !!scale.minorish,
      reason: `上行 ${step} 个半音的「卡车司机转调」，直接硬转`,
      bonus: 2,
    });
  }

  // 共同和弦最多的调
  for (let r = 0; r < 12; r++) {
    for (const minor of [false, true]) {
      if (r === rootPc && minor === !!scale.minorish) continue;
      const sc = getScale(minor ? 'aeolian' : 'major');
      const target = diatonicSet(r, sc);
      let shared = 0;
      for (const p of target) if (current.has(p)) shared++;
      if (shared >= 6) {
        list.push({
          targetRoot: r,
          minor,
          reason: `与当前调共享 ${shared} 个音，可用共同和弦平滑过渡`,
          bonus: shared * 2,
        });
      }
    }
  }

  const seen = new Set<string>();
  const out: ModulationSuggestion[] = [];
  for (const item of list) {
    const key = `${item.targetRoot}-${item.minor}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const targetScale = getScale(item.minor ? 'aeolian' : 'major');
    const targetSet = diatonicSet(item.targetRoot, targetScale);
    const sharedNames: string[] = [];
    for (const p of current) if (targetSet.has(p)) sharedNames.push(pcName(p, flats));
    out.push({
      targetRoot: item.targetRoot,
      targetMinor: item.minor,
      name: pcName(item.targetRoot, flats) + (item.minor ? ' 小调' : ' 大调'),
      reason: item.reason,
      shared: sharedNames,
      strength: item.bonus + sharedNames.length,
    });
  }

  out.sort((a, b) => b.strength - a.strength);
  return out.slice(0, 6);
}

// ────────────────────────────────────────────────────────────
// 辅助
// ────────────────────────────────────────────────────────────

export function chordFromSymbolParts(rootPc: number, typeId: string, flats = false): Chord {
  return makeChord(rootPc, typeId, flats);
}

export function chordTypesForRoot(rootPc: number): { typeId: string; symbol: string }[] {
  return CHORD_TYPES.map((t) => ({ typeId: t.id, symbol: pcName(rootPc) + t.suffix }));
}

export function chordToneNames(chord: Chord, flats = false): { degree: string; name: string; pc: number }[] {
  return chord.type.intervals.map((iv, i) => ({
    degree: chord.type.degrees[i],
    name: pcName(mod(chord.root + iv), flats),
    pc: mod(chord.root + iv),
  }));
}

export function diatonicWithSevenths(rootPc: number, scale: ScaleDef, flats: boolean): DiatonicChord[] {
  return diatonicChords(rootPc, scale, true, flats);
}

export const chordTypeName = (id: string) => getChordType(id).name;

export { chordPcs };
