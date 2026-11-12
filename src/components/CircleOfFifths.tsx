import type { PointerEvent as ReactPointerEvent } from 'react';
import { mod, pcName } from '../theory/pitch';

/**
 * 五度圈。
 *
 * 只是一个「和进行联动的选择器」：点一下试听该音上的七和弦，
 * 按住拖出去交给 ProgressionBar 决定插到第几个卡片——
 * 拖拽的命中判定要看卡片的 DOM 坐标，所以指针事件向上抛，不在这里处理。
 *
 * 外圈 12 个扇区从 12 点方向顺时针排五度：C G D A E B F# C# G# D# A# F，
 * 第 i 格音高类 = (7 * i) mod 12。
 *
 * 内圈是该外圈大调的**关系小调**（根音 + 9 个半音：C 大调 → A 小调），
 * 点击 / 拖出默认生成 m7 —— 「外圈调、内圈调的关系小调」是看五度圈最常用的一对。
 */

const CX = 112;
const CY = 112;
const R_OUT = 104;
const R_IN = 62;
/** 内圈比外圈内缘再收进去 1px，留一条缝给描边 */
const R_MINOR_OUT = 61;
const R_MINOR_IN = 30;
const R_LABEL = 83;
const R_MINOR_LABEL = 45.5;

export type FifthQuality = '7' | 'm7';

const polar = (r: number, deg: number): [number, number] => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
};

/** 环形扇区：从外半径 rOut 到内半径 rIn，覆盖第 i 格的 30° */
const ringPath = (i: number, rOut: number, rIn: number): string => {
  const a0 = i * 30 - 15;
  const a1 = i * 30 + 15;
  const [ox0, oy0] = polar(rOut, a0);
  const [ox1, oy1] = polar(rOut, a1);
  const [ix1, iy1] = polar(rIn, a1);
  const [ix0, iy0] = polar(rIn, a0);
  return [
    `M ${ox0.toFixed(2)} ${oy0.toFixed(2)}`,
    `A ${rOut} ${rOut} 0 0 1 ${ox1.toFixed(2)} ${oy1.toFixed(2)}`,
    `L ${ix1.toFixed(2)} ${iy1.toFixed(2)}`,
    `A ${rIn} ${rIn} 0 0 0 ${ix0.toFixed(2)} ${iy0.toFixed(2)}`,
    'Z',
  ].join(' ');
};

export function CircleOfFifths({
  keyRootPc,
  keyMinor = false,
  activePc,
  activeMinor = false,
  presentPcs,
  presentMinorPcs = [],
  flats,
  sourcePc,
  sourceMinor = false,
  onPointerDown,
  onPick,
}: {
  keyRootPc: number;
  /** 当前调是小调时，中心与内圈跟着亮 */
  keyMinor?: boolean;
  /** 当前选中的和弦根音（左→右联动） */
  activePc: number | null;
  /** 当前和弦是不是小和弦：决定亮内圈还是外圈 */
  activeMinor?: boolean;
  /** 进行里出现过的根音，给一圈更弱的提示 */
  presentPcs: number[];
  /** 进行里出现过的小和弦根音 */
  presentMinorPcs?: number[];
  flats: boolean;
  /** 正在被拖出去的音 */
  sourcePc: number | null;
  sourceMinor?: boolean;
  onPointerDown: (pc: number, quality: FifthQuality, e: ReactPointerEvent<SVGPathElement>) => void;
  /** 键盘 Enter / 空格：等价于点击 */
  onPick: (pc: number, quality: FifthQuality) => void;
}) {
  const present = new Set(presentPcs);
  const presentMinor = new Set(presentMinorPcs);

  return (
    <div className="fifths">
      <div className="fifths__head">
        <span className="fifths__title">五度圈</span>
        <span className="fifths__hint">外圈大调 · 内圈关系小调</span>
      </div>
      <svg
        className="fifths__svg"
        viewBox="0 0 224 224"
        role="group"
        aria-label="五度圈：外圈大调七和弦，内圈关系小调七和弦；点击试听，拖拽加入和弦进行"
      >
        {Array.from({ length: 12 }, (_, i) => {
          const pc = (i * 7) % 12;
          const [lx, ly] = polar(R_LABEL, i * 30);
          const cls = [
            'fifths__sector',
            !activeMinor && pc === activePc ? 'is-active' : '',
            present.has(pc) ? 'is-in' : '',
            !keyMinor && pc === keyRootPc ? 'is-key' : '',
            !sourceMinor && pc === sourcePc ? 'is-source' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <g key={`outer-${pc}`}>
              <path
                className={cls}
                d={ringPath(i, R_OUT, R_IN)}
                onPointerDown={(e) => onPointerDown(pc, '7', e)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onPick(pc, '7');
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label={`${pcName(pc, flats)} 属七和弦`}
              >
                <title>{`${pcName(pc, flats)}7 · 点击试听，拖到左边变成和弦卡`}</title>
              </path>
              <text
                x={lx}
                y={ly}
                className={`fifths__label ${!activeMinor && pc === activePc ? 'is-active' : ''}`}
                textAnchor="middle"
                dominantBaseline="central"
                pointerEvents="none"
              >
                {pcName(pc, flats)}
              </text>
            </g>
          );
        })}

        {Array.from({ length: 12 }, (_, i) => {
          const majorPc = (i * 7) % 12;
          const minorPc = mod(majorPc + 9);
          const [lx, ly] = polar(R_MINOR_LABEL, i * 30);
          const isActive = activeMinor && minorPc === activePc;
          const isKey = keyMinor && minorPc === keyRootPc;
          const cls = [
            'fifths__sector',
            'fifths__sector--minor',
            isActive ? 'is-active' : '',
            presentMinor.has(minorPc) ? 'is-in' : '',
            isKey ? 'is-key' : '',
            sourceMinor && minorPc === sourcePc ? 'is-source' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <g key={`minor-${minorPc}`}>
              <path
                className={cls}
                d={ringPath(i, R_MINOR_OUT, R_MINOR_IN)}
                onPointerDown={(e) => onPointerDown(minorPc, 'm7', e)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onPick(minorPc, 'm7');
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label={`${pcName(minorPc, flats)} 小七和弦，${pcName(majorPc, flats)} 的关系小调`}
              >
                <title>{`${pcName(minorPc, flats)}m7 · ${pcName(majorPc, flats)} 的关系小调，点击试听 / 拖到左边`}</title>
              </path>
              <text
                x={lx}
                y={ly}
                className={`fifths__minor-label ${isActive ? 'is-active' : ''}`}
                textAnchor="middle"
                dominantBaseline="central"
                pointerEvents="none"
              >
                {`${pcName(minorPc, flats)}m`}
              </text>
            </g>
          );
        })}

        <circle cx={CX} cy={CY} r={R_MINOR_IN - 2} className="fifths__hub" pointerEvents="none" />
        <text
          x={CX}
          y={CY - 6}
          className="fifths__key"
          textAnchor="middle"
          dominantBaseline="central"
          pointerEvents="none"
        >
          {pcName(keyRootPc, flats)}
        </text>
        <text
          x={CX}
          y={CY + 12}
          className="fifths__key-sub"
          textAnchor="middle"
          dominantBaseline="central"
          pointerEvents="none"
        >
          当前调
        </text>
      </svg>
    </div>
  );
}
