import { useMemo } from 'react';
import { useFretStore } from './store/useFretStore';
import { buildModel } from './theory/model';
import { midiAt } from './theory/tuning';
import { pluck } from './audio/engine';
import { useArpeggio } from './hooks/useArpeggio';
import { Fretboard } from './components/Fretboard';
import { TopBar } from './components/TopBar';
import { ProgressionBar } from './components/ProgressionBar';
import { ChordPanel } from './components/ChordPanel';
import { IdentifyPanel } from './components/IdentifyPanel';
import { AnalysisPanel } from './components/AnalysisPanel';
import { Legend } from './components/Legend';

export default function App() {
  const rootPc = useFretStore((s) => s.rootPc);
  const scaleId = useFretStore((s) => s.scaleId);
  const tuningId = useFretStore((s) => s.tuningId);
  const capo = useFretStore((s) => s.capo);
  const chord = useFretStore((s) => s.chord);
  const progressionId = useFretStore((s) => s.progressionId);
  const customSteps = useFretStore((s) => s.customSteps);
  const progressionOverrides = useFretStore((s) => s.progressionOverrides);
  const displayMode = useFretStore((s) => s.displayMode);
  const clickMode = useFretStore((s) => s.clickMode);
  const showScale = useFretStore((s) => s.showScale);
  const showChord = useFretStore((s) => s.showChord);
  const showBoxes = useFretStore((s) => s.showBoxes);
  const pressed = useFretStore((s) => s.pressed);
  const activePosition = useFretStore((s) => s.activePosition);
  const togglePressed = useFretStore((s) => s.togglePressed);
  const setActivePosition = useFretStore((s) => s.setActivePosition);

  const model = useMemo(
    () =>
      buildModel({
        rootPc,
        scaleId,
        tuningId,
        capo,
        chord,
        progressionId,
        customSteps,
        progressionOverrides,
      }),
    [rootPc, scaleId, tuningId, capo, chord, progressionId, customSteps, progressionOverrides],
  );

  const { activePc, play } = useArpeggio(model.chord);

  const onNoteClick = (s: number, f: number) => {
    pluck(midiAt(model.tuning, s, f), 0, 0.26, 1.8);
    if (clickMode === 'select') togglePressed(s, f);
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header__title">
          <h1>
            指板罗盘 <span>Fretboard Compass</span>
          </h1>
          <p>
            选一个调，看见整块指板；选一个和弦，看见所有能弹的把位。
          </p>
        </div>
        <div className="app-header__badges">
          <span className="badge">{model.scale.name}</span>
          <span className="badge badge--dim">{model.tuning.name}</span>
          {capo > 0 && <span className="badge badge--capo">CAPO {capo}</span>}
        </div>
      </header>

      <TopBar model={model} />
      <ProgressionBar model={model} />

      <section className="board-card">
        <Fretboard
          model={model}
          displayMode={displayMode}
          showScale={showScale}
          showChord={showChord}
          showBoxes={showBoxes}
          pressed={pressed}
          clickMode={clickMode}
          onNoteClick={onNoteClick}
          activePosition={activePosition}
          onPositionClick={setActivePosition}
          arpeggioPc={activePc}
        />
        <div className="board-foot">
          <Legend />
          <p className="board-hint">
            {clickMode === 'select'
              ? '识别模式：点指板上的位置选音，下方会给出和弦推断'
              : '点击任意位置试听。要反推和弦，把「点按」切到「识别」'}
            {capo > 0 && ' · 变调夹只限制可用把位，音高按实际发声计算'}
          </p>
        </div>
      </section>

      <div className="two-col">
        <ChordPanel model={model} onArpeggio={play} />
        <IdentifyPanel model={model} />
      </div>

      <AnalysisPanel model={model} />

      <footer className="app-footer">
        <span>指板罗盘 v0.1</span>
        <span>
          {model.tuning.name} · {model.tuning.short} · {model.scale.name}
        </span>
      </footer>
    </div>
  );
}
