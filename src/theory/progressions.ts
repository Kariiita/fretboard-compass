/**
 * 和弦进行库。
 *
 * 进行以**级数**存储，按当前调实时展开成绝对和弦。
 * 所以换调时进行自动跟随，这是它区别于「和弦表」的关键。
 */

import { mod } from './pitch';
import { Chord, DiatonicChord, diatonicChords, makeChord } from './chords';
import { parentScale, ScaleDef } from './scales';

export type ProgressionStyle = 'pop' | 'rock' | 'jazz' | 'blues' | 'folk' | 'citypop' | 'modal';

export interface DegreeSpec {
  /** 音阶级数 1-7 */
  degree: number;
  /** 相对该音级的半音变化，如 bVII 是 { degree: 7, alter: -1 } */
  alter?: number;
  /** 显式和弦类型；不填则用调内和弦 */
  quality?: string;
  /** 显式罗马数字标签 */
  label?: string;
}

export interface ProgressionDef {
  id: string;
  name: string;
  style: ProgressionStyle;
  degrees: DegreeSpec[];
  description: string;
}

export const STYLE_LABELS: Record<ProgressionStyle, string> = {
  pop: '流行',
  rock: '摇滚',
  jazz: '爵士',
  blues: '布鲁斯',
  folk: '民谣',
  citypop: 'City Pop / 日系',
  modal: '调式',
};

