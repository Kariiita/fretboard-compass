/**
 * 模型层：把 UI 状态翻译成指板需要的一切。
 * 所有派生计算集中在这里，UI 组件只负责画。
 */

import {
  Chord,
  DiatonicChord,
  closeVoicingMidis,
  diatonicChords,
  makeChord,
  chordDegreeMap,
  getChordType,
} from './chords';
import { getScale, ScaleDef, scalePitches, degreeMap, parentScale } from './scales';
import { getTuning, Tuning } from './tuning';
import { findVoicings, selectPositions, Voicing, voicingMidis } from './voicings';
import { GuideToneSet, guideTones, chordScaleSuggestions, ChordScaleSuggestion } from './analysis';
import {
  CustomStep,
  getProgression,
  ProgressionDef,
  resolveCustomProgression,
  resolveProgression,
  ResolvedChord,
  StepOverride,
} from './progressions';
import { keyUsesFlats, mod } from './pitch';

export interface ModelInput {
  rootPc: number;
  scaleId: string;
  tuningId: string;
  capo: number;
  chord: { root: number; typeId: string } | null;
  progressionId: string | null;
  /** 自建进行（五度圈拖进来的绝对和弦）；非 null 时优先于 progressionId */
  customSteps?: CustomStep[] | null;
  /** 按级数索引存放的手动替换（相对根音偏移），可选 */
  progressionOverrides?: Record<number, StepOverride>;
}

export interface FretModel {
  rootPc: number;
  scale: ScaleDef;
  parent: ScaleDef;
  flats: boolean;
  tuning: Tuning;
  capo: number;
  scalePcs: number[];
  scaleDegrees: Map<number, { degree: string; interval: number }>;
  chord: Chord | null;
  chordDegrees: Map<number, string>;
  chordTones: number[];
  chordScales: ChordScaleSuggestion[];
  guide: GuideToneSet | null;
  allVoicings: Voicing[];
  positions: Voicing[];
  diatonic: DiatonicChord[];
  diatonic7: DiatonicChord[];
  progression: ProgressionDef | null;
  customSteps: CustomStep[] | null;
  resolvedProgression: ResolvedChord[];
}

// 指型搜索结果缓存：换和弦时不必重算同一组
const voicingCache = new Map<string, { all: Voicing[]; positions: Voicing[] }>();

function computeVoicings(chord: Chord, tuning: Tuning, capo: number) {
  const key = `${chord.root}:${chord.type.id}:${tuning.id}:${capo}`;
  const hit = voicingCache.get(key);
  if (hit) return hit;
  const all = findVoicings(chord, tuning, capo, { maxFret: 15, maxSpan: 4, minStrings: 4 });
  const positions = selectPositions(all, 5);
  const value = { all, positions };
  if (voicingCache.size > 400) voicingCache.clear();
  voicingCache.set(key, value);
  return value;
}

/**
 * 任意和弦在当前调弦 / 变调夹下的可弹把位（和 `model.positions` 同一套搜索与缓存）。
 * 进行里的每个和弦都要各自查，不能拿当前选中的和弦顶替。
 */
export function positionsFor(
  rootPc: number,
  typeId: string,
  tuning: Tuning,
  capo: number,
): Voicing[] {
  return computeVoicings(makeChord(rootPc, typeId), tuning, capo).positions;
}

/**
 * 播放用的一组 MIDI。传了把位下标就用真实指法的音（会带低音弦、有转位），
 * 没传或该把位在当前调弦下已经不存在时退回紧凑声位。
 */
export function chordPlayMidis(
  rootPc: number,
  typeId: string,
  tuning: Tuning,
  capo: number,
  position?: number | null,
): number[] {
  if (position !== undefined && position !== null) {
    const v = positionsFor(rootPc, typeId, tuning, capo)[position];
    if (v) return voicingMidis(v, tuning);
  }
  return closeVoicingMidis(rootPc, getChordType(typeId));
}

export function buildModel(input: ModelInput): FretModel {
  const scale = getScale(input.scaleId);
  const parent = parentScale(scale);
  const tuning = getTuning(input.tuningId);
  const flats = keyUsesFlats(input.rootPc, !!scale.minorish);

  const chord = input.chord ? makeChord(input.chord.root, input.chord.typeId, flats) : null;

  const voicings = chord ? computeVoicings(chord, tuning, input.capo) : { all: [], positions: [] };

  const dia = diatonicChords(input.rootPc, parent, false, flats);
  const dia7 = diatonicChords(input.rootPc, parent, true, flats);

  const customSteps = input.customSteps ?? null;
  const progression = !customSteps && input.progressionId ? getProgression(input.progressionId) ?? null : null;
  const overrides = input.progressionOverrides ?? {};
  const resolvedProgression = customSteps
    ? resolveCustomProgression(customSteps, input.rootPc, flats, overrides)
    : progression
      ? resolveProgression(progression, input.rootPc, parent, flats, overrides)
      : [];

  return {
    rootPc: mod(input.rootPc),
    scale,
    parent,
    flats,
    tuning,
    capo: input.capo,
    scalePcs: scalePitches(input.rootPc, scale),
    scaleDegrees: degreeMap(input.rootPc, scale),
    chord,
    chordDegrees: chord ? chordDegreeMap(chord) : new Map(),
    chordTones: chord ? chord.pcs : [],
    chordScales: chord ? chordScaleSuggestions(chord) : [],
    guide: chord ? guideTones(chord) : null,
    allVoicings: voicings.all,
    positions: voicings.positions,
    diatonic: dia,
    diatonic7: dia7,
    progression,
    customSteps,
    resolvedProgression,
  };
}
