import { describe, expect, it } from 'vitest';
import { getScale, scalePitches, degreeMap } from '../scales';
import {
  CHORD_TYPES,
  chordPcs,
  closeVoicingMidis,
  commonSubstitutions,
  diatonicChords,
  getChordType,
  isMinorChordType,
  makeChord,
} from '../chords';
import { findVoicings, selectPositions, voicingMidis } from '../voicings';
import { getTuning, pcAt } from '../tuning';
import { identifyChord } from '../identify';
import {
  PROGRESSIONS,
  getProgression,
  resolveProgression,
  asSeventhChord,
  resolveCustomProgression,
  romanForRootPc,
  insertAt,
  shiftIndexedAfterInsert,
  shiftIndexedAfterRemove,
  shiftOverridesAfterInsert,
  shiftOverridesAfterRemove,
  CustomStep,
} from '../progressions';
import { chordPlayMidis, positionsFor } from '../model';
import { guideTones, modalInterchange, secondaryDominants, voiceLeading } from '../analysis';
import { keyUsesFlats, pcName } from '../pitch';

const std = getTuning('standard');

describe('音阶', () => {
  it('C 大调没有任何升降号', () => {
    expect(scalePitches(0, getScale('major'))).toEqual([0, 2, 4, 5, 7, 9, 11]);
  });

  it('E 大调有 4 个升号（F# G# C# D#）', () => {
    expect(scalePitches(4, getScale('major'))).toEqual([4, 6, 8, 9, 11, 1, 3]);
  });

  it('A 自然小调和 C 大调音集相同', () => {
    const a = scalePitches(9, getScale('aeolian')).slice().sort((x, y) => x - y);
    const c = scalePitches(0, getScale('major')).slice().sort((x, y) => x - y);
    expect(a).toEqual(c);
  });

  it('D 多利亚和 C 大调音集相同', () => {
    const d = scalePitches(2, getScale('dorian')).slice().sort((x, y) => x - y);
    expect(d).toEqual([0, 2, 4, 5, 7, 9, 11]);
  });

  it('级数映射正确', () => {
    const m = degreeMap(0, getScale('major'));
    expect(m.get(0)?.degree).toBe('1');
    expect(m.get(4)?.degree).toBe('3');
    expect(m.get(11)?.degree).toBe('7');
  });
});

describe('和弦', () => {
  it('Cmaj7 = C E G B', () => {
    expect(makeChord(0, 'maj7').pcs).toEqual([0, 4, 7, 11]);
  });

  it('F#m = F# A C#', () => {
    expect(makeChord(6, 'min').pcs).toEqual([6, 9, 1]);
  });

  it('G 大调调内三和弦：G Am Bm C D Em F#dim', () => {
    const d = diatonicChords(7, getScale('major'));
    expect(d.map((x) => x.symbol)).toEqual(['G', 'Am', 'Bm', 'C', 'D', 'Em', 'F#°']);
    expect(d.map((x) => x.roman)).toEqual(['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']);
  });

  it('C 大调调内七和弦：Cmaj7 Dm7 Em7 Fmaj7 G7 Am7 Bm7b5', () => {
    const d = diatonicChords(0, getScale('major'), true);
    expect(d.map((x) => x.symbol)).toEqual(['Cmaj7', 'Dm7', 'Em7', 'Fmaj7', 'G7', 'Am7', 'Bm7b5']);
    expect(d[6].roman).toBe('viiø7');
  });

  it('试听的音必须属于这个和弦（根音不能写死成 C）', () => {
    // G 大三和弦：G3 B3 D4 —— 之前这里发的是 48/52/55，听起来是 C
    expect(closeVoicingMidis(7, getChordType('maj'))).toEqual([55, 59, 62]);
    expect(closeVoicingMidis(0, getChordType('maj'))).toEqual([48, 52, 55]);
    // 根音落在 C3..B3，不会因为根音高就跳出伴奏音区
    for (let pc = 0; pc < 12; pc++) {
      const midis = closeVoicingMidis(pc, getChordType('maj7'));
      expect(midis[0]).toBeGreaterThanOrEqual(48);
      expect(midis[0]).toBeLessThan(60);
    }
  });

  it('替换建议都是真实存在的类型，且不包含自己', () => {
    const ids = new Set(CHORD_TYPES.map((t) => t.id));
    for (const type of CHORD_TYPES) {
      const subs = commonSubstitutions(type.id);
      for (const s of subs) {
        expect(ids.has(s.id), `${type.id} → ${s.id}`).toBe(true);
        expect(s.id).not.toBe(type.id);
      }
      // 同一类型下不能重复出现
      expect(new Set(subs.map((s) => s.id)).size).toBe(subs.length);
    }
    // 属七是最常被加厚的，至少要给出 9 / 13 / 7b9 这些常见选择
    expect(commonSubstitutions('7').map((t) => t.id)).toEqual(
      expect.arrayContaining(['9', '13', '7b9', '7#9']),
    );
  });

  it('试听的音高类与 chordPcs 逐个对应（12 个根音 × 全部和弦类型）', () => {
    for (let pc = 0; pc < 12; pc++) {
      for (const type of CHORD_TYPES) {
        const heard = closeVoicingMidis(pc, type).map((m) => ((m % 12) + 12) % 12);
        expect(heard, `${pcName(pc)}${type.suffix}`).toEqual(chordPcs(pc, type));
      }
    }
  });
});

