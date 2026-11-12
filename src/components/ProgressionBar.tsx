import { Fragment, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useFretStore } from '../store/useFretStore';
import { FretModel } from '../theory/model';
import {
  CUSTOM_PROGRESSION_ID,
  CustomStep,
  getProgression,
  progressionsByStyle,
  ResolvedChord,
  STYLE_LABELS,
} from '../theory/progressions';
import { commonSubstitutions, isMinorChordType, makeChord } from '../theory/chords';
import { chordPlayMidis } from '../theory/model';
import { strum } from '../audio/engine';
import { mod, pcName } from '../theory/pitch';
import { ChordSwapPopover } from './ChordSwapPopover';
import { CircleOfFifths, FifthQuality } from './CircleOfFifths';
import { useProgressionPlayer } from '../hooks/useProgressionPlayer';

/** 拖动超过这个距离才算「拖」，否则仍按点击试听处理 */
const DRAG_THRESHOLD = 6;

const BPM_MIN = 30;
const BPM_MAX = 300;

type DragState = {
  pc: number;
  quality: FifthQuality;
  x: number;
  y: number;
  moved: boolean;
  /** 松手会插到第几个和弦之前；null = 不在卡片行上方 */
  dropIndex: number | null;
};

export function ProgressionBar({ model }: { model: FretModel }) {
  const progressionId = useFretStore((s) => s.progressionId);
  const customSteps = useFretStore((s) => s.customSteps);
  const customName = useFretStore((s) => s.customName);
  const activeStep = useFretStore((s) => s.activeStep);
  const progressionVoicings = useFretStore((s) => s.progressionVoicings);
  const savedProgressions = useFretStore((s) => s.savedProgressions);
  const savedProgressionId = useFretStore((s) => s.savedProgressionId);
  const chooseProgression = useFretStore((s) => s.chooseProgression);
  const beginCustom = useFretStore((s) => s.beginCustom);
  const insertCustomStep = useFretStore((s) => s.insertCustomStep);
  const removeCustomStep = useFretStore((s) => s.removeCustomStep);
  const setActiveStep = useFretStore((s) => s.setActiveStep);
  const setChord = useFretStore((s) => s.setChord);
  const setOverride = useFretStore((s) => s.setProgressionOverride);
  const clearOverride = useFretStore((s) => s.clearProgressionOverride);
  const saveProgression = useFretStore((s) => s.saveProgression);
  const loadSavedProgression = useFretStore((s) => s.loadSavedProgression);
  const deleteSavedProgression = useFretStore((s) => s.deleteSavedProgression);

  /** 当前手上这条是从「我的进行」里载入的吗（决定保存时给不给「覆盖」） */
  const currentSaved = savedProgressionId
    ? savedProgressions.find((p) => p.id === savedProgressionId) ?? null
    : null;

  // 悬停 1 秒后从卡片正下方弹出的替换弹层；null = 关闭
  const [pop, setPop] = useState<{ index: number; left: number; top: number } | null>(null);
  const hoverTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);

  // 五度圈点击后记住的音：指板/和弦面板可能来自别处，但圈上要留住这次选择
  const [pickedPc, setPickedPc] = useState<number | null>(null);
  const [pickedMinor, setPickedMinor] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const dragCleanup = useRef<(() => void) | null>(null);

  const [bpm, setBpm] = useState(120);
  const [bpmText, setBpmText] = useState('120');
  const [beatsPerBar, setBeatsPerBar] = useState(4);
  const [loop, setLoop] = useState(true);

  // 「保存 / 我的进行」面板
  const [libOpen, setLibOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const libRef = useRef<HTMLDivElement>(null);

  const player = useProgressionPlayer(model.resolvedProgression, {
    bpm,
    beatsPerBar,
    loop,
    tuning: model.tuning,
    capo: model.capo,
    voicings: progressionVoicings,
  });

  const commitBpm = (raw: string) => {
    const n = Number(raw);
    const next = Number.isFinite(n) ? Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(n))) : bpm;
    setBpm(next);
    setBpmText(String(next));
  };

  const setBpmFromSlider = (n: number) => {
    setBpm(n);
    setBpmText(String(n));
  };

  const stopHover = () => {
    if (hoverTimer.current !== null) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  };
  const stopClose = () => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  // 卸载时清计时器，否则 setState 打到已卸载的组件上
  useEffect(
    () => () => {
      stopHover();
      stopClose();
      dragCleanup.current?.();
    },
    [],
  );

  // 保存面板点外面就收起
  useEffect(() => {
    if (!libOpen) return;
    const onDown = (e: MouseEvent) => {
      if (libRef.current && !libRef.current.contains(e.target as Node)) setLibOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [libOpen]);

  // 载入 / 切换已保存条目时，名称框跟着换成那一条的名字，
  // 这样直接点「覆盖」不会把名字改成上一次留下的内容。
  useEffect(() => {
    setSaveName(currentSaved?.name ?? '');
    // currentSaved 由 savedProgressionId 推导，只跟随来源条目的切换
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedProgressionId]);

  const openAt = (index: number, el: Element) => {
    const r = el.getBoundingClientRect();
    setPop({ index, left: r.left, top: r.bottom + 8 });
  };

  // 卡片和弹层之间隔了 8px，留一点宽限让鼠标能穿过去
  const closeSoon = () => {
    stopClose();
    closeTimer.current = window.setTimeout(() => {
      setPop(null);
      closeTimer.current = null;
    }, 180);
  };

  const hoverCard = (index: number, el: HTMLElement) => {
    stopHover();
    stopClose();
    // 已经开着别的级数的弹层，先关掉再重新计时
    setPop((p) => (p && p.index !== index ? null : p));
    hoverTimer.current = window.setTimeout(() => {
      openAt(index, el);
      hoverTimer.current = null;
    }, 1000);
  };

  const chords = model.resolvedProgression;
  const isCustom = customSteps !== null;

  const audition = (rootPc: number, typeId: string, position?: number | null) => {
    strum(chordPlayMidis(rootPc, typeId, model.tuning, model.capo, position), 0, 0.03, 0.13);
  };

  const clickCard = (c: ResolvedChord) => {
    // 点击是「试听 + 设为当前和弦」，触屏 tap 也会触发 mouseenter，所以顺手取消待开的弹层
    stopHover();
    setPickedPc(null);
    setChord(c.rootPc, c.typeId);
    setActiveStep(c.index);
    audition(c.rootPc, c.typeId, progressionVoicings[c.index]);
  };

  const applySub = (c: ResolvedChord, typeId: string) => {
    // setProgressionOverride 会清掉这个级数的把位（和弦形状已经变了）
    setOverride(c.index, mod(c.rootPc - c.baseRootPc), typeId);
    setChord(c.rootPc, typeId);
    setActiveStep(c.index);
    audition(c.rootPc, typeId, null);
  };

  // 还原要连当前和弦一起拉回来，否则指板上还亮着被换掉的旧和弦
  const restoreStep = (c: ResolvedChord) => {
    clearOverride(c.index);
    setChord(c.baseRootPc, c.baseTypeId);
    setActiveStep(c.index);
  };

  // ── 五度圈：点击试听 / 拖出成卡片 ─────────────────────

  const seedSteps = (): CustomStep[] =>
    chords.map((c) => ({ rootPc: c.rootPc, typeId: c.typeId }));

  const insertStepAt = (pc: number, quality: FifthQuality, index: number) => {
    insertCustomStep(index, { rootPc: pc, typeId: quality }, seedSteps());
    // 插入后 store 会选中新卡片；setChord 会把它清掉，所以这里再选回来
    setChord(pc, quality);
    setActiveStep(index);
    setPickedPc(null);
    audition(pc, quality, null);
  };

  const pickPc = (pc: number, quality: FifthQuality) => {
    setPickedPc(pc);
    setPickedMinor(quality === 'm7');
    const minor = quality === 'm7';
    // 先找完全同类型的卡片，再退而求其次找同根音、同「大小调家族」的卡片。
    // 点内圈 A 时，进行里的 Am7 / Am 都该亮，而不是亮 A7。
    const exact = chords.findIndex((c) => c.rootPc === pc && c.typeId === quality);
    const family = chords.findIndex(
      (c) => c.rootPc === pc && isMinorChordType(c.typeId) === minor,
    );
    const hit = exact >= 0 ? exact : family;
    if (hit >= 0) {
      // 进行里有这个根音：联动到那张卡片，听到的是卡片上的和弦
      const c = chords[hit];
      setChord(c.rootPc, c.typeId);
      setActiveStep(hit);
      audition(c.rootPc, c.typeId, progressionVoicings[hit]);
    } else {
      setChord(pc, quality);
      audition(pc, quality, null);
    }
  };

  /** 指针落在卡片行上时，算插入到第几个卡片之前 */
  const computeDropIndex = (x: number, y: number): number | null => {
    const row = rowRef.current;
    if (!row) return null;
    const rect = row.getBoundingClientRect();
    if (y < rect.top - 26 || y > rect.bottom + 30) return null;
    if (x < rect.left - 28 || x > rect.right + 28) return null;
    const cards = Array.from(row.querySelectorAll<HTMLElement>('[data-card]'));
    for (let i = 0; i < cards.length; i++) {
      const r = cards[i].getBoundingClientRect();
      if (x < r.left + r.width / 2) return i;
    }
    return cards.length;
  };

  const onCircleDown = (
    pc: number,
    quality: FifthQuality,
    e: ReactPointerEvent<SVGPathElement>,
  ) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const sx = e.clientX;
    const sy = e.clientY;
    let moved = false;
    setDrag({ pc, quality, x: sx, y: sy, moved: false, dropIndex: null });

    const onMove = (ev: PointerEvent) => {
      moved = Math.hypot(ev.clientX - sx, ev.clientY - sy) > DRAG_THRESHOLD;
      setDrag({
        pc,
        quality,
        x: ev.clientX,
        y: ev.clientY,
        moved,
        dropIndex: moved ? computeDropIndex(ev.clientX, ev.clientY) : null,
      });
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      dragCleanup.current = null;
    };
    const onUp = (ev: PointerEvent) => {
      cleanup();
      if (!moved) {
        pickPc(pc, quality);
      } else {
        const idx = computeDropIndex(ev.clientX, ev.clientY);
        if (idx !== null) insertStepAt(pc, quality, idx);
      }
      setDrag(null);
    };
    const onCancel = () => {
      cleanup();
      setDrag(null);
    };
    dragCleanup.current = cleanup;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  };

  const onSelectChange = (value: string) => {
    stopHover();
    stopClose();
    setPop(null);
    setPickedPc(null);
    setSaveNotice(null);
    if (value.startsWith('saved:')) loadSavedProgression(value.slice(6));
    else if (value === CUSTOM_PROGRESSION_ID) beginCustom(seedSteps());
    else chooseProgression(value || null);
  };

  const doSave = (mode: 'overwrite' | 'new') => {
    // 存的是眼下听得见的和弦，不是自建底稿：手动替换已经烘进 resolved 里了，
    // 若存 customSteps 会把用户刚换掉的和弦丢掉。
    const steps: CustomStep[] = chords.map((c) => ({ rootPc: c.rootPc, typeId: c.typeId }));
    const res = saveProgression(
      saveName,
      steps,
      mode === 'overwrite' ? savedProgressionId : null,
    );
    if (!res) return;
    setSaveNotice(
      res.overwritten
        ? `已覆盖「${res.name}」`
        : currentSaved
          ? `已另存为「${res.name}」`
          : `已保存「${res.name}」`,
    );
    // 保留实际写入的名字（空名字时 store 会生成默认名）
    setSaveName(res.name);
  };

  const def = progressionId ? getProgression(progressionId) : undefined;
  const groups = progressionsByStyle();

  const playingChord = player.playingStep !== null ? chords[player.playingStep] ?? null : null;
  const selectedChord = activeStep !== null ? chords[activeStep] ?? null : null;
  const activeChord = playingChord ?? selectedChord;
  const highlightPc = activeChord?.rootPc ?? pickedPc;
  const highlightMinor = activeChord ? isMinorChordType(activeChord.typeId) : pickedMinor;
  const presentMinorPcs = chords.filter((c) => isMinorChordType(c.typeId)).map((c) => c.rootPc);

  const dragSymbol = drag ? makeChord(drag.pc, drag.quality, model.flats).symbol : '';

  return (
    <section className="progbar">
      <div className="progbar-head">
        <div className="field field--inline">
          <label>和弦进行</label>
          <div className="prog-select-wrap">
            <select value={isCustom ? CUSTOM_PROGRESSION_ID : progressionId ?? ''} onChange={(e) => onSelectChange(e.target.value)}>
              <option value="">不使用进行</option>
              <option value={CUSTOM_PROGRESSION_ID}>
                自建进行{customName ? ` · ${customName}` : ' · 五度圈拖拽'}
              </option>
              {savedProgressions.length > 0 && (
                <optgroup label="我的进行">
                  {savedProgressions.map((p) => (
                    <option key={p.id} value={`saved:${p.id}`}>
                      {p.name} · {p.steps.length} 个和弦
                    </option>
                  ))}
                </optgroup>
              )}
              {groups.map((g) => (
                <optgroup key={g.style} label={STYLE_LABELS[g.style]}>
                  {g.items.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.description}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>

            {/* 鼠标悬停下拉框时从右侧展开：每个级数给几个同根音的高级替换 */}
            {chords.length > 0 && (
              <div className="prog-submenu" role="menu" aria-label="高级和弦替换">
                <div className="prog-submenu__inner">
                  <div className="prog-submenu__title">高级替换 · 点一下就换</div>
                  {chords.map((c) => {
                    const subs = commonSubstitutions(c.typeId).slice(0, 5);
                    return (
                      <div className="sub-step" key={c.index}>
                        <span className="sub-step__slot">{c.roman}</span>
                        <span className="sub-step__chord">{c.symbol}</span>
                        <div className="sub-chips">
                          {subs.map((t) => (
                            <button
                              key={t.id}
                              className="sub-chip"
                              onClick={() => applySub(c, t.id)}
                            >
                              {pcName(c.rootPc, model.flats)}
                              {t.suffix}
                            </button>
                          ))}
                          {c.isOverride && (
                            <button
                              className="sub-chip sub-chip--reset"
                              onClick={() => restoreStep(c)}
                            >
                              还原
                            </button>
                          )}
                          <button
                            className="sub-chip sub-chip--more"
                            onClick={(e) => {
                              stopHover();
                              setActiveStep(c.index);
                              openAt(c.index, e.currentTarget);
                            }}
                          >
                            全部…
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  <p className="prog-submenu__hint">
                    默认已经是加厚版；想听回原始三和弦，点「全部…」。
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
        {isCustom ? (
          <p className="progbar-desc">自建进行：拖五度圈插入 / 调整顺序，悬停卡片 1 秒可换和弦</p>
        ) : (
          def && <p className="progbar-desc">{def.description}</p>
        )}

        <div className="prog-library" ref={libRef}>
          <button
            className="btn btn--ghost prog-library__btn"
            onClick={() => {
              setLibOpen((v) => !v);
              setSaveNotice(null);
            }}
            aria-expanded={libOpen}
          >
            保存 / 我的进行
          </button>
          {libOpen && (
            <div className="prog-library__panel" role="dialog" aria-label="保存和管理和弦进行">
              <div className="prog-library__head">
                <b>保存当前进行</b>
                <button className="prog-library__close" onClick={() => setLibOpen(false)} aria-label="关闭">
                  ×
                </button>
              </div>
              {currentSaved && (
                <p className="prog-library__editing" title={currentSaved.name}>
                  正在编辑「{currentSaved.name}」· 覆盖原条目，或另存一份
                </p>
              )}
              <div className="prog-library__save">
                <input
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  onKeyDown={(e) => {
                    // 正在编辑已保存的进行时，回车默认覆盖；否则就是新建
                    if (e.key === 'Enter') doSave(currentSaved ? 'overwrite' : 'new');
                  }}
                  placeholder="给进行起个名字"
                  aria-label="进行名称"
                  maxLength={24}
                />
                <button
                  className="btn btn--primary"
                  onClick={() => doSave(currentSaved ? 'overwrite' : 'new')}
                  disabled={chords.length === 0}
                >
                  {currentSaved ? '覆盖原进行' : '保存'}
                </button>
              </div>
              {currentSaved && (
                <button
                  className="btn prog-library__save-new"
                  onClick={() => doSave('new')}
                  disabled={chords.length === 0}
                >
                  另存为新进行
                </button>
              )}
              {chords.length === 0 && <p className="prog-library__notice">先选一条进行，或从五度圈拖几个和弦进来。</p>}
              {saveNotice && <p className="prog-library__notice">{saveNotice}</p>}

              <div className="prog-library__title">我的进行（{savedProgressions.length}）</div>
              <div className="prog-library__list">
                {savedProgressions.length === 0 && (
                  <p className="prog-library__empty">还没有保存的进行。搭好后起个名字，下一次直接从这里载入。</p>
                )}
                {savedProgressions.map((p) => (
                  <div className="prog-library__row" key={p.id}>
                    <div className="prog-library__meta">
                      <b>{p.name}</b>
                      <span>{p.steps.length} 个和弦</span>
                    </div>
                    <button
                      className="sub-chip"
                      onClick={() => {
                        loadSavedProgression(p.id);
                        setSaveNotice(`已载入「${p.name}」`);
                      }}
                    >
                      载入
                    </button>
                    <button
                      className="sub-chip prog-library__del"
                      onClick={() => deleteSavedProgression(p.id)}
                      aria-label={`删除 ${p.name}`}
                    >
                      删除
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <span className="progbar-key">
          当前调：{pcName(model.rootPc, model.flats)}{' '}
          {model.scale.id === 'major' ? '大调' : model.scale.short}
        </span>
      </div>

      <div className="progbar-main">
        <div className="progbar-left">
          <div
            ref={rowRef}
            className={`progbar-cards ${chords.length === 0 ? 'progbar-cards--empty' : ''}`}
          >
            {chords.length === 0 && !drag?.moved && (
              <p className="progbar-empty">
                还没有和弦。从右边五度圈拖一个音过来，或在上方选一条进行。
              </p>
            )}
            {drag?.moved && drag.dropIndex === 0 && <div className="prog-drop-slot" />}
            {chords.map((c, i) => (
              <Fragment key={i}>
                <div className="chord-card-slot" data-card>
                  <button
                    className={`chord-card ${activeStep === i ? 'is-active' : ''} ${
                      player.playingStep === i ? 'is-playing' : ''
                    } ${c.isOverride ? 'is-edited' : ''}`}
                    onClick={() => clickCard(c)}
                    onMouseEnter={(e) => hoverCard(i, e.currentTarget)}
                    onMouseLeave={() => {
                      stopHover();
                      closeSoon();
                    }}
                    onFocus={(e) => {
                      // 键盘 Tab 过来才弹；鼠标点击虽然也会聚焦，但不该顺手开窗
                      if (e.currentTarget.matches(':focus-visible')) openAt(i, e.currentTarget);
                    }}
                    onBlur={closeSoon}
                    title={
                      (c.isOverride
                        ? `${c.name} · 点击试听，悬停 1 秒可再替换`
                        : `${c.name} · 点击试听，悬停 1 秒选择替换和弦`) +
                      (progressionVoicings[c.index] !== undefined
                        ? `（播放把位 ${progressionVoicings[c.index] + 1}）`
                        : '')
                    }
                  >
                    <span className="chord-card__roman">{c.roman}</span>
                    <span className="chord-card__symbol">{c.symbol}</span>
                    <span className="chord-card__name">{c.name}</span>
                    {progressionVoicings[c.index] !== undefined && (
                      <span className="chord-card__pos">把位 {progressionVoicings[c.index] + 1}</span>
                    )}
                  </button>
                  {isCustom && (
                    <button
                      className="chord-card__del"
                      title="移除这个和弦"
                      aria-label={`移除第 ${i + 1} 个和弦`}
                      onClick={() => removeCustomStep(i)}
                    >
                      ×
                    </button>
                  )}
                </div>
                {drag?.moved && drag.dropIndex === i + 1 && <div className="prog-drop-slot" />}
              </Fragment>
            ))}
          </div>

          <div className="prog-playbar">
            <button
              className={`btn ${player.playing ? 'btn--primary' : ''}`}
              onClick={player.toggle}
              disabled={chords.length === 0}
            >
              {player.playing ? '■ 停止' : '▶ 播放进行'}
            </button>
            <label className="play-field">
              <span>速度</span>
              <input
                type="range"
                min={50}
                max={200}
                step={1}
                value={Math.min(200, Math.max(50, bpm))}
                onChange={(e) => setBpmFromSlider(Number(e.target.value))}
                aria-label="速度"
              />
              <span className="play-bpm">
                <input
                  type="number"
                  min={BPM_MIN}
                  max={BPM_MAX}
                  step={1}
                  value={bpmText}
                  onChange={(e) => setBpmText(e.target.value)}
                  onBlur={() => commitBpm(bpmText)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      commitBpm(bpmText);
                      e.currentTarget.blur();
                    }
                  }}
                  aria-label="速度 BPM，可输入"
                />
                <em>BPM</em>
              </span>
            </label>
            <label className="play-field">
              <span>拍号</span>
              <select
                value={beatsPerBar}
                onChange={(e) => setBeatsPerBar(Number(e.target.value))}
                aria-label="拍号"
              >
                {[2, 3, 4, 5, 6, 7].map((n) => (
                  <option key={n} value={n}>
                    {n}/4
                  </option>
                ))}
              </select>
            </label>
            <button
              className={`loop-btn ${loop ? 'is-on' : ''}`}
              onClick={() => setLoop((v) => !v)}
              aria-pressed={loop}
              title={loop ? '循环播放：开' : '循环播放：关'}
              aria-label={loop ? '关闭循环播放' : '开启循环播放'}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path
                  d="M4 11a7 7 0 0 1 7-7h6m0 0-3-3m3 3-3 3M20 13a7 7 0 0 1-7 7H7m0 0 3 3m-3-3 3-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <span className="play-note">每个和弦一小节，每拍扫一下 · 悬停卡片 1 秒选播放把位</span>
          </div>
        </div>

        <CircleOfFifths
          keyRootPc={model.rootPc}
          keyMinor={!!model.scale.minorish}
          activePc={highlightPc}
          activeMinor={highlightMinor}
          presentPcs={chords
            .filter((c) => !isMinorChordType(c.typeId))
            .map((c) => c.rootPc)}
          presentMinorPcs={presentMinorPcs}
          flats={model.flats}
          sourcePc={drag?.moved ? drag.pc : null}
          sourceMinor={drag?.moved && drag.quality === 'm7'}
          onPointerDown={onCircleDown}
          onPick={pickPc}
        />
      </div>

      {pop && (
        <ChordSwapPopover
          key={pop.index}
          model={model}
          index={pop.index}
          anchor={{ left: pop.left, top: pop.top }}
          onClose={() => {
            stopClose();
            setPop(null);
          }}
          onKeepOpen={stopClose}
          onCloseSoon={closeSoon}
        />
      )}

      {/* 拖拽时跟着指针的预览卡，松手前就能看到会插入什么和弦 */}
      {drag?.moved && (
        <div className="drag-ghost" style={{ left: drag.x + 14, top: drag.y + 12 }}>
          {dragSymbol}
        </div>
      )}
    </section>
  );
}
