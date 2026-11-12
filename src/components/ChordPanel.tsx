import { useFretStore } from '../store/useFretStore';
import { FretModel } from '../theory/model';
import { CHORD_TYPES, closeVoicingMidis, getChordType } from '../theory/chords';
import { pcName } from '../theory/pitch';
import { voicingMidis } from '../theory/voicings';
import { strum } from '../audio/engine';

export function ChordPanel({ model, onArpeggio }: { model: FretModel; onArpeggio: () => void }) {
  const chord = model.chord;
  const activePosition = useFretStore((s) => s.activePosition);
  const setActivePosition = useFretStore((s) => s.setActivePosition);
  const setChord = useFretStore((s) => s.setChord);
  const clearChord = useFretStore((s) => s.clearChord);

  const playCurrent = () => {
    if (!chord) return;
    const v = model.positions[activePosition] ?? model.positions[0];
    if (v) {
      strum(voicingMidis(v, model.tuning), 0, 0.035, 0.15);
    } else {
      strum(closeVoicingMidis(chord.root, chord.type), 0, 0.03, 0.14);
    }
  };

  const pickPosition = (i: number) => {
    setActivePosition(i);
    const v = model.positions[i];
    if (v) strum(voicingMidis(v, model.tuning), 0, 0.035, 0.15);
  };

  return (
    <section className="panel">
      <header className="panel-head">
        <h2>当前和弦</h2>
        {chord && (
          <div className="panel-actions">
            <button className="btn" onClick={playCurrent}>
              ▶ 播放
            </button>
            <button className="btn" onClick={onArpeggio}>
              ◈ 琶音
            </button>
            <button className="btn btn--ghost" onClick={clearChord}>
              清除
            </button>
          </div>
        )}
      </header>

      {chord ? (
        <>
          <div className="chord-hero">
            <span className="chord-hero__symbol">{chord.symbol}</span>
            <div className="chord-hero__meta">
              <span>{chord.name}</span>
              <span className="chord-hero__notes">
                {chord.type.degrees
                  .map((d, i) => `${d}=${pcName((chord.root + chord.type.intervals[i]) % 12, model.flats)}`)
                  .join('  ')}
              </span>
            </div>
          </div>

          {model.guide && (model.guide.third || model.guide.seventh) && (
            <div className="guide-row">
              <span className="guide-title">导音</span>
              {model.guide.third && (
                <span className="guide-pill guide-pill--third">
                  3 音 {pcName(model.guide.third.pc, model.flats)}
                </span>
              )}
              {model.guide.seventh && (
                <span className="guide-pill guide-pill--seventh">
                  7 音 {pcName(model.guide.seventh.pc, model.flats)}
                </span>
              )}
            </div>
          )}

          <div className="box-list">
            <span className="box-list__title">可弹把位（{model.positions.length}）</span>
            <div className="box-list__items">
              {model.positions.map((v, i) => (
                <button
                  key={i}
                  className={`box-item ${i === activePosition ? 'is-active' : ''}`}
                  onClick={() => pickPosition(i)}
                >
                  <span className="box-item__fret">{v.minFret === 0 ? '开放' : `${v.minFret} 品`}</span>
                  <span className="box-item__shape">
                    {v.frets.map((f) => (f === null ? '×' : f)).join(' ')}
                  </span>
                </button>
              ))}
              {model.positions.length === 0 && (
                <span className="muted">
                  这个调弦 + 变调夹组合下没找到完整指型，试试减少变调夹或换把位。
                </span>
              )}
            </div>
          </div>
        </>
      ) : (
        <p className="muted">还没有选和弦。可以点下面的和弦库，或从上方进行里选一个。</p>
      )}

      <div className="picker">
        <span className="picker__title">和弦库</span>
        <div className="chips chips--small">
          {Array.from({ length: 12 }, (_, pc) => (
            <button
              key={pc}
              className={`chip chip--sm ${chord?.root === pc ? 'is-on' : ''}`}
              onClick={() => setChord(pc, chord?.type.id ?? 'maj')}
            >
              {pcName(pc, model.flats)}
            </button>
          ))}
        </div>
        <select
          value={chord?.type.id ?? 'maj'}
          onChange={(e) => setChord(chord?.root ?? model.rootPc, e.target.value)}
        >
          {CHORD_TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}（{t.suffix || '大三'}）
            </option>
          ))}
        </select>
      </div>

      <div className="diatonic">
        <span className="picker__title">调内和弦（{pcName(model.rootPc, model.flats)} 大调 / 小调）</span>
        <div className="chips chips--small">
          {model.diatonic7.map((d) => (
            <button
              key={d.degreeIndex}
              className="chip chip--sm chip--diatonic"
              onClick={() => setChord(d.rootPc, d.typeId)}
              title={d.name}
            >
              <b>{d.roman}</b>
              <span>{d.symbol}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

export function chordTypeLabel(id: string): string {
  const t = getChordType(id);
  return t.name + (t.suffix ? `（${t.suffix}）` : '');
}
