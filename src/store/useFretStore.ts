import { create } from 'zustand';
import { mod } from '../theory/pitch';
import { getVolume, setMasterVolume } from '../audio/engine';
import {
  CustomStep,
  insertAt,
  SavedProgression,
  shiftIndexedAfterInsert,
  shiftIndexedAfterRemove,
  shiftOverridesAfterInsert,
  shiftOverridesAfterRemove,
  StepOverride,
} from '../theory/progressions';

export type DisplayMode = 'note' | 'degree';
export type ClickMode = 'play' | 'select';

export interface NoteHit {
  s: number;
  f: number;
}

/* ── 「我的进行」持久化 ───────────────────────────────────
 * 存在 localStorage 里：这是用户自己起名保存的内容，
 * 不是能从当前状态推导出来的东西，丢了要重新拖一遍。
 */

const SAVED_KEY = 'fret-compass-saved-progressions';

const isStep = (v: unknown): v is CustomStep =>
  !!v &&
  typeof v === 'object' &&
  Number.isInteger((v as CustomStep).rootPc) &&
  typeof (v as CustomStep).typeId === 'string';

const cleanVoicings = (v: unknown): Record<number, number> => {
  const out: Record<number, number> = {};
  if (!v || typeof v !== 'object') return out;
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    const i = Number(k);
    if (Number.isInteger(i) && i >= 0 && Number.isInteger(val)) out[i] = val as number;
  }
  return out;
};

function loadSavedProgressions(): SavedProgression[] {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list
      .filter(
        (p): p is SavedProgression =>
          !!p && typeof p.id === 'string' && typeof p.name === 'string' && Array.isArray(p.steps),
      )
      .map((p) => ({
        id: p.id,
        name: p.name,
        steps: p.steps.filter(isStep),
        voicings: cleanVoicings(p.voicings),
        createdAt: Number(p.createdAt) || 0,
      }))
      .filter((p) => p.steps.length > 0);
  } catch {
    return [];
  }
}

function persistSavedProgressions(list: SavedProgression[]): void {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(list));
  } catch {
    /* 隐私模式存不了，当前会话里仍然可用 */
  }
}