export const PROGRESSIONS: ProgressionDef[] = [
  {
    id: 'pop1564',
    name: 'I–V–vi–IV',
    style: 'pop',
    description: '全球最流行的四和弦；默认用七和弦的加厚版',
    degrees: [
      { degree: 1, quality: 'maj7' },
      { degree: 5, quality: '7' },
      { degree: 6, quality: 'm7' },
      { degree: 4, quality: 'maj7' },
    ],
  },
  {
    id: 'pop6415',
    name: 'vi–IV–I–V',
    style: 'pop',
    description: '同一条进行换个起点，立刻变忧郁',
    degrees: [
      { degree: 6, quality: 'm7' },
      { degree: 4, quality: 'maj7' },
      { degree: 1, quality: 'maj7' },
      { degree: 5, quality: '7' },
    ],
  },
  {
    id: 'pop4536',
    name: 'IV–V–iii–vi',
    style: 'citypop',
    description: '日系 / City Pop 的招牌进行，4536',
    degrees: [
      { degree: 4, quality: 'maj7' },
      { degree: 5, quality: '7' },
      { degree: 3, quality: 'm7' },
      { degree: 6, quality: 'm7' },
    ],
  },
  {
    id: 'pop4536251',
    name: 'IV–V–iii–vi–ii–V–I',
    style: 'citypop',
    description: '4536251，日语歌最完整的终止式',
    degrees: [
      { degree: 4, quality: 'maj7' },
      { degree: 5, quality: '7' },
      { degree: 3, quality: 'm7' },
      { degree: 6, quality: 'm7' },
      { degree: 2, quality: 'm7' },
      { degree: 5, quality: '7' },
      { degree: 1, quality: 'maj7' },
    ],
  },
  {
    id: 'pop1625',
    name: 'I–vi–ii–V',
    style: 'jazz',
    description: '50 年代进行，爵士 / 老派流行必备',
    degrees: [
      { degree: 1, quality: 'maj7' },
      { degree: 6, quality: 'm7' },
      { degree: 2, quality: 'm7' },
      { degree: 5, quality: '7' },
    ],
  },
  {
    id: 'jazz251',
    name: 'ii–V–I',
    style: 'jazz',
    description: '爵士的「一句话」，所有标准曲的骨架',
    degrees: [{ degree: 2, quality: 'm7', label: 'ii7' }, { degree: 5, quality: '7', label: 'V7' }, { degree: 1, quality: 'maj7', label: 'Imaj7' }],
  },
  {
    id: 'jazz36251',
    name: 'iii–vi–ii–V–I',
    style: 'jazz',
    description: 'Turnaround，循环回主和弦的标准手法',
    degrees: [
      { degree: 3, quality: 'm7' },
      { degree: 6, quality: 'm7' },
      { degree: 2, quality: 'm7' },
      { degree: 5, quality: '7' },
      { degree: 1, quality: 'maj7' },
    ],
  },
  {
    id: 'jazz_minor251',
    name: 'iiø–V–i',
    style: 'jazz',
    description: '小调 ii-V-i，比大调版本更暗',
    degrees: [
      { degree: 2, quality: 'm7b5', label: 'iiø7' },
      { degree: 5, quality: '7', label: 'V7' },
      { degree: 1, quality: 'm7', label: 'i7' },
    ],
  },
  {
    id: 'rock_bVII',
    name: 'I–bVII–IV',
    style: 'rock',
    description: '借同主音小调的降七级，摇滚味',
    degrees: [
      { degree: 1, quality: 'add9' },
      { degree: 7, alter: -1, quality: 'maj', label: 'bVII' },
      { degree: 4, quality: 'add9' },
    ],
  },
  {
    id: 'rock_IVbVII',
    name: 'I–IV–bVII',
    style: 'rock',
    description: 'Mixolydian 色彩，Lynyrd Skynyrd 式的开阔',
    degrees: [
      { degree: 1, quality: 'add9' },
      { degree: 4, quality: 'add9' },
      { degree: 7, alter: -1, quality: 'maj', label: 'bVII' },
    ],
  },
  {
    id: 'rock_andalusian',
    name: 'i–bVII–bVI–V',
    style: 'rock',
    description: '安达卢西亚进行，弗拉门戈 / 金属的基底',
    degrees: [
      { degree: 1, quality: 'min', label: 'i' },
      { degree: 7, alter: -1, quality: 'maj', label: 'bVII' },
      { degree: 6, alter: -1, quality: 'maj', label: 'bVI' },
      { degree: 5, quality: '7', label: 'V7' },
    ],
  },
  {
    id: 'rock_i_bVI',
    name: 'i–bVI–bIII–bVII',
    style: 'rock',
    description: '小调下的四个大三和弦，史诗感',
    degrees: [
      { degree: 1, quality: 'min', label: 'i' },
      { degree: 6, alter: -1, quality: 'maj', label: 'bVI' },
      { degree: 3, alter: -1, quality: 'maj', label: 'bIII' },
      { degree: 7, alter: -1, quality: 'maj', label: 'bVII' },
    ],
  },
  {
    id: 'blues12',
    name: '12 小节布鲁斯',
    style: 'blues',
    description: '全部用属七和弦，布鲁斯的通用语言',
    degrees: [
      { degree: 1, quality: '7', label: 'I7' },
      { degree: 1, quality: '7', label: 'I7' },
      { degree: 1, quality: '7', label: 'I7' },
      { degree: 1, quality: '7', label: 'I7' },
      { degree: 4, quality: '7', label: 'IV7' },
      { degree: 4, quality: '7', label: 'IV7' },
      { degree: 1, quality: '7', label: 'I7' },
      { degree: 1, quality: '7', label: 'I7' },
      { degree: 5, quality: '7', label: 'V7' },
      { degree: 4, quality: '7', label: 'IV7' },
      { degree: 1, quality: '7', label: 'I7' },
      { degree: 5, quality: '7', label: 'V7' },
    ],
  },
  {
    id: 'blues_quick',
    name: 'Quick Change 蓝调',
    style: 'blues',
    description: '第 2 小节就换 IV7 的 12 小节变体',
    degrees: [
      { degree: 1, quality: '7', label: 'I7' },
      { degree: 4, quality: '7', label: 'IV7' },
      { degree: 1, quality: '7', label: 'I7' },
      { degree: 1, quality: '7', label: 'I7' },
      { degree: 4, quality: '7', label: 'IV7' },
      { degree: 4, quality: '7', label: 'IV7' },
      { degree: 1, quality: '7', label: 'I7' },
      { degree: 6, quality: '7', label: 'VI7' },
      { degree: 2, quality: '7', label: 'II7' },
      { degree: 5, quality: '7', label: 'V7' },
      { degree: 1, quality: '7', label: 'I7' },
      { degree: 5, quality: '7', label: 'V7' },
    ],
  },
  {
    id: 'folk_1451',
    name: 'I–IV–I–V',
    style: 'folk',
    description: '民谣的基本呼吸，永远不会错',
    degrees: [
      { degree: 1, quality: 'add9' },
      { degree: 4, quality: 'maj' },
      { degree: 1, quality: 'add9' },
      { degree: 5, quality: '7' },
    ],
  },
  {
    id: 'folk_canon',
    name: '卡农进行',
    style: 'folk',
    description: 'Pachelbel 的卡农，抒情歌的万能底',
    degrees: [
      { degree: 1, quality: 'maj7' },
      { degree: 5, quality: '7' },
      { degree: 6, quality: 'm7' },
      { degree: 3, quality: 'm7' },
      { degree: 4, quality: 'maj7' },
      { degree: 1, quality: 'maj7' },
      { degree: 4, quality: 'maj7' },
      { degree: 5, quality: '7' },
    ],
  },
  {
    id: 'modal_dorian',
    name: 'i–IV（Dorian）',
    style: 'modal',
    description: '小调主和弦 + 大四级，Dorian 的标志',
    degrees: [
      { degree: 1, quality: 'm7', label: 'i7' },
      { degree: 4, quality: 'maj', label: 'IV' },
    ],
  },
  {
    id: 'modal_mixolydian',
    name: 'I–bVII（Mixolydian）',
    style: 'modal',
    description: '大调主和弦 + 降七级，Mixolydian 的标志',
    degrees: [
      { degree: 1, quality: '7', label: 'I7' },
      { degree: 7, alter: -1, quality: 'maj', label: 'bVII' },
    ],
  },

  // ── 扩充：经典 / 常用进行 ───────────────────────────────

  {
    id: 'pop_doowop',
    name: 'I–vi–IV–V',
    style: 'pop',
    description: '50 年代嘟·哇普进行，怀旧金曲的万能底',
    degrees: [
      { degree: 1, quality: 'maj7' },
      { degree: 6, quality: 'm7' },
      { degree: 4, quality: 'maj7' },
      { degree: 5, quality: '7' },
    ],
  },
  {
    id: 'pop_451',
    name: 'IV–V–I',
    style: 'pop',
    description: '正格终止，副歌最直白的收束',
    degrees: [
      { degree: 4, quality: 'maj7' },
      { degree: 5, quality: '7' },
      { degree: 1, quality: 'maj7' },
    ],
  },
  {
    id: 'pop_4165',
    name: 'IV–I–V–vi',
    style: 'pop',
    description: '把 I–V–vi–IV 转一圈，落点更悬',
    degrees: [
      { degree: 4, quality: 'maj7' },
      { degree: 1, quality: 'maj7' },
      { degree: 5, quality: '7' },
      { degree: 6, quality: 'm7' },
    ],
  },
  {
    id: 'citypop_komuro',
    name: 'vi–IV–V–I（小室進行）',
    style: 'citypop',
    description: '90 年代 J-pop 的招牌，小室哲哉式推进',
    degrees: [
      { degree: 6, quality: 'm7' },
      { degree: 4, quality: 'maj7' },
      { degree: 5, quality: '7' },
      { degree: 1, quality: 'maj7' },
    ],
  },
  {
    id: 'citypop_royal',
    name: '王道八和弦',
    style: 'citypop',
    description: 'I–V–vi–iii–IV–I–IV–V，日系流行常见的长进行',
    degrees: [
      { degree: 1, quality: 'maj7' },
      { degree: 5, quality: '7' },
      { degree: 6, quality: 'm7' },
      { degree: 3, quality: 'm7' },
      { degree: 4, quality: 'maj7' },
      { degree: 1, quality: 'maj7' },
      { degree: 4, quality: 'maj7' },
      { degree: 5, quality: '7' },
    ],
  },
  {
    id: 'rock_145',
    name: 'I–IV–V（强力和弦）',
    style: 'rock',
    description: '摇滚三和弦，失真下最干净的选择',
    degrees: [
      { degree: 1, quality: '5' },
      { degree: 4, quality: '5' },
      { degree: 5, quality: '5' },
    ],
  },
  {
    id: 'rock_415',
    name: 'IV–I–V（强力和弦）',
    style: 'rock',
    description: '从四级起手的摇滚终止，推进感更强',
    degrees: [
      { degree: 4, quality: '5' },
      { degree: 1, quality: '5' },
      { degree: 5, quality: '5' },
    ],
  },
  {
    id: 'rock_i_bVI_bVII',
    name: 'i–bVI–bVII–i',
    style: 'rock',
    description: '小调自然音的四个大三和弦，史诗 / 后摇常用',
    degrees: [
      { degree: 1, quality: 'min', label: 'i' },
      { degree: 6, alter: -1, quality: 'maj', label: 'bVI' },
      { degree: 7, alter: -1, quality: 'maj', label: 'bVII' },
      { degree: 1, quality: 'min', label: 'i' },
    ],
  },
  {
    id: 'folk_145',
    name: 'I–IV–V',
    style: 'folk',
    description: '三个和弦走天下，民谣的骨架',
    degrees: [
      { degree: 1, quality: 'maj' },
      { degree: 4, quality: 'maj' },
      { degree: 5, quality: '7' },
    ],
  },
  {
    id: 'folk_1465',
    name: 'I–IV–vi–V',
    style: 'folk',
    description: '叙事歌常用，副歌前留一口气',
    degrees: [
      { degree: 1, quality: 'maj' },
      { degree: 4, quality: 'maj' },
      { degree: 6, quality: 'm7' },
      { degree: 5, quality: '7' },
    ],
  },
  {
    id: 'jazz_turnaround',
    name: 'I–VI7–ii–V7',
    style: 'jazz',
    description: '副属和弦版 turnaround，VI7 把循环顶起来',
    degrees: [
      { degree: 1, quality: 'maj7', label: 'Imaj7' },
      { degree: 6, quality: '7', label: 'VI7' },
      { degree: 2, quality: 'm7', label: 'ii7' },
      { degree: 5, quality: '7', label: 'V7' },
    ],
  },
  {
    id: 'jazz_bridge',
    name: 'III7–VI7–II7–V7',
    style: 'jazz',
    description: 'Rhythm Changes 的桥段，连续属七一路下行五度',
    degrees: [
      { degree: 3, quality: '7', label: 'III7' },
      { degree: 6, quality: '7', label: 'VI7' },
      { degree: 2, quality: '7', label: 'II7' },
      { degree: 5, quality: '7', label: 'V7' },
    ],
  },
  {
    id: 'jazz_2516',
    name: 'ii–V–I–VI7',
    style: 'jazz',
    description: '循环回开头的 2516，比 251 多一句推力',
    degrees: [
      { degree: 2, quality: 'm7', label: 'ii7' },
      { degree: 5, quality: '7', label: 'V7' },
      { degree: 1, quality: 'maj7', label: 'Imaj7' },
      { degree: 6, quality: '7', label: 'VI7' },
    ],
  },
  {
    id: 'jazz_minor_turnaround',
    name: 'i–bVI–iiø–V7',
    style: 'jazz',
    description: '小调 turnaround，电影配乐里的悬而未决',
    degrees: [
      { degree: 1, quality: 'm7', label: 'i7' },
      { degree: 6, alter: -1, quality: 'maj7', label: 'bVImaj7' },
      { degree: 2, quality: 'm7b5', label: 'iiø7' },
      { degree: 5, quality: '7', label: 'V7' },
    ],
  },
  {
    id: 'blues8',
    name: '8 小节布鲁斯',
    style: 'blues',
    description: '短小紧凑的 8 小节版本，适合快速循环',
    degrees: [
      { degree: 1, quality: '7', label: 'I7' },
      { degree: 1, quality: '7', label: 'I7' },
      { degree: 4, quality: '7', label: 'IV7' },
      { degree: 4, quality: '7', label: 'IV7' },
      { degree: 1, quality: '7', label: 'I7' },
      { degree: 5, quality: '7', label: 'V7' },
      { degree: 1, quality: '7', label: 'I7' },
      { degree: 5, quality: '7', label: 'V7' },
    ],
  },
  {
    id: 'blues_minor12',
    name: '小调 12 小节布鲁斯',
    style: 'blues',
    description: '小七和弦为主，bVI7–V7 是它的招牌转角',
    degrees: [
      { degree: 1, quality: 'm7', label: 'i7' },
      { degree: 1, quality: 'm7', label: 'i7' },
      { degree: 1, quality: 'm7', label: 'i7' },
      { degree: 1, quality: 'm7', label: 'i7' },
      { degree: 4, quality: 'm7', label: 'iv7' },
      { degree: 4, quality: 'm7', label: 'iv7' },
      { degree: 1, quality: 'm7', label: 'i7' },
      { degree: 1, quality: 'm7', label: 'i7' },
      { degree: 6, alter: -1, quality: '7', label: 'bVI7' },
      { degree: 5, quality: '7', label: 'V7' },
      { degree: 1, quality: 'm7', label: 'i7' },
      { degree: 5, quality: '7', label: 'V7' },
    ],
  },
  {
    id: 'modal_phrygian',
    name: 'i–bII（Phrygian）',
    style: 'modal',
    description: 'Phrygian 的 i–bII，弗拉门戈 / 金属的暗色',
    degrees: [
      { degree: 1, quality: 'min', label: 'i' },
      { degree: 2, alter: -1, quality: 'maj', label: 'bII' },
    ],
  },
  {
    id: 'modal_lydian',
    name: 'I–II（Lydian）',
    style: 'modal',
    description: 'Lydian 的 I–II，明亮又悬浮',
    degrees: [
      { degree: 1, quality: 'maj7', label: 'Imaj7' },
      { degree: 2, quality: 'maj', label: 'II' },
    ],
  },
];

