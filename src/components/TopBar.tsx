import { useFretStore } from '../store/useFretStore';
import type { CSSProperties } from 'react';
import { SCALES, getScale } from '../theory/scales';
import { TUNINGS } from '../theory/tuning';
import { pcName } from '../theory/pitch';
import { playSequence } from '../audio/engine';
import { FretModel } from '../theory/model';

export function TopBar({ model }: { model: FretModel }) {
  const rootPc = useFretStore((s) => s.rootPc);
  const scaleId = useFretStore((s) => s.scaleId);
  const tuningId = useFretStore((s) => s.tuningId);
  const capo = useFretStore((s) => s.capo);
  const displayMode = useFretStore((s) => s.displayMode);
  const clickMode = useFretStore((s) => s.clickMode);
  const showScale = useFretStore((s) => s.showScale);
  const showChord = useFretStore((s) => s.showChord);
  const showBoxes = useFretStore((s) => s.showBoxes);
  const volume = useFretStore((s) => s.volume);

  const setRoot = useFretStore((s) => s.setRoot);
  const setScale = useFretStore((s) => s.setScale);
  const setTuning = useFretStore((s) => s.setTuning);
  const setCapo = useFretStore((s) => s.setCapo);
  const setDisplayMode = useFretStore((s) => s.setDisplayMode);
  const setClickMode = useFretStore((s) => s.setClickMode);
  const toggleShowScale = useFretStore((s) => s.toggleShowScale);
  const toggleShowChord = useFretStore((s) => s.toggleShowChord);
  const toggleShowBoxes = useFretStore((s) => s.toggleShowBoxes);
  const setVolume = useFretStore((s) => s.setVolume);

  const playScale = () => {
    const sc = getScale(scaleId);
    const base = 48 + rootPc;
    const midis: number[] = [];
    for (let oct = 0; oct < 2; oct++) {
      sc.intervals.forEach((iv) => midis.push(base + iv + oct * 12));
    }
    midis.push(base + 24);
    playSequence(midis, 0.13, 0.18);
  };

  return (
    <section className="topbar">
      <div className="field field--roots">
        <label>调</label>
        <div className="chips">
          {Array.from({ length: 12 }, (_, pc) => (
            <button
              key={pc}
              className={`chip ${rootPc === pc ? 'is-on' : ''}`}
              onClick={() => setRoot(pc)}
            >
              {pcName(pc)}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>音阶</label>
        <select value={scaleId} onChange={(e) => setScale(e.target.value)}>
          {SCALES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>调弦</label>
        <select value={tuningId} onChange={(e) => setTuning(e.target.value)}>
          {TUNINGS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} · {t.short}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>变调夹</label>
        <div className="stepper">
          <button onClick={() => setCapo(capo - 1)} aria-label="减少变调夹">
            −
          </button>
          <span className="stepper-value">{capo === 0 ? '无' : `${capo} 品`}</span>
          <button onClick={() => setCapo(capo + 1)} aria-label="增加变调夹">
            +
          </button>
        </div>
      </div>

      <div className="field">
        <label>显示</label>
        <div className="segmented">
          <button
            className={displayMode === 'note' ? 'is-on' : ''}
            onClick={() => setDisplayMode('note')}
          >
            音名
          </button>
          <button
            className={displayMode === 'degree' ? 'is-on' : ''}
            onClick={() => setDisplayMode('degree')}
          >
            级数
          </button>
        </div>
      </div>

      <div className="field">
        <label>点按</label>
        <div className="segmented">
          <button className={clickMode === 'play' ? 'is-on' : ''} onClick={() => setClickMode('play')}>
            发音
          </button>
          <button
            className={clickMode === 'select' ? 'is-on' : ''}
            onClick={() => setClickMode('select')}
          >
            识别
          </button>
        </div>
      </div>

      <div className="field">
        <label>图层</label>
        <div className="chips">
          <button
            className={`chip chip--toggle ${showScale ? 'is-on' : ''}`}
            onClick={toggleShowScale}
            disabled={displayMode === 'degree'}
            title={
              displayMode === 'degree'
                ? '级数显示只标当前和弦的和弦内音，音阶音图层不可选'
                : undefined
            }
          >
            音阶音
          </button>
          <button className={`chip chip--toggle ${showChord ? 'is-on' : ''}`} onClick={toggleShowChord}>
            和弦音
          </button>
          <button className={`chip chip--toggle ${showBoxes ? 'is-on' : ''}`} onClick={toggleShowBoxes}>
            指型框
          </button>
        </div>
      </div>

      <div className="field field--volume">
        <label>音量</label>
        <div className="volume" style={{ '--vol': `${Math.round(volume * 100)}%` } as CSSProperties}>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(volume * 100)}
            onChange={(e) => setVolume(Number(e.target.value) / 100)}
            aria-label="总音量"
          />
          <span className="volume__value">{Math.round(volume * 100)}</span>
        </div>
      </div>

      <div className="field">
        <label>&nbsp;</label>
        <button className="btn btn--primary" onClick={playScale}>
          ▶ 播放音阶
        </button>
      </div>
    </section>
  );
}