describe('指型搜索', () => {
  it('标准调弦下能找到 C 的开放指型 x32010', () => {
    const chord = makeChord(0, 'maj');
    const vs = findVoicings(chord, std, 0);
    const found = vs.some((v) => v.frets.join(',') === ',3,2,0,1,0');
    expect(found).toBe(true);
  });

  it('C 大调 C 和弦有 5 个左右把位', () => {
    const chord = makeChord(0, 'maj');
    const pos = selectPositions(findVoicings(chord, std, 0), 5);
    expect(pos.length).toBeGreaterThanOrEqual(4);
    expect(pos[0].minFret).toBe(0);
  });

  it('同一个把位的两种指法不会各出一个框', () => {
    const chord = makeChord(0, 'maj');
    const pos = selectPositions(findVoicings(chord, std, 0), 6);
    const shapes = pos.map((v) => v.frets.join(','));
    // 8 品横按是 C 的标准 E 形，它和「8 7 × × 8 8」是同一个把位，后者应被吞掉
    expect(shapes).toContain('8,10,10,9,8,8');
    expect(shapes).not.toContain('8,7,,,8,8');
    // 但开放位（0-3）与 3 品（3-5）只共用一条品丝、且指法不同，两者都要保留
    expect(shapes).toContain(',3,2,0,1,0');
    expect(shapes).toContain(',3,5,5,5,3');
  });

  it('G 大调 G 和弦的高把位 E 形 = 355433', () => {
    const chord = makeChord(7, 'maj');
    const vs = findVoicings(chord, std, 0);
    const found = vs.some((v) => v.frets.join(',') === '3,5,5,4,3,3');
    expect(found).toBe(true);
  });

  it('变调夹 2 品后不会出现 0 品和 1 品', () => {
    const chord = makeChord(0, 'maj');
    const vs = findVoicings(chord, std, 2);
    expect(vs.length).toBeGreaterThan(0);
    for (const v of vs) {
      for (const f of v.frets) {
        if (f !== null) expect(f).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('DADGAD 调弦下 D 大调和弦可以按出来', () => {
    const dadgad = getTuning('dadgad');
    const chord = makeChord(2, 'maj');
    const vs = findVoicings(chord, dadgad, 0);
    expect(vs.length).toBeGreaterThan(0);
    // 所有发声的音必须属于 D 大调三和弦
    for (const v of vs.slice(0, 20)) {
      v.frets.forEach((f, s) => {
        if (f !== null) expect(chord.pcs).toContain(pcAt(dadgad, s, f));
      });
    }
  });

  it('FACGCE 调弦的空弦音是 F A C G C E', () => {
    const t = getTuning('facgce');
    expect(t.midi).toEqual([41, 45, 48, 55, 60, 64]);
    expect([...Array(6)].map((_, s) => pcAt(t, s, 0))).toEqual([5, 9, 0, 7, 0, 4]);
  });

  it('指型能转成 MIDI 供播放', () => {
    const chord = makeChord(0, 'maj');
    const vs = findVoicings(chord, std, 0);
    const v = vs.find((x) => x.frets.join(',') === ',3,2,0,1,0')!;
    expect(voicingMidis(v, std)).toEqual([48, 52, 55, 60, 64]);
  });
});

describe('反向识别', () => {
  it('C E G → C', () => {
    const r = identifyChord([0, 4, 7], 0);
    expect(r.candidates[0].symbol).toBe('C');
  });

  it('x32010 → C', () => {
    const pcs = [0, 3, 2, 0, 1, 0].map((f, i) => pcAt(std, i, f));
    const r = identifyChord(pcs, 0);
    expect(r.candidates[0].symbol).toBe('C');
  });

  it('C E G B → Cmaj7', () => {
    const r = identifyChord([0, 4, 7, 11], 0);
    expect(r.candidates[0].symbol).toBe('Cmaj7');
  });

  it('C6 和 Am7 是同一堆音，两个都要出现', () => {
    const r = identifyChord([0, 4, 7, 9], null, false, 8);
    const symbols = r.candidates.map((c) => c.symbol);
    expect(symbols).toContain('C6');
    expect(symbols).toContain('Am7');
  });

  it('E 在低音的 C 和弦识别为转位', () => {
    const r = identifyChord([0, 4, 7], 4);
    const c = r.candidates.find((x) => x.symbol === 'C');
    expect(c?.inversion).toBeTruthy();
  });

  it('少于两个音不给结论', () => {
    expect(identifyChord([0], 0).candidates).toHaveLength(0);
  });
});

describe('和弦进行', () => {
  it('所有进行里显式写的 quality 都是有效和弦类型', () => {
    const ids = new Set(CHORD_TYPES.map((t) => t.id));
    for (const p of PROGRESSIONS) {
      for (const d of p.degrees) {
        if (d.quality) expect(ids.has(d.quality), `${p.id} 的 ${d.quality}`).toBe(true);
      }
    }
  });

  it('C 大调 I-V-vi-IV 默认是加厚的七和弦版本', () => {
    const p = getProgression('pop1564')!;
    const r = resolveProgression(p, 0, getScale('major'));
    expect(r.map((x) => x.symbol)).toEqual(['Cmaj7', 'G7', 'Am7', 'Fmaj7']);
    // 根音仍然来自级数，没有因为换和弦而跑偏
    expect(r.map((x) => x.baseRootPc)).toEqual([0, 7, 9, 5]);
    expect(r.every((x) => !x.isOverride)).toBe(true);
  });

  it('G 大调 I-V-vi-IV = Gmaj7 D7 Em7 Cmaj7', () => {
    const p = getProgression('pop1564')!;
    const r = resolveProgression(p, 7, getScale('major'));
    expect(r.map((x) => x.symbol)).toEqual(['Gmaj7', 'D7', 'Em7', 'Cmaj7']);
  });

  it('替换存的是相对级数的偏移，换调时跟着一起移调', () => {
    const p = getProgression('pop1564')!;
    const overrides = { 1: { rootOffset: 6, typeId: '7b9' } }; // 三全音替代 V7
    const c = resolveProgression(p, 0, getScale('major'), false, overrides);
    expect(c[1].baseRootPc).toBe(7);
    expect(c[1].rootPc).toBe(1);
    // C 大调用升号拼写，所以三全音替代显示成 C# 而不是 Db
    expect(c[1].symbol).toBe('C#7b9');
    expect(c[1].isOverride).toBe(true);
    // 换到 G 大调：V 的根音 D + 6 = G#，不是留在 C#
    const g = resolveProgression(p, 7, getScale('major'), false, overrides);
    expect(g[1].baseRootPc).toBe(2);
    expect(g[1].symbol).toBe('G#7b9');
  });

  it('只换类型不换根音时 rootOffset 为 0', () => {
    const p = getProgression('pop1564')!;
    const r = resolveProgression(p, 0, getScale('major'), false, {
      1: { rootOffset: 0, typeId: '13' },
    });
    expect(r[1].rootPc).toBe(7);
    expect(r[1].symbol).toBe('G13');
  });

  it('baseTypeId 留着进行默认的类型，「还原」才有地方可回', () => {
    const p = getProgression('pop1564')!;
    const r = resolveProgression(p, 0, getScale('major'), false, {
      1: { rootOffset: 6, typeId: '13' },
    });
    expect(r[1].typeId).toBe('13');
    expect(r[1].baseTypeId).toBe('7');
    // 没被替换的级数两者相同
    expect(r[0].baseTypeId).toBe(r[0].typeId);
  });

  it('C 大调 12 小节布鲁斯全是属七', () => {
    const p = getProgression('blues12')!;
    const r = resolveProgression(p, 0, getScale('major'));
    expect(r[0].symbol).toBe('C7');
    expect(r[4].symbol).toBe('F7');
    expect(r[8].symbol).toBe('G7');
    expect(r).toHaveLength(12);
  });

  it('安达卢西亚进行在小调下 = Am G F E', () => {
    const p = getProgression('rock_andalusian')!;
    const r = resolveProgression(p, 9, getScale('aeolian'));
    expect(r.map((x) => x.symbol)).toEqual(['Am', 'G', 'F', 'E7']);
  });

  it('换调时进行自动跟随', () => {
    const p = getProgression('pop1564')!;
    const g = resolveProgression(p, 7, getScale('major')).map((x) => x.symbol);
    const a = resolveProgression(p, 9, getScale('major')).map((x) => x.symbol);
    expect(g).toEqual(['Gmaj7', 'D7', 'Em7', 'Cmaj7']);
    expect(a).toEqual(['Amaj7', 'E7', 'F#m7', 'Dmaj7']);
  });

  it('导音线用的七和弦版本：I–V–vi–IV → Cmaj7 G7 Am7 Fmaj7', () => {
    const p = getProgression('pop1564')!;
    const r = resolveProgression(p, 0, getScale('major'));
    const dia7 = diatonicChords(0, getScale('major'), true);
    expect(r.map((c) => asSeventhChord(c, dia7).symbol)).toEqual(['Cmaj7', 'G7', 'Am7', 'Fmaj7']);
  });

  it('写明 quality 的进行不被改写：布鲁斯仍全是属七', () => {
    const p = getProgression('blues12')!;
    const r = resolveProgression(p, 0, getScale('major'));
    const dia7 = diatonicChords(0, getScale('major'), true);
    expect(r.slice(0, 3).map((c) => asSeventhChord(c, dia7).symbol)).toEqual(['C7', 'C7', 'C7']);
  });

  it('进行库没有重复 id，每个进行至少两个级数', () => {
    expect(new Set(PROGRESSIONS.map((p) => p.id)).size).toBe(PROGRESSIONS.length);
    for (const p of PROGRESSIONS) {
      expect(p.degrees.length, p.id).toBeGreaterThanOrEqual(2);
    }
  });

  it('扩充后的经典进行：小室進行 / Rhythm Changes 桥段', () => {
    const komuro = resolveProgression(getProgression('citypop_komuro')!, 0, getScale('major'));
    expect(komuro.map((x) => x.symbol)).toEqual(['Am7', 'Fmaj7', 'G7', 'Cmaj7']);

    const bridge = resolveProgression(getProgression('jazz_bridge')!, 0, getScale('major'));
    expect(bridge.map((x) => x.symbol)).toEqual(['E7', 'A7', 'D7', 'G7']);
  });

  it('小调 12 小节布鲁斯：A 小调的 bVI7 是 F7', () => {
    const p = getProgression('blues_minor12')!;
    const r = resolveProgression(p, 9, getScale('aeolian'));
    expect(r).toHaveLength(12);
    expect(r[0].symbol).toBe('Am7');
    expect(r[4].symbol).toBe('Dm7');
    expect(r[8].symbol).toBe('F7');
    expect(r[9].symbol).toBe('E7');
  });
});

describe('自建进行', () => {
  it('罗马数字相对大调音级，没有自然音级的用降号', () => {
    expect(romanForRootPc(7, 0)).toBe('V'); // C 调 G
    expect(romanForRootPc(9, 0)).toBe('VI'); // C 调 A
    expect(romanForRootPc(10, 0)).toBe('bVII'); // C 调 Bb
    expect(romanForRootPc(6, 0)).toBe('bV'); // C 调 F#
    expect(romanForRootPc(1, 0)).toBe('bII'); // C 调 C#
  });

  it('自建进行存绝对根音，换调不跟着动', () => {
    const steps: CustomStep[] = [
      { rootPc: 0, typeId: '7' },
      { rootPc: 7, typeId: '7' },
    ];
    const c = resolveCustomProgression(steps, 0);
    expect(c.map((x) => x.symbol)).toEqual(['C7', 'G7']);
    expect(c.map((x) => x.roman)).toEqual(['I', 'V']);
    // 同一个自建进行放到 G 调：和弦不变，级数标签跟着调变
    const g = resolveCustomProgression(steps, 7);
    expect(g.map((x) => x.symbol)).toEqual(['C7', 'G7']);
    expect(g.map((x) => x.roman)).toEqual(['IV', 'I']);
  });

  it('自建和弦也能被替换，偏移相对它自己的根音', () => {
    const steps: CustomStep[] = [{ rootPc: 0, typeId: '7' }];
    const r = resolveCustomProgression(steps, 0, false, {
      0: { rootOffset: 6, typeId: '7b9' },
    });
    expect(r[0].baseRootPc).toBe(0);
    expect(r[0].rootPc).toBe(6);
    expect(r[0].symbol).toBe('F#7b9');
    expect(r[0].baseTypeId).toBe('7');
    expect(r[0].isOverride).toBe(true);
  });

  it('自建进行没有级数，升七和弦也不能崩', () => {
    const dia7 = diatonicChords(0, getScale('major'), true);
    const r = resolveCustomProgression([{ rootPc: 2, typeId: 'maj' }], 0);
    expect(asSeventhChord(r[0], dia7).symbol).toBe('Dmaj7');
    // 已经是七和弦的不动
    const g = resolveCustomProgression([{ rootPc: 7, typeId: '7' }], 0);
    expect(asSeventhChord(g[0], dia7).symbol).toBe('G7');
  });

  it('插入 / 删除时，替换索引跟着卡片走', () => {
    const list = ['a', 'b', 'c'];
    expect(insertAt(list, 1, 'x')).toEqual(['a', 'x', 'b', 'c']);
    expect(insertAt(list, 99, 'x')).toEqual(['a', 'b', 'c', 'x']);
    expect(insertAt(list, -3, 'x')).toEqual(['x', 'a', 'b', 'c']);

    const ov = { 0: { rootOffset: 1, typeId: 'maj' }, 2: { rootOffset: 2, typeId: '7' } };
    // 在 1 处插入：原来索引 2 的替换挪到 3
    expect(shiftOverridesAfterInsert(ov, 1)).toEqual({
      0: { rootOffset: 1, typeId: 'maj' },
      3: { rootOffset: 2, typeId: '7' },
    });
    // 删除索引 0：被删位置的替换丢掉，后面的整体前移
    expect(shiftOverridesAfterRemove(ov, 0)).toEqual({
      1: { rootOffset: 2, typeId: '7' },
    });
  });
});

describe('播放把位', () => {
  it('小和弦判定：m7 / m7b5 是小，maj7 / 7 不是', () => {
    expect(isMinorChordType('m7')).toBe(true);
    expect(isMinorChordType('min')).toBe(true);
    expect(isMinorChordType('m7b5')).toBe(true);
    expect(isMinorChordType('7')).toBe(false);
    expect(isMinorChordType('maj7')).toBe(false);
    expect(isMinorChordType('sus4')).toBe(false);
  });

  it('选了把位就用真实指法的音，不选退回紧凑声位', () => {
    const positions = positionsFor(0, 'maj', std, 0);
    expect(positions.length).toBeGreaterThan(0);
    const midis = chordPlayMidis(0, 'maj', std, 0, 0);
    expect(midis).toEqual(voicingMidis(positions[0], std));
    expect(chordPlayMidis(0, 'maj', std, 0)).toEqual(closeVoicingMidis(0, getChordType('maj')));
    // 越界下标（换调弦后把位变少）也要优雅退回
    expect(chordPlayMidis(0, 'maj', std, 0, 99)).toEqual(
      closeVoicingMidis(0, getChordType('maj')),
    );
  });

  it('把位映射也按卡片索引平移', () => {
    const map = { 0: 1, 2: 3 };
    expect(shiftIndexedAfterInsert(map, 1)).toEqual({ 0: 1, 3: 3 });
    expect(shiftIndexedAfterRemove(map, 0)).toEqual({ 1: 3 });
    expect(shiftIndexedAfterRemove(map, 2)).toEqual({ 0: 1 });
  });
});

describe('乐理分析', () => {
  it('Cmaj7 的导音是 E 和 B', () => {
    const g = guideTones(makeChord(0, 'maj7'));
    expect(g.third?.pc).toBe(4);
    expect(g.seventh?.pc).toBe(11);
  });

  it('三和弦没有七音', () => {
    const g = guideTones(makeChord(0, 'maj'));
    expect(g.seventh).toBeNull();
  });

  it('Cmaj7 → Fmaj7 有一个共同音 C', () => {
    const vl = voiceLeading(makeChord(0, 'maj7'), makeChord(5, 'maj7'));
    expect(vl.common).toContain(0);
  });

  it('C 大调可借用 bVII（Bb 大三和弦）', () => {
    const b = modalInterchange(0, getScale('major'), false);
    const bvii = b.find((x) => x.label === 'bVII');
    expect(bvii?.symbol).toBe('Bb');
    expect(bvii?.rootPc).toBe(10);
  });

  it('C 大调的 V/ii 是 A7', () => {
    const dia = diatonicChords(0, getScale('major'));
    const sec = secondaryDominants(dia, false);
    const vOfTwo = sec.find((x) => x.label === 'V/ii');
    expect(vOfTwo?.symbol).toBe('A7');
  });
});

describe('记谱', () => {
  it('F 大调用降号，G 大调用升号', () => {
    expect(keyUsesFlats(5, false)).toBe(true);
    expect(keyUsesFlats(7, false)).toBe(false);
  });

  it('C 小调用降号', () => {
    expect(keyUsesFlats(0, true)).toBe(true);
  });

  it('降号调下 Bb 不会写成 A#', () => {
    expect(pcName(10, true)).toBe('Bb');
    expect(pcName(10, false)).toBe('A#');
  });
});