export const getProgression = (id: string): ProgressionDef | undefined =>
  PROGRESSIONS.find((p) => p.id === id);

export interface ResolvedChord {
  index: number;
  /** 来自库里的进行才有级数；自建进行是从五度圈拖进来的绝对和弦，没有级数 */
  degree?: DegreeSpec;
  /** 级数本身的根音（不含手动替换） */
  baseRootPc: number;
  /** 进行默认的和弦类型（不含手动替换），「还原」时要用 */
  baseTypeId: string;
  rootPc: number;
  typeId: string;
  symbol: string;
  name: string;
  roman: string;
  /** 这个级数被用户手动换过和弦 */
  isOverride: boolean;
}

/**
 * 用户对某个级数的替换。
 *
 * 存**相对级数根音的偏移**而不是绝对音高：换调时整个进行要跟着移调，
 * 存绝对音高会让替换过的那个和弦留在原地，听起来像走音。
 */
export interface StepOverride {
  rootOffset: number;
  typeId: string;
}

/**
 * 罗马数字里的升/降记号永远相对**大调音级**，
 * 所以带 alter 的级数（bVII、bVI…）要从大调音阶起算，
 * 否则同一个进行在小调下会算错（A 小调的 bVII 是 G，不是 F#）。
 */
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];

/** 把级数进行展开成当前调下的实际和弦 */
export function resolveProgression(
  def: ProgressionDef,
  keyRoot: number,
  scale: ScaleDef,
  flats = false,
  overrides: Record<number, StepOverride> = {},
): ResolvedChord[] {
  const sc = parentScale(scale);
  const dia = diatonicChords(keyRoot, sc, false, flats);

  return def.degrees.map((d, index) => {
    const di = Math.min(6, Math.max(0, d.degree - 1));
    const diatonic = dia[di];
    const baseRootPc =
      d.alter !== undefined
        ? mod(keyRoot + MAJOR_STEPS[di] + d.alter)
        : diatonic.rootPc;
    const ov = overrides[index];
    const baseTypeId = d.quality ?? diatonic.typeId;
    const rootPc = ov ? mod(baseRootPc + ov.rootOffset) : baseRootPc;
    const typeId = ov?.typeId ?? baseTypeId;
    const chord = makeChord(rootPc, typeId, flats);
    return {
      index,
      degree: d,
      baseRootPc,
      baseTypeId,
      rootPc,
      typeId,
      symbol: chord.symbol,
      name: chord.name,
      roman: d.label ?? diatonic.roman,
      isOverride: !!ov,
    };
  });
}

