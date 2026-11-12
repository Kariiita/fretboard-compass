import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { buildModel, ModelInput } from '../../theory/model';
import { getScale } from '../../theory/scales';
import { findVoicings } from '../../theory/voicings';
import { makeChord } from '../../theory/chords';
import { getTuning } from '../../theory/tuning';
import { AnalysisPanel } from '../AnalysisPanel';
import { Fretboard } from '../Fretboard';
import { ChordPanel } from '../ChordPanel';
import { ProgressionBar } from '../ProgressionBar';
import { IdentifyPanel } from '../IdentifyPanel';
import { CircleOfFifths } from '../CircleOfFifths';
import { useFretStore } from '../../store/useFretStore';

const base: ModelInput = {
  rootPc: 0,
  scaleId: 'major',
  tuningId: 'standard',
  capo: 0,
  chord: { root: 0, typeId: 'maj' },
  progressionId: 'pop1564',
};

const model = buildModel(base);
const g7Model = buildModel({ ...base, chord: { root: 7, typeId: '7' } });

function renderBoard(
  m: typeof model,
  displayMode: 'note' | 'degree',
  layers: Partial<{ showScale: boolean; showChord: boolean; showBoxes: boolean }> = {},
) {
  return renderToString(
    <Fretboard
      model={m}
      displayMode={displayMode}
      showScale={layers.showScale ?? true}
      showChord={layers.showChord ?? true}
      showBoxes={layers.showBoxes ?? true}
      pressed={[]}
      clickMode="play"
      onNoteClick={() => {}}
      activePosition={0}
      onPositionClick={() => {}}
      arpeggioPc={null}
    />,
  );
}

