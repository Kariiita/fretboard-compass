import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useFretStore } from '../store/useFretStore';
import { FretModel, chordPlayMidis, positionsFor } from '../theory/model';
import { CHORD_TYPES, commonSubstitutions, makeChord } from '../theory/chords';
import { strum } from '../audio/engine';
import { mod, pcName } from '../theory/pitch';

/**
 * 单个级数的和弦替换弹层，锚在对应和弦卡的正下方。
 *
 * 由 ProgressionBar 的悬停计时器打开（卡片悬停 1 秒，或二级菜单的「全部…」）。
 * 应用时存的是 rootOffset 而不是绝对根音，换调时替换过的和弦会跟着一起走。
 */
export function ChordSwapPopover({
  model,
  index,
  anchor,
  onClose,
  onKeepOpen,
  onCloseSoon,
}: {
  model: FretModel;
  index: number;
  /** 卡片左下角的视口坐标，弹层从左边缘对齐卡片、向下展开 */
  anchor: { left: number; top: number };
  onClose: () => void;
  /** 鼠标/焦点进入弹层：取消外层安排的延迟关闭 */
  onKeepOpen: () => void;
  /** 鼠标/焦点离开弹层：交给外层延迟关闭 */
  onCloseSoon: () => void;
}) {
  const chord = model.resolvedProgression[index];
  const setOverride = useFretStore((s) => s.setProgressionOverride);
  const clearOverride = useFretStore((s) => s.clearProgressionOverride);
  const setChord = useFretStore((s) => s.setChord);
  const setActiveStep = useFretStore((s) => s.setActiveStep);
  const storedVoicing = useFretStore((s) => s.progressionVoicings[index]);
  const setProgressionVoicing = useFretStore((s) => s.setProgressionVoicing);

  const [rootPc, setRootPc] = useState(chord?.rootPc ?? 0);
  const [typeId, setTypeId] = useState(chord?.typeId ?? 'maj');
  const [posIndex, setPosIndex] = useState<number | null>(storedVoicing ?? null);
  const [pos, setPos] = useState({ ...anchor, maxHeight: 600 });
  const boxRef = useRef<HTMLDivElement>(null);

  // 贴着卡片下方放；右侧放不下就夹回视口。高度不够时压矮让内容内部滚动，
  // 而不是往上顶——不然弹层会盖住卡片本身，和「正下方」的约定就对不上了。
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const w = el.offsetWidth;
    const below = window.innerHeight - anchor.top - 10;
    setPos({
      left: Math.min(Math.max(10, anchor.left), Math.max(10, window.innerWidth - w - 10)),
      top: anchor.top,
      maxHeight: Math.min(600, Math.max(260, below)),
    });
  }, [anchor.left, anchor.top]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    // 页面或卡片行一滚，锚点就对不上了，直接收起来
    const onScroll = (e: Event) => {
      if (!boxRef.current || !(e.target instanceof Node) || !boxRef.current.contains(e.target)) {
        onClose();
      }
    };
    const onResize = () => onClose();
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [onClose]);

  if (!chord) return null;

  const preview = makeChord(rootPc, typeId, model.flats);
  const subs = commonSubstitutions(typeId);

  // 把位按「当前预览的根音 + 类型」实时查；换了根音/类型后旧下标可能越界，自动退回默认
  const positions = positionsFor(rootPc, typeId, model.tuning, model.capo);
  const validPos = posIndex !== null && positions[posIndex] ? posIndex : null;

  const apply = () => {
    setOverride(index, mod(rootPc - chord.baseRootPc), typeId);
    // 上面那步会把旧把位清掉，所以要在它之后再写新的
    setProgressionVoicing(index, validPos);
    setChord(rootPc, typeId);
    setActiveStep(index);
    onClose();
  };

  const restore = () => {
    // 还原同时清掉把位：形状已经回到默认和弦，再留着旧下标只会对错
    clearOverride(index);
    // 和弦面板也要跟着回到进行默认的那个，不然指板还亮着旧和弦
    setChord(chord.baseRootPc, chord.baseTypeId);
    setActiveStep(index);
    onClose();
  };

  const audition = () => {
    strum(chordPlayMidis(rootPc, typeId, model.tuning, model.capo, validPos), 0, 0.03, 0.14);
  };

  return (
    <div
      ref={boxRef}
      className="swap-pop"
      role="dialog"
      aria-label={`替换 ${chord.roman} 和弦`}
      style={{ left: pos.left, top: pos.top, maxHeight: pos.maxHeight }}
      onMouseEnter={onKeepOpen}
      onMouseLeave={onCloseSoon}
      onFocus={onKeepOpen}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onCloseSoon();
      }}
    >
      <header className="swap-pop__head">
        <div>
          <span className="swap-pop__kicker">
            替换第 {index + 1} 个和弦 · 级数 {chord.roman}
          </span>
          <h3>
            {preview.symbol}
            <span>{preview.name}</span>
          </h3>
        </div>
        <button className="btn btn--ghost" onClick={onClose}>
          关闭
        </button>
      </header>

      <section className="swap-pop__section">
        <div className="swap-pop__title">播放把位 · 试听、应用和进行播放都用这里选的指法</div>
        <div className="voicing-grid">
          <button
            className={`voicing-chip ${validPos === null ? 'is-on' : ''}`}
            onClick={() => setPosIndex(null)}
          >
            <b>默认</b>
            <span>紧凑声位</span>
            <em>不打乱低音弦</em>
          </button>
          {positions.map((v, i) => (
            <button
              key={i}
              className={`voicing-chip ${validPos === i ? 'is-on' : ''}`}
              onClick={() => setPosIndex(i)}
            >
              <b>把位 {i + 1}</b>
              <span>{v.minFret === 0 ? '含空弦' : `${v.minFret}–${v.maxFret} 品`}</span>
              <em>{v.frets.map((f) => (f === null ? '×' : f)).join(' ')}</em>
            </button>
          ))}
        </div>
        {positions.length === 0 && (
          <p className="muted">当前调弦下没搜到完整指法，播放会使用紧凑声位。</p>
        )}
      </section>

      <section className="swap-pop__section">
        <div className="swap-pop__title">常用高级替换 · 同根音</div>
        <div className="sub-chips">
          {subs.length === 0 && <span className="muted">这个和弦已经是最终形态。</span>}
          {subs.map((t) => (
            <button
              key={t.id}
              className={`sub-chip ${t.id === typeId ? 'is-on' : ''}`}
              onClick={() => setTypeId(t.id)}
            >
              {pcName(rootPc, model.flats)}
              {t.suffix}
            </button>
          ))}
        </div>
      </section>

      <section className="swap-pop__section">
        <div className="swap-pop__title">根音</div>
        <div className="pc-grid">
          {Array.from({ length: 12 }, (_, pc) => (
            <button
              key={pc}
              className={`pc-btn ${pc === rootPc ? 'is-on' : ''}`}
              onClick={() => setRootPc(pc)}
            >
              {pcName(pc, model.flats)}
            </button>
          ))}
        </div>
      </section>

      <section className="swap-pop__section">
        <div className="swap-pop__title">和弦库 · {CHORD_TYPES.length} 种</div>
        <div className="type-grid">
          {CHORD_TYPES.map((t) => (
            <button
              key={t.id}
              className={`type-btn ${t.id === typeId ? 'is-on' : ''}`}
              onClick={() => setTypeId(t.id)}
            >
              <b>
                {pcName(rootPc, model.flats)}
                {t.suffix}
              </b>
              <span>{t.name}</span>
            </button>
          ))}
        </div>
      </section>

      <footer className="swap-pop__foot">
        <button className="btn" onClick={audition}>
          试听
        </button>
        <span className="swap-pop__spacer" />
        {chord.isOverride && (
          <button className="btn btn--ghost" onClick={restore}>
            恢复原和弦
          </button>
        )}
        <button className="btn btn--primary" onClick={apply}>
          应用替换
        </button>
      </footer>
    </div>
  );
}