// ────────────────────────────────────────────────────────────
// 自建进行：从五度圈拖出来的和弦，存绝对根音
// ────────────────────────────────────────────────────────────

/** 自建模式下每个和弦的默认类型：主题要求「默认七和弦」 */
export const CUSTOM_STEP_TYPE = '7';

/** 下拉框里代表「自建进行」的伪 id，不对应任何库里的进行 */
export const CUSTOM_PROGRESSION_ID = '__custom';

export interface CustomStep {
  rootPc: number;
  typeId: string;
}

/**
 * 自建和弦相对当前调的罗马数字。
 * 仍然以**大调音级**为基准（和库里的 alter 约定一致），
 * 十二个半音里没有自然音级可对应的，一律用降号写法（bII / bIII / bV / bVI / bVII），
 * 这样 C 调里 F# 会显示成 bV 而不是含糊的 #IV。
 */
const FLAT_DEGREE_LABEL: Record<number, string> = {
  1: 'bII',
  3: 'bIII',
  6: 'bV',
  8: 'bVI',
  10: 'bVII',
};

export function romanForRootPc(rootPc: number, keyRoot: number): string {
  const off = mod(rootPc - keyRoot);
  const di = MAJOR_STEPS.indexOf(off);
  if (di >= 0) return ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][di];
  return FLAT_DEGREE_LABEL[off] ?? '?';
}

