import { useMemo, useState } from 'react';
import { useFretStore } from '../store/useFretStore';
import { FretModel } from '../theory/model';
import {
  guideTones,
  modalInterchange,
  modulationSuggestions,
  secondaryDominants,
  voiceLeading,
} from '../theory/analysis';
import { makeChord } from '../theory/chords';
import { asSeventhChord } from '../theory/progressions';
import { pcName } from '../theory/pitch';
import { getScale } from '../theory/scales';

type Tab = 'scale' | 'guide' | 'voice' | 'borrow' | 'secondary' | 'modulation';

const TABS: { id: Tab; label: string }[] = [
  { id: 'scale', label: '和弦-音阶' },
  { id: 'guide', label: '导音线' },
  { id: 'voice', label: '声部进行' },
  { id: 'borrow', label: '调式互换' },
  { id: 'secondary', label: '副属和弦' },
  { id: 'modulation', label: '转调' },
];

export function AnalysisPanel({ model, initialTab = 'scale' }: { model: FretModel; initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const setChord = useFretStore((s) => s.setChord);
  const setRoot = useFretStore((s) => s.setRoot);
  const setScale = useFretStore((s) => s.setScale);

  const progressionChords = useMemo(
    () => model.resolvedProgression.map((c) => makeChord(c.rootPc, c.typeId, model.flats)),
    [model.resolvedProgression, model.flats],
  );

  // 导音线看的是三音和七音，进行里的三和弦先升成七和弦
  const guideChords = useMemo(
    () => model.resolvedProgression.map((c) => asSeventhChord(c, model.diatonic7, model.flats)),
    [model.resolvedProgression, model.diatonic7, model.flats],
  );

  const borrowed = useMemo(
    () => modalInterchange(model.rootPc, model.parent, model.flats),
    [model.rootPc, model.parent, model.flats],
  );

  const secondary = useMemo(
    () => secondaryDominants(model.diatonic, model.flats),
    [model.diatonic, model.flats],
  );

  const modulations = useMemo(
    () => modulationSuggestions(model.rootPc, model.parent, model.flats),
    [model.rootPc, model.parent, model.flats],
  );

  return (
    <section className="panel analysis">
      <header className="panel-head">
        <h2>乐理深度</h2>
        <div className="tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`tab ${tab === t.id ? 'is-on' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {tab === 'scale' && (
        <div className="tab-body">
          {model.chord ? (
            <>
              <p className="lead">
                <b>{model.chord.symbol}</b> 上可以弹的音阶。点一个，指板上会切换成该音阶（根音跟随和弦根音）。
              </p>
              <div className="scale-suggest">
                {model.chordScales.map((s) => (
                  <button
                    key={s.scaleId}
                    className="scale-suggest__item"
                    onClick={() => {
                      setRoot(model.chord!.root);
                      setScale(s.scaleId);
                    }}
                  >
                    <span className="scale-suggest__name">
                      {pcName(model.chord!.root, model.flats)} {s.name}
                    </span>
                    <span className="scale-suggest__reason">{s.reason}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="muted">先选一个和弦。</p>
          )}
        </div>
      )}

      {tab === 'guide' && (
        <div className="tab-body">
          {guideChords.length > 0 ? (
            <>
              <p className="lead">
                三音与七音决定和弦的「性格」，也是即兴时最该盯住的两个音。（这里统一按七和弦看，三和弦已升成对应七和弦。）
              </p>
              <div className="guide-chain">
                {guideChords.map((c, i) => {
                  const g = guideTones(c);
                  const prev = i > 0 ? guideTones(guideChords[i - 1]) : null;
                  const move = (cur: number | null, pre: number | null) => {
                    if (cur === null || pre === null) return '';
                    const d = Math.min((cur - pre + 12) % 12, (pre - cur + 12) % 12);
                    const up = (cur - pre + 12) % 12 <= 6;
                    return d === 0 ? '保持' : `${up ? '↑' : '↓'}${d}`;
                  };
                  return (
                    <div className="guide-col" key={i}>
                      <div className="guide-col__chord">{c.symbol}</div>
                      <div className="guide-col__tone guide-col__tone--third">
                        3 · {g.third ? pcName(g.third.pc, model.flats) : '—'}
                        {prev && <em>{move(g.third?.pc ?? null, prev.third?.pc ?? null)}</em>}
                      </div>
                      <div className="guide-col__tone guide-col__tone--seventh">
                        7 · {g.seventh ? pcName(g.seventh.pc, model.flats) : '—'}
                        {prev && <em>{move(g.seventh?.pc ?? null, prev.seventh?.pc ?? null)}</em>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : model.chord && model.guide ? (
            <>
              <p className="lead">
                <b>{model.chord.symbol}</b> 的导音：
              </p>
              <div className="guide-row">
                {model.guide.third && (
                  <span className="guide-pill guide-pill--third">
                    三音 {pcName(model.guide.third.pc, model.flats)}
                  </span>
                )}
                {model.guide.seventh && (
                  <span className="guide-pill guide-pill--seventh">
                    七音 {pcName(model.guide.seventh.pc, model.flats)}
                  </span>
                )}
                {!model.guide.seventh && <span className="muted">这个和弦没有七音。</span>}
              </div>
            </>
          ) : (
            <p className="muted">先选一个和弦，或在上方选一条和弦进行。</p>
          )}
        </div>
      )}

      {tab === 'voice' && (
        <div className="tab-body">
          {progressionChords.length > 1 ? (
            <>
              <p className="lead">
                相邻和弦之间：共同音保留、其余音走最近的路，这样连接最平滑。
              </p>
              <div className="vl-list">
                {progressionChords.slice(0, -1).map((c, i) => {
                  const n = progressionChords[i + 1];
                  const vl = voiceLeading(c, n);
                  return (
                    <div className="vl-row" key={i}>
                      <span className="vl-row__pair">
                        {c.symbol} → {n.symbol}
                      </span>
                      <span className="vl-row__common">
                        共同音 {vl.common.length ? vl.common.map((p) => pcName(p, model.flats)).join(' ') : '无'}
                      </span>
                      <span className="vl-row__moves">
                        {vl.moves
                          .map(
                            (m) =>
                              `${pcName(m.from, model.flats)}${m.direction === 'up' ? '↑' : '↓'}${pcName(m.to, model.flats)}`,
                          )
                          .join('  ') || '—'}
                      </span>
                      <span
                        className={`vl-row__motion ${vl.motion <= 2 ? 'is-smooth' : vl.motion <= 5 ? 'is-mid' : 'is-rough'}`}
                      >
                        移动 {vl.motion} 半音
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="muted">选一条包含两个以上和弦的进行后可见。</p>
          )}
        </div>
      )}

      {tab === 'borrow' && (
        <div className="tab-body">
          <p className="lead">
            从同主音大小调借来的和弦 —— 调不变，色彩变。点一个设为当前和弦。
          </p>
          <div className="borrow-grid">
            {borrowed.map((b) => (
              <button
                key={b.label + b.symbol}
                className="borrow-card"
                onClick={() => setChord(b.rootPc, b.typeId)}
              >
                <span className="borrow-card__roman">{b.label}</span>
                <span className="borrow-card__symbol">{b.symbol}</span>
                <span className="borrow-card__note">{b.note}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === 'secondary' && (
        <div className="tab-body">
          <p className="lead">
            副属和弦：目标和弦上方五度的属七和弦，用来把任何和弦「推向」它。
          </p>
          <div className="borrow-grid">
            {secondary.map((b) => (
              <button
                key={b.label}
                className="borrow-card"
                onClick={() => setChord(b.rootPc, b.typeId)}
              >
                <span className="borrow-card__roman">{b.label}</span>
                <span className="borrow-card__symbol">{b.symbol}</span>
                <span className="borrow-card__note">{b.note}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === 'modulation' && (
        <div className="tab-body">
          <p className="lead">从当前调转出去的几个方向，按「平滑程度」排序。</p>
          <div className="mod-list">
            {modulations.map((m) => (
              <button
                key={`${m.targetRoot}-${m.targetMinor}`}
                className="mod-card"
                onClick={() => {
                  setRoot(m.targetRoot);
                  setScale(m.targetMinor ? 'aeolian' : 'major');
                }}
              >
                <span className="mod-card__name">{m.name}</span>
                <span className="mod-card__reason">{m.reason}</span>
                <span className="mod-card__shared">
                  共同音：{m.shared.slice(0, 7).join(' ')}
                </span>
                <span className="mod-card__bar" style={{ width: `${Math.min(100, m.strength * 3)}%` }} />
              </button>
            ))}
          </div>
          <p className="hint">当前调：{pcName(model.rootPc, model.flats)} · {getScale(model.parent.id).name}</p>
        </div>
      )}
    </section>
  );
}
