import { FretModel } from '../theory/model';
import { pcAt } from '../theory/tuning';
import { mod, pcName } from '../theory/pitch';
import { intervalClass, DegreeClass } from '../theory/scales';
import { NoteHit } from '../store/useFretStore';

const FRETS = 15;
const NUT_X = 64;
const SPACING = 62;
const TOP = 52;
const GAP = 40;
const R = 12;
const W = NUT_X + FRETS * SPACING + 34;
const H = TOP + 5 * GAP + 54;

const xOf = (f: number) => NUT_X + (f - 0.5) * SPACING;
/**
 * 按看谱的习惯画：**6 弦（低音 E）在最下面，1 弦（高音 e）在最上面**。
 * 所以 y 要反过来算 —— s = 0 是最低的一行。
 */
const yOf = (s: number) => TOP + (5 - s) * GAP;

const INLAYS = [3, 5, 7, 9, 15];

interface Props {
  model: FretModel;
  displayMode: 'note' | 'degree';
  showScale: boolean;
  showChord: boolean;
  showBoxes: boolean;
  pressed: NoteHit[];
  clickMode: 'play' | 'select';
  onNoteClick: (s: number, f: number) => void;
  activePosition: number;
  onPositionClick: (i: number) => void;
  arpeggioPc: number | null;
}