/**
 * 展开自建进行。根音是绝对的，换调**不会**移动这些和弦——
 * 用户是从五度圈上点名的音，移调等于擅自改掉他拖进来的东西。
 * 只有手动替换（override）仍按「相对该和弦根音的偏移」叠加。
 */
export function resolveCustomProgression(
  steps: CustomStep[],
  keyRoot: number,
  flats = false,
  overrides: Record<number, StepOverride> = {},
): ResolvedChord[] {
  return steps.map((step, index) => {
    const ov = overrides[index];
    const rootPc = ov ? mod(step.rootPc + ov.rootOffset) : step.rootPc;
    const typeId = ov?.typeId ?? step.typeId;
    const chord = makeChord(rootPc, typeId, flats);
    return {
      index,
      baseRootPc: step.rootPc,
      baseTypeId: step.typeId,
      rootPc,
      typeId,
      symbol: chord.symbol,
      name: chord.name,
      roman: romanForRootPc(step.rootPc, keyRoot),
      isOverride: !!ov,
    };
  });
}

/** 在指定位置插入（越界自动夹到两端），返回新数组，不改原数组 */
export function insertAt<T>(list: T[], index: number, item: T): T[] {
  const i = Math.max(0, Math.min(list.length, index));
  return [...list.slice(0, i), item, ...list.slice(i)];
}

