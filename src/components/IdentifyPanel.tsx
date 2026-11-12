import { useMemo } from 'react';
import { useFretStore } from '../store/useFretStore';
import { FretModel } from '../theory/model';
import { identifyChord } from '../theory/identify';
import { pcAt } from '../theory/tuning';
import { pcName } from '../theory/pitch';

export function IdentifyPanel({ model }: { model: FretModel }) {
  const pressed = useFretStore((s) => s.pressed);
  const clearPressed = useFretStore((s) => s.clearPressed);
  const setChord = useFretStore((s) => s.setChord);
  const setClickMode = useFretStore((s) => s.setClickMode);
  const clickMode = useFretStore((s) => s.clickMode);

  const result = useMemo(() => {
    if (pressed.length === 0) return null;
    const pcs = pressed.map((p) => pcAt(model.tuning, p.s, p.f));
    // 最低音 = 编号最小的弦（索引 0 = 6 弦）
    const lowest = [...pressed].sort((a, b) => a.s - b.s)[0];
    const bass = lowest ? pcAt(model.tuning, lowest.s, lowest.f) : null;
    return identifyChord(pcs, bass, model.flats, 5);
  }, [pressed, model.tuning, model.flats]);

  return (
    <section className="panel">
      <header className="panel-head">
        <h2>反向识别</h2>
        <div className="panel-actions">
          {clickMode !== 'select' && (
            <button className="btn btn--ghost" onClick={() => setClickMode('select')}>
              开启点按识别
            </button>
          )}
          {pressed.length > 0 && (
            <button className="btn btn--ghost" onClick={clearPressed}>
              清空
            </button>
          )}
        </div>
      </header>

      {pressed.length === 0 ? (
        <p className="muted">
          在上方指板上点几个位置（先把「点按」切到「识别」），这里会告诉你按的是什么和弦。
        </p>
      ) : (
        <>
          <div className="pressed-notes">
            {pressed
              .slice()
              .sort((a, b) => a.s - b.s || a.f - b.f)
              .map((p) => (
                <span key={`${p.s}-${p.f}`} className="pressed-chip">
                  {6 - p.s} 弦 {p.f} 品 · {pcName(pcAt(model.tuning, p.s, p.f), model.flats)}
                </span>
              ))}
          </div>

          {result && result.candidates.length > 0 ? (
            <div className="ident-list">
              {result.candidates.map((c, i) => (
                <button
                  key={c.symbol + c.type.id}
                  className={`ident-card ${i === 0 ? 'is-best' : ''}`}
                  onClick={() => setChord(c.root, c.type.id)}
                  title="点击把它设为当前和弦"
                >
                  <span className="ident-card__symbol">{c.symbol}</span>
                  <span className="ident-card__name">
                    {c.name}
                    {c.inversion && <em> · {c.inversion}</em>}
                  </span>
                  <span className="ident-card__score">{Math.round(c.score)}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="muted">这几个音凑不成一个常见和弦，换个按法试试。</p>
          )}

          {result && result.candidates.length > 1 && (
            <p className="hint">
              同一组音常常对应多个和弦（比如 C6 和 Am7 是同一堆音），这里按「贝斯音 + 常用度」排序，括号里是分数。
            </p>
          )}
        </>
      )}
    </section>
  );
}