const newSavedId = (): string =>
  `saved-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

interface FretState {
  rootPc: number;
  scaleId: string;
  tuningId: string;
  capo: number;
  displayMode: DisplayMode;
  clickMode: ClickMode;
  showScale: boolean;
  showChord: boolean;
  showBoxes: boolean;
  chord: { root: number; typeId: string } | null;
  progressionId: string | null;
  /** 自建进行（从五度圈拖出来的绝对和弦）；非 null 时替代 progressionId */
  customSteps: CustomStep[] | null;
  /** 进行里被手动替换过的级数：索引 → 相对根音偏移 + 和弦类型 */
  progressionOverrides: Record<number, StepOverride>;
  /** 每个级数试听 / 播放时用第几个可弹把位（下标对应 positionsFor 的结果） */
  progressionVoicings: Record<number, number>;
  /** 自建进行的名字（来自「我的进行」或刚保存的名字） */
  customName: string | null;
  /** 用户保存到库里的自建进行 */
  savedProgressions: SavedProgression[];
  /** 正在编辑的已保存进行 id；载入条目时设置，换进行 / 自建时清空 */
  savedProgressionId: string | null;
  activeStep: number | null;
  activePosition: number;
  pressed: NoteHit[];
  /** 总音量 0–1（引擎里另有限幅器，调大也不会削波） */
  volume: number;

  setRoot: (pc: number) => void;
  setScale: (id: string) => void;
  setTuning: (id: string) => void;
  setCapo: (n: number) => void;
  setDisplayMode: (m: DisplayMode) => void;
  setClickMode: (m: ClickMode) => void;
  toggleShowScale: () => void;
  toggleShowChord: () => void;
  toggleShowBoxes: () => void;
  setChord: (root: number, typeId: string) => void;
  clearChord: () => void;
  chooseProgression: (id: string | null) => void;
  /** 进入自建模式：把当前看到的和弦固化成交互起点（传空数组就是从头搭） */
  beginCustom: (seed: CustomStep[]) => void;
  /**
   * 在 index 处插入一个和弦。还没有自建进行时用 seed 作为底稿，
   * 这样从库里进行中间插一个音时，原来的和弦不会消失。
   */
  insertCustomStep: (index: number, step: CustomStep, seed: CustomStep[]) => void;
  removeCustomStep: (index: number) => void;
  setProgressionOverride: (index: number, rootOffset: number, typeId: string) => void;
  clearProgressionOverride: (index: number) => void;
  setProgressionVoicing: (index: number, position: number | null) => void;
  /**
   * 把当前进行起名存进库。传 overwriteId 时覆盖原条目（保留 id 和 createdAt），
   * 否则新建一条；返回实际写入的条目，步骤为空时返回 null。
   */
  saveProgression: (
    name: string,
    steps: CustomStep[],
    overwriteId?: string | null,
  ) => { id: string; name: string; overwritten: boolean } | null;
  loadSavedProgression: (id: string) => void;
  deleteSavedProgression: (id: string) => void;
  setActiveStep: (i: number | null) => void;
  setActivePosition: (i: number) => void;
  togglePressed: (s: number, f: number) => void;
  clearPressed: () => void;
  setVolume: (v: number) => void;
}

export const useFretStore = create<FretState>((set) => ({
  rootPc: 0,
  scaleId: 'major',
  tuningId: 'standard',
  capo: 0,
  displayMode: 'note',
  clickMode: 'play',
  showScale: true,
  showChord: true,
  showBoxes: true,
  chord: { root: 0, typeId: 'maj' },
  progressionId: 'pop1564',
  customSteps: null,
  progressionOverrides: {},
  progressionVoicings: {},
  customName: null,
  savedProgressions: loadSavedProgressions(),
  savedProgressionId: null,
  activeStep: null,
  activePosition: 0,
  pressed: [],
  volume: getVolume(),

  setRoot: (pc) => set({ rootPc: mod(pc), activePosition: 0 }),
  setScale: (id) => set({ scaleId: id, activePosition: 0 }),
  setTuning: (id) => set({ tuningId: id, activePosition: 0 }),
  setCapo: (n) => set({ capo: Math.max(0, Math.min(9, Math.round(n))), activePosition: 0 }),
  setDisplayMode: (m) => set({ displayMode: m }),
  setClickMode: (m) => set({ clickMode: m, pressed: [] }),
  toggleShowScale: () => set((s) => ({ showScale: !s.showScale })),
  // 指型框依附于和弦音：关掉和弦音时框也一起关，否则只剩空框没有音
  toggleShowChord: () =>
    set((s) => {
      const showChord = !s.showChord;
      return { showChord, showBoxes: showChord ? s.showBoxes : false };
    }),
  toggleShowBoxes: () => set((s) => ({ showBoxes: !s.showBoxes })),

  setChord: (root, typeId) =>
    set({ chord: { root: mod(root), typeId }, activePosition: 0, activeStep: null }),
  clearChord: () =>
    // 没和弦可高亮了，和弦音图层和指型框一起取消，音名模式只剩调内音
    set({ chord: null, activePosition: 0, activeStep: null, showChord: false, showBoxes: false }),

  // 换进行时索引全部失效，替换、把位和自建内容一起清掉
  chooseProgression: (id) =>
    set({
      progressionId: id,
      // 换到库里的进行后，已经不是在编辑「我的进行」里的某一条了
      savedProgressionId: null,
      customSteps: null,
      customName: null,
      activeStep: null,
      activePosition: 0,
      progressionOverrides: {},
      progressionVoicings: {},
    }),

  beginCustom: (seed) =>
    set({
      progressionId: null,
      savedProgressionId: null,
      customSteps: seed,
      customName: null,
      activeStep: null,
      activePosition: 0,
      progressionOverrides: {},
    }),

  insertCustomStep: (index, step, seed) =>
    set((state) => {
      if (!state.customSteps) {
        // 第一次拖入：把当前看到的（已展开、已替换的）和弦固化成底稿。
        // 替换已经烘进绝对根音里了，所以不能再叠加，直接清空。
        return {
          progressionId: null,
          customSteps: insertAt(seed, index, step),
          customName: null,
          progressionOverrides: {},
          progressionVoicings: {},
          activeStep: index,
          activePosition: 0,
        };
      }
      return {
        customSteps: insertAt(state.customSteps, index, step),
        progressionOverrides: shiftOverridesAfterInsert(state.progressionOverrides, index),
        progressionVoicings: shiftIndexedAfterInsert(state.progressionVoicings, index),
        activeStep: index,
        activePosition: 0,
      };
    }),

  removeCustomStep: (index) =>
    set((state) => {
      if (!state.customSteps) return {};
      const activeStep =
        state.activeStep === null
          ? null
          : state.activeStep === index
            ? null
            : state.activeStep > index
              ? state.activeStep - 1
              : state.activeStep;
      return {
        customSteps: state.customSteps.filter((_, i) => i !== index),
        progressionOverrides: shiftOverridesAfterRemove(state.progressionOverrides, index),
        progressionVoicings: shiftIndexedAfterRemove(state.progressionVoicings, index),
        activeStep,
        activePosition: 0,
      };
    }),

  // 换过和弦之后，原来的把位下标对应的是另一个形状，直接丢掉
  setProgressionOverride: (index, rootOffset, typeId) =>
    set((state) => {
      const voicings = { ...state.progressionVoicings };
      delete voicings[index];
      return {
        progressionOverrides: {
          ...state.progressionOverrides,
          [index]: { rootOffset: mod(rootOffset), typeId },
        },
        progressionVoicings: voicings,
      };
    }),

  clearProgressionOverride: (index) =>
    set((state) => {
      const next = { ...state.progressionOverrides };
      delete next[index];
      const voicings = { ...state.progressionVoicings };
      delete voicings[index];
      return { progressionOverrides: next, progressionVoicings: voicings };
    }),

  setProgressionVoicing: (index, position) =>
    set((state) => {
      const next = { ...state.progressionVoicings };
      if (position === null) delete next[index];
      else next[index] = position;
      return { progressionVoicings: next };
    }),

  saveProgression: (name, steps, overwriteId = null) => {
    const clean = steps.filter(isStep).map((s) => ({ rootPc: mod(s.rootPc), typeId: s.typeId }));
    if (clean.length === 0) return null;
    const trimmed = name.trim() || `我的进行 ${new Date().toLocaleDateString('zh-CN')}`;
    // set 是同步执行的，先在闭包里把结果记下来再返回给 UI
    let result: { id: string; name: string; overwritten: boolean } | null = null;
    set((state) => {
      const existing = overwriteId
        ? state.savedProgressions.find((p) => p.id === overwriteId)
        : undefined;

      if (existing) {
        // 覆盖原条目：id / createdAt 不变，只换名字、和弦和把位。
        // 原条目万一已被删掉，就走下面的新建分支，别把这次保存弄丢。
        const savedProgressions = state.savedProgressions.map((p) =>
          p.id === existing.id
            ? {
                ...p,
                name: trimmed,
                steps: clean,
                voicings: { ...state.progressionVoicings },
              }
            : p,
        );
        persistSavedProgressions(savedProgressions);
        result = { id: existing.id, name: trimmed, overwritten: true };
        return { savedProgressions, customName: trimmed, savedProgressionId: existing.id };
      }

      const id = newSavedId();
      const entry: SavedProgression = {
        id,
        name: trimmed,
        steps: clean,
        voicings: { ...state.progressionVoicings },
        createdAt: Date.now(),
      };
      const savedProgressions = [...state.savedProgressions, entry];
      persistSavedProgressions(savedProgressions);
      result = { id, name: trimmed, overwritten: false };
      return { savedProgressions, customName: trimmed, savedProgressionId: id };
    });
    return result;
  },

  loadSavedProgression: (id) =>
    set((state) => {
      const hit = state.savedProgressions.find((p) => p.id === id);
      if (!hit) return {};
      return {
        progressionId: null,
        // 记住来源条目：之后点保存才能问「覆盖还是另存」
        savedProgressionId: hit.id,
        customSteps: hit.steps.map((s) => ({ ...s })),
        customName: hit.name,
        progressionOverrides: {},
        progressionVoicings: cleanVoicings(hit.voicings),
        activeStep: null,
        activePosition: 0,
      };
    }),

  deleteSavedProgression: (id) =>
    set((state) => {
      const savedProgressions = state.savedProgressions.filter((p) => p.id !== id);
      persistSavedProgressions(savedProgressions);
      return {
        savedProgressions,
        // 删的正是手上这条：内容还留在指板上，但它已经不属于任何保存条目了
        savedProgressionId: state.savedProgressionId === id ? null : state.savedProgressionId,
      };
    }),

  setActiveStep: (i) => set({ activeStep: i, activePosition: 0 }),
  setActivePosition: (i) => set({ activePosition: i }),

  togglePressed: (s, f) =>
    set((state) => {
      const exists = state.pressed.some((p) => p.s === s && p.f === f);
      return {
        pressed: exists
          ? state.pressed.filter((p) => !(p.s === s && p.f === f))
          : [...state.pressed, { s, f }],
      };
    }),
  clearPressed: () => set({ pressed: [] }),

  setVolume: (v) => {
    const value = Math.min(1, Math.max(0, v));
    setMasterVolume(value);
    set({ volume: value });
  },
}));