export function Fretboard({
  model,
  displayMode,
  showScale,
  showChord,
  showBoxes,
  pressed,
  clickMode,
  onNoteClick,
  activePosition,
  onPositionClick,
  arpeggioPc,
}: Props) {
  const { tuning, capo, scaleDegrees, chordDegrees, chordTones, flats } = model;
  const chordSet = new Set(chordTones);
  const chordRoot = model.chord?.root ?? null;
  /** 音符层：音名模式有音阶音或和弦音就画；级数模式只认和弦音 */
  const notesVisible =
    displayMode === 'degree' ? showChord : showScale || showChord;
  /** 有和弦并且打开了和弦图层时，颜色 / 级数都相对和弦根音，而不是调内音级 */
  const chordActive = showChord && chordRoot !== null;
  /** 级数模式只认和弦内音；没有和弦时整块指板不标任何级数 */
  const chordDegreeMode = displayMode === 'degree';

  const pressedSet = new Set(pressed.map((p) => `${p.s}-${p.f}`));

  const activeVoicing = model.positions[activePosition] ?? null;
  const activeShape = new Set<string>();
  if (activeVoicing) {
    activeVoicing.frets.forEach((f, s) => {
      if (f !== null) activeShape.add(`${s}-${f}`);
    });
  }

  return (
    <svg className="fretboard" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="吉他指板">
      <rect x={0} y={0} width={W} height={H} fill="transparent" />

      {/* 变调夹左侧不可弹区域 */}
      {capo > 0 && (
        <rect
          x={NUT_X}
          y={TOP - 26}
          width={Math.max(0, (capo - 1) * SPACING)}
          height={5 * GAP + 52}
          fill="rgba(0,0,0,0.55)"
          rx={4}
        />
      )}

      {/* 品丝 */}
      {Array.from({ length: FRETS + 1 }, (_, f) => (
        <line
          key={`fret-${f}`}
          x1={NUT_X + f * SPACING}
          y1={TOP - 18}
          x2={NUT_X + f * SPACING}
          y2={TOP + 5 * GAP + 18}
          stroke={f === 0 ? '#ece2cf' : '#6b6052'}
          strokeWidth={f === 0 ? 5 : 2}
          strokeLinecap="round"
        />
      ))}

      {/* 品记 */}
      {INLAYS.map((f) => (
        <circle
          key={`inlay-${f}`}
          cx={xOf(f)}
          cy={yOf(2.5)}
          r={4.5}
          fill="#5a4e41"
        />
      ))}
      {[1.5, 3.5].map((pos) => (
        <circle key={`inlay12-${pos}`} cx={xOf(12)} cy={yOf(pos)} r={4.5} fill="#5a4e41" />
      ))}

      {/* 琴弦 */}
      {Array.from({ length: 6 }, (_, s) => (
        <line
          key={`string-${s}`}
          x1={NUT_X}
          y1={yOf(s)}
          x2={NUT_X + FRETS * SPACING}
          y2={yOf(s)}
          stroke="#c0b49b"
          strokeWidth={1 + (5 - s) * 0.34}
          opacity={0.68}
        />
      ))}

      {/* 变调夹 */}
      {capo > 0 && (
        <g>
          <rect
            x={NUT_X + (capo - 0.8) * SPACING}
            y={TOP - 24}
            width={13}
            height={5 * GAP + 48}
            rx={6}
            fill="#d99a55"
            stroke="#f2bf85"
            strokeWidth={1.5}
          />
          <text
            x={NUT_X + (capo - 0.8) * SPACING + 6.5}
            y={TOP - 32}
            textAnchor="middle"
            className="capo-label"
          >
            CAPO {capo}
          </text>
        </g>
      )}

      {/* 指型框依附和弦高亮：和弦音图层一关，框也一起隐藏 */}
      {showBoxes &&
        chordActive &&
        model.positions.map((v, i) => {
          const used = v.frets.map((f, s) => (f === null ? -1 : s)).filter((s) => s >= 0);
          if (used.length === 0) return null;
          // 6 弦在下面、1 弦在上面，所以直接按 y 坐标取上下界，别再按弦号 min/max
          const ys = used.map(yOf);
          const x1 = v.minFret <= 0 ? NUT_X + 5 : NUT_X + (v.minFret - 1) * SPACING + 5;
          const x2 = Math.max(x1 + 30, NUT_X + v.maxFret * SPACING - 5);
          const y1 = Math.min(...ys) - 19;
          const y2 = Math.max(...ys) + 19;
          const active = i === activePosition;
          return (
            <g key={`box-${i}`} className="box-hit" onClick={() => onPositionClick(i)}>
              <rect
                x={x1}
                y={y1}
                width={x2 - x1}
                height={y2 - y1}
                rx={10}
                fill={active ? 'rgba(233,167,95,0.10)' : 'rgba(233,167,95,0.04)'}
                stroke={active ? 'rgba(233,167,95,0.9)' : 'rgba(233,167,95,0.34)'}
                strokeWidth={active ? 2 : 1.4}
                strokeDasharray={active ? undefined : '6 5'}
              />
              <text x={x1 + 8} y={y1 + 13} className="box-label">
                {v.minFret === 0 ? '开放' : `${v.minFret} 品`}
              </text>
            </g>
          );
        })}

      {/* 音符：关掉「和弦音」图层后一个都不画 */}
      {notesVisible &&
        Array.from({ length: 6 }, (_, s) =>
          Array.from({ length: FRETS + 1 }, (_, f) => {
          const pc = pcAt(tuning, s, f);
          const inScale = showScale && scaleDegrees.has(pc);
          const inChord = chordActive && chordSet.has(pc);
          const blocked = f < capo;
          const key = `${s}-${f}`;
          const isPressed = pressedSet.has(key);
          // 选中的把位圈也属于和弦高亮：关掉和弦音后不能再留橙色虚线
          const isActiveShape = chordActive && activeShape.has(key);

          // 级数模式只显示和弦内音：其他调内音退成和调外音一样的小圆点，
          // 否则 24 个「无关」数字会把和弦形状淹没。
          if (chordDegreeMode ? !inChord : !inScale && !inChord) {
            return (
              <circle
                key={key}
                cx={f === 0 ? NUT_X - 26 : xOf(f)}
                cy={yOf(s)}
                r={2.4}
                fill="#3a3229"
              />
            );
          }

          // 和弦内音按「相对和弦根音」的音程着色；和弦图层关掉（或没选和弦）时
          // 调内音全部退回中性灰，只保留音名，不再有功能色。
          const cls: DegreeClass =
            chordActive && inChord
              ? intervalClass(mod(pc - chordRoot!))
              : 'other';

          const label =
            displayMode === 'note' ? pcName(pc, flats) : chordDegrees.get(pc) ?? '';

          return (
            <g
              key={key}
              className={`note-group ${clickMode === 'select' ? 'is-select' : ''}`}
              onClick={() => !blocked && onNoteClick(s, f)}
              opacity={blocked ? 0.24 : 1}
            >
              {arpeggioPc === pc && <circle cx={f === 0 ? NUT_X - 26 : xOf(f)} cy={yOf(s)} r={R + 9} className="arp-ring" />}
              <circle
                cx={f === 0 ? NUT_X - 26 : xOf(f)}
                cy={yOf(s)}
                r={R}
                className={`note note--${cls} ${inChord ? 'is-chord' : ''} ${inScale ? 'is-scale' : 'is-outside'}`}
              />
              {inChord && (
                <circle
                  cx={f === 0 ? NUT_X - 26 : xOf(f)}
                  cy={yOf(s)}
                  r={R + 3.2}
                  fill="none"
                  stroke="rgba(248,243,234,0.92)"
                  strokeWidth={1.6}
                />
              )}
              {isActiveShape && (
                <circle
                  cx={f === 0 ? NUT_X - 26 : xOf(f)}
                  cy={yOf(s)}
                  r={R + 6}
                  fill="none"
                  stroke="#e9a75f"
                  strokeWidth={1.4}
                  strokeDasharray="3 3"
                />
              )}
              {isPressed && (
                <circle
                  cx={f === 0 ? NUT_X - 26 : xOf(f)}
                  cy={yOf(s)}
                  r={R + 7.5}
                  fill="none"
                  stroke="#fbf7ef"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                />
              )}
              <text x={f === 0 ? NUT_X - 26 : xOf(f)} y={yOf(s) + 3.6} className="note-label">
                {label}
              </text>
            </g>
          );
        }),
      )}

      {/* 空弦音名 / 弦号 */}
      {Array.from({ length: 6 }, (_, s) => (
        <text key={`sname-${s}`} x={14} y={yOf(s) + 4} className="string-name">
          {pcName(pcAt(tuning, s, 0), flats)}
        </text>
      ))}

      {/* 品号 */}
      {Array.from({ length: FRETS }, (_, i) => i + 1).map((f) => (
        <text key={`fnum-${f}`} x={xOf(f)} y={H - 16} className="fret-num">
          {f}
        </text>
      ))}
    </svg>
  );
}