/**
 * 插入后，原来 index 及之后的索引整体后移一位。
 * 替换和「播放把位」都是按卡片下标存的，任何插入都得跟着平移，否则会跟错卡片。
 */
export function shiftIndexedAfterInsert<T>(
  map: Record<number, T>,
  index: number,
): Record<number, T> {
  const next: Record<number, T> = {};
  for (const [key, value] of Object.entries(map)) {
    const i = Number(key);
    next[i >= index ? i + 1 : i] = value;
  }
  return next;
}

/** 删除后，被删位置的项丢掉，后面的整体前移一位 */
export function shiftIndexedAfterRemove<T>(
  map: Record<number, T>,
  index: number,
): Record<number, T> {
  const next: Record<number, T> = {};
  for (const [key, value] of Object.entries(map)) {
    const i = Number(key);
    if (i === index) continue;
    next[i > index ? i - 1 : i] = value;
  }
  return next;
}

/** 插入后，原来 index 及之后的替换整体后移一位，否则会跟错卡片 */
export function shiftOverridesAfterInsert(
  overrides: Record<number, StepOverride>,
  index: number,
): Record<number, StepOverride> {
  return shiftIndexedAfterInsert(overrides, index);
}

/** 删除后，被删位置的替换丢掉，后面的整体前移一位 */
export function shiftOverridesAfterRemove(
  overrides: Record<number, StepOverride>,
  index: number,
): Record<number, StepOverride> {
  return shiftIndexedAfterRemove(overrides, index);
}