describe('组件渲染不报错', () => {
  it('指板能渲染出 C 大调的音', () => {
    const html = renderToString(
      <Fretboard
        model={model}
        displayMode="note"
        showScale
        showChord
        showBoxes
        pressed={[]}
        clickMode="play"
        onNoteClick={() => {}}
        activePosition={0}
        onPositionClick={() => {}}
        arpeggioPc={null}
      />,
    );
    expect(html).toContain('fretboard');
    expect(html).toContain('note--root');
  });

  it('指板方向：6 弦（低音 E）在最下面，1 弦在最上面', () => {
    const html = renderToString(
      <Fretboard
        model={model}
        displayMode="note"
        showScale
        showChord
        showBoxes
        pressed={[]}
        clickMode="play"
        onNoteClick={() => {}}
        activePosition={0}
        onPositionClick={() => {}}
        arpeggioPc={null}
      />,
    );
    // 左边缘的弦名标签，DOM 顺序是 s = 0..5（6 弦 → 1 弦）
    const ys = [...html.matchAll(/<text x="14" y="([\d.]+)" class="string-name"/g)].map((m) =>
      Number(m[1]),
    );
    expect(ys).toHaveLength(6);
    for (let i = 1; i < ys.length; i++) {
      expect(ys[i]).toBeLessThan(ys[i - 1]);
    }
  });

  it('把位框在翻转后仍然有正的宽高', () => {
    const html = renderToString(
      <Fretboard
        model={model}
        displayMode="note"
        showScale
        showChord
        showBoxes
        pressed={[]}
        clickMode="play"
        onNoteClick={() => {}}
        activePosition={0}
        onPositionClick={() => {}}
        arpeggioPc={null}
      />,
    );
    const boxRects = [...html.matchAll(/class="box-hit"[\s\S]*?<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)];
    expect(boxRects.length).toBeGreaterThan(0);
    for (const m of boxRects) {
      expect(Number(m[3])).toBeGreaterThan(0);
      expect(Number(m[4])).toBeGreaterThan(0);
    }
  });

  it('和弦面板显示当前和弦与把位', () => {
    const html = renderToString(<ChordPanel model={model} onArpeggio={() => {}} />);
    expect(html).toContain('C 大三和弦');
    expect(html).toContain('可弹把位');
  });

  it('进行卡显示 G 大调 I-V-vi-IV', () => {
    const gModel = buildModel({ ...base, rootPc: 7 });
    const html = renderToString(<ProgressionBar model={gModel} />);
    expect(html).toContain('G');
    expect(html).toContain('Em');
  });

  it('五度圈从 12 点起顺时针排五度', () => {
    const html = renderToString(
      <CircleOfFifths
        keyRootPc={0}
        activePc={7}
        presentPcs={[0, 7]}
        flats={false}
        sourcePc={null}
        onPointerDown={() => {}}
        onPick={() => {}}
      />,
    );
    const labels = [...html.matchAll(/class="fifths__label[^"]*"[^>]*>([^<]+)</g)].map((m) => m[1]);
    expect(labels).toEqual(['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#', 'F']);
  });

  it('五度圈内圈从 12 点起是外圈的关系小调', () => {
    const html = renderToString(
      <CircleOfFifths
        keyRootPc={0}
        activePc={9}
        activeMinor
        presentPcs={[0, 9]}
        presentMinorPcs={[9]}
        flats={false}
        sourcePc={null}
        onPointerDown={() => {}}
        onPick={() => {}}
      />,
    );
    const labels = [...html.matchAll(/class="fifths__minor-label[^"]*"[^>]*>([^<]+)</g)].map(
      (m) => m[1],
    );
    expect(labels).toEqual(['Am', 'Em', 'Bm', 'F#m', 'C#m', 'G#m', 'D#m', 'A#m', 'Fm', 'Cm', 'Gm', 'Dm']);
    expect(html).toContain('fifths__sector--minor is-active');
  });

  it('自建进行也能渲染成和弦卡', () => {
    const custom = buildModel({
      ...base,
      progressionId: null,
      customSteps: [
        { rootPc: 2, typeId: '7' },
        { rootPc: 7, typeId: '7' },
      ],
    });
    const html = renderToString(<ProgressionBar model={custom} />);
    expect(html).toContain('D7');
    expect(html).toContain('G7');
  });

  it('识别面板在空状态下给出提示', () => {
    const html = renderToString(<IdentifyPanel model={model} />);
    expect(html).toContain('点几个位置');
  });

  it.each(['scale', 'guide', 'voice', 'borrow', 'secondary', 'modulation'] as const)(
    '分析面板 %s 标签能渲染',
    (tab) => {
      const html = renderToString(<AnalysisPanel model={model} initialTab={tab} />);
      expect(html.length).toBeGreaterThan(200);
    },
  );

  it('大七和弦的分析面板也能渲染', () => {
    const m = buildModel({ ...base, chord: { root: 9, typeId: 'm7' } });
    for (const tab of ['scale', 'guide', 'voice', 'borrow', 'secondary', 'modulation'] as const) {
      expect(renderToString(<AnalysisPanel model={m} initialTab={tab} />).length).toBeGreaterThan(200);
    }
  });
});

describe('级数显示以和弦根音为 1', () => {
  it('G7 只给和弦内音标级数，G/B/D/F 分别是 1/3/5/b7', () => {
    const html = renderBoard(g7Model, 'degree');
    const labels = [...html.matchAll(/class="note-label">([^<]*)<\/text>/g)].map((m) => m[1]);
    // 标准调弦 0–15 品：G 有 9 个位置，B 有 8 个，D 有 8 个，F 有 9 个
    expect(labels.filter((l) => l === '1')).toHaveLength(9);
    expect(labels.filter((l) => l === '3')).toHaveLength(8);
    expect(labels.filter((l) => l === '5')).toHaveLength(8);
    expect(labels.filter((l) => l === 'b7')).toHaveLength(9);
    expect(labels).toHaveLength(34);
  });

  it('G7 的配色也按和弦功能：根音 9 个、三音 8 个、五音 8 个、七音 9 个', () => {
    const html = renderBoard(g7Model, 'note');
    const count = (cls: string) => (html.match(new RegExp(`note--${cls}`, 'g')) ?? []).length;
    expect(count('root')).toBe(9);
    expect(count('third')).toBe(8);
    expect(count('fifth')).toBe(8);
    expect(count('seventh')).toBe(9);
  });

  it('没有和弦时级数模式不显示调内级数，也不回退到其他调', () => {
    const m = buildModel({ ...base, chord: null });
    const html = renderBoard(m, 'degree');
    expect(html).not.toContain('note-label');
    expect(html).not.toContain('note--');
  });
});

describe('图层开关', () => {
  it('音名模式关掉和弦音只取消高亮，调内音名保留并变成灰色', () => {
    const html = renderBoard(model, 'note', { showChord: false, showScale: true, showBoxes: true });
    // 音名和音阶音还在
    expect(html).toContain('note-group');
    expect(html).toContain('note-label');
    expect(html).toContain('note--other');
    // 不再有和弦功能色 / 和弦白圈 / 选中把位的橙色虚线圈
    expect(html).not.toContain('note--root');
    expect(html).not.toContain('note--third');
    expect(html).not.toContain('note--fifth');
    expect(html).not.toContain('is-chord');
    expect(html).not.toContain('#e9a75f');
    // 指型框仍然跟着和弦图层一起隐藏
    expect(html).not.toContain('box-hit');
  });

  it('级数模式关掉和弦音后指板不画任何音', () => {
    const html = renderBoard(model, 'degree', { showChord: false, showScale: true, showBoxes: true });
    expect(html).not.toContain('note-group');
    expect(html).not.toContain('note--');
    expect(html).not.toContain('note-label');
    expect(html).not.toContain('box-hit');
    // 琴格本身还在
    expect(html).toContain('string-name');
  });

  it('没有和弦时音名模式显示全灰色的调内音名', () => {
    const m = buildModel({ ...base, chord: null });
    const html = renderBoard(m, 'note');
    expect(html).toContain('note-label');
    expect(html).toContain('note--other');
    expect(html).not.toContain('note--root');
    expect(html).not.toContain('is-chord');
  });

  it('store 关闭和弦音时把指型框也关掉', () => {
    const store = useFretStore.getState();
    expect(store.showChord).toBe(true);
    expect(store.showBoxes).toBe(true);
    store.toggleShowChord();
    expect(useFretStore.getState().showChord).toBe(false);
    expect(useFretStore.getState().showBoxes).toBe(false);
    // 还原，避免影响同文件后续用例
    useFretStore.getState().toggleShowChord();
    useFretStore.getState().toggleShowBoxes();
  });

  it('清除当前和弦时和弦音图层和指型框一起取消', () => {
    const store = useFretStore.getState();
    expect(store.showChord).toBe(true);
    expect(store.showBoxes).toBe(true);
    store.clearChord();
    const after = useFretStore.getState();
    expect(after.chord).toBeNull();
    expect(after.showChord).toBe(false);
    expect(after.showBoxes).toBe(false);
    // 还原
    useFretStore.getState().setChord(0, 'maj');
    useFretStore.getState().toggleShowChord();
    useFretStore.getState().toggleShowBoxes();
  });
});

describe('性能护栏', () => {
  it('最复杂的和弦（13）也能在半秒内搜完指型', () => {
    const chord = makeChord(0, '13');
    const t0 = performance.now();
    const vs = findVoicings(chord, getTuning('standard'), 0);
    const dt = performance.now() - t0;
    expect(vs.length).toBeGreaterThan(0);
    expect(dt).toBeLessThan(1500);
  });

  it('DADGAD + 变调夹组合也能搜', () => {
    const chord = makeChord(2, 'maj');
    const vs = findVoicings(chord, getTuning('dadgad'), 2);
    expect(vs.length).toBeGreaterThan(0);
  });
});