/**
 * 用户保存到「我的进行」里的自建进行。
 *
 * steps 存绝对根音（和 customSteps 的语义一致），所以换调不会移调；
 * voicings 是按卡片下标的播放把位，插入/删除时已经同步平移过。
 */
export interface SavedProgression {
  id: string;
  name: string;
  steps: CustomStep[];
  voicings?: Record<number, number>;
  createdAt: number;
}

export function progressionsByStyle(): { style: ProgressionStyle; label: string; items: ProgressionDef[] }[] {
  const order: ProgressionStyle[] = ['pop', 'citypop', 'rock', 'folk', 'jazz', 'blues', 'modal'];
  return order.map((style) => ({
    style,
    label: STYLE_LABELS[style],
    items: PROGRESSIONS.filter((p) => p.style === style),
  }));
}

/** 三和弦 → 顺理成章的七和弦。已经带七音 / 挂留的不动。 */
const TRIAD_TO_SEVENTH: Record<string, string> = {
  maj: 'maj7',
  min: 'm7',
  dim: 'm7b5',
  aug: '7#5',
};

/**
 * 把进行里的三和弦升成七和弦，专供「导音线」用：
 * 三音和七音才是一个和弦的性格，只画三音等于功能只做了一半。
 *
 * 取法优先级：
 *  1. 进行里显式写了 quality 的，尊重它（但调内 V 级大三仍取属七，那才是它的功能）
 *  2. 用当前调内对应级数的七和弦（所以 I–V–vi–IV 会得到 maj7–7–m7–maj7，而不是四个 maj7）
 */
export function asSeventhChord(c: ResolvedChord, diatonic7: DiatonicChord[], flats = false): Chord {
  const seventhId = TRIAD_TO_SEVENTH[c.typeId];
  if (!seventhId) return makeChord(c.rootPc, c.typeId, flats);

  // 自建进行没有级数可查，直接按和弦本身升成对应的七和弦
  if (!c.degree) return makeChord(c.rootPc, seventhId, flats);

  if (c.degree.quality === undefined) {
    const d7 = diatonic7[Math.min(6, Math.max(0, c.degree.degree - 1))];
    if (d7) return makeChord(d7.rootPc, d7.typeId, flats);
  }
  const isDiatonicFifth = c.typeId === 'maj' && c.degree.degree === 5 && c.degree.alter === undefined;
  return makeChord(c.rootPc, isDiatonicFifth ? '7' : seventhId, flats);
}
