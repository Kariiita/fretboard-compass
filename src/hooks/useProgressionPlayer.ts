import { useCallback, useEffect, useRef, useState } from 'react';
import { ResolvedChord } from '../theory/progressions';
import { Tuning } from '../theory/tuning';
import { chordPlayMidis } from '../theory/model';
import { now, strum } from '../audio/engine';

export interface ProgressionPlayerOptions {
  bpm: number;
  /** 每小节拍数：每拍扫一下，所以也等于每个和弦在一小节里弹几下 */
  beatsPerBar: number;
  loop: boolean;
  /** 当前调弦：用户选定的把位要按真实调弦取音 */
  tuning: Tuning;
  capo: number;
  /** 级数索引 → 把位下标；没选就用紧凑声位 */
  voicings: Record<number, number>;
}

/** 提前量：把 0.3 秒内该响的音一次性排进 AudioContext 的时间轴 */
const LOOKAHEAD = 0.3;
const TICK_MS = 50;

/**
 * 和弦进行播放：每个和弦占一小节，每拍扫一下。
 *
 * 计时不用 setTimeout 累加（主线程一卡拍子就漂），而是把绝对时间排进
 * AudioContext，再用 currentTime 反算当前在第几小节——`strum` 的 when
 * 就是 AudioContext 时间，排未来的音是安全的。
 */
export function useProgressionPlayer(chords: ResolvedChord[], options: ProgressionPlayerOptions) {
  const [playing, setPlaying] = useState(false);
  const [playingStep, setPlayingStep] = useState<number | null>(null);

  // 调度发生在定时器里，读 ref 才能拿到最新的和弦和设置
  const chordsRef = useRef(chords);
  chordsRef.current = chords;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const playingRef = useRef(false);
  const startAtRef = useRef(0);
  const nextMeasureRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    playingRef.current = false;
    clearTimer();
    setPlaying(false);
    setPlayingStep(null);
  }, [clearTimer]);

  const tickRef = useRef<() => void>(() => {});

  tickRef.current = () => {
    if (!playingRef.current) return;
    const list = chordsRef.current;
    if (list.length === 0) {
      stop();
      return;
    }

    const { bpm, beatsPerBar, loop, tuning, capo, voicings } = optionsRef.current;
    const beatSec = 60 / Math.max(30, bpm);
    const measureSec = beatSec * Math.max(1, beatsPerBar);
    const ctxNow = now();

    // 把该排的小节排完；非循环时排到最后一个和弦就停手
    for (;;) {
      const m = nextMeasureRef.current;
      if (!loop && m >= list.length) break;
      const when = startAtRef.current + m * measureSec;
      if (when > ctxNow + LOOKAHEAD) break;
      const stepIndex = m % list.length;
      const chord = list[stepIndex];
      // 用户为这个级数选了把位就用真实指法（带低音弦、可能转位），否则用紧凑声位
      const midis = chordPlayMidis(
        chord.rootPc,
        chord.typeId,
        tuning,
        capo,
        voicings[stepIndex],
      );
      for (let b = 0; b < beatsPerBar; b++) {
        // 已经错过的时间直接压到「马上」，不要往过去排
        strum(midis, Math.max(when + b * beatSec, ctxNow + 0.02), 0.03, 0.12);
      }
      nextMeasureRef.current = m + 1;
    }

    const elapsed = ctxNow - startAtRef.current;
    if (elapsed < 0) {
      setPlayingStep(0);
      return;
    }
    const measure = Math.floor(elapsed / measureSec);
    if (!loop && measure >= list.length) {
      stop();
      return;
    }
    setPlayingStep(measure % list.length);
  };

  const start = useCallback(() => {
    if (chordsRef.current.length === 0) return;
    clearTimer();
    playingRef.current = true;
    // 留一点起拍余量，第一个和弦不会因为主线程忙而被吞
    startAtRef.current = now() + 0.15;
    nextMeasureRef.current = 0;
    setPlaying(true);
    setPlayingStep(0);
    timerRef.current = window.setInterval(() => tickRef.current(), TICK_MS);
    tickRef.current();
  }, [clearTimer]);

  const toggle = useCallback(() => {
    if (playingRef.current) stop();
    else start();
  }, [start, stop]);

  // 改速度 / 拍号时重新起拍：已经排进 AudioContext 的小节无法撤回，
  // 只改未来小节的时长会让新旧两拍叠在一起。
  const lastShape = useRef({ bpm: options.bpm, beatsPerBar: options.beatsPerBar });
  useEffect(() => {
    const last = lastShape.current;
    if (last.bpm === options.bpm && last.beatsPerBar === options.beatsPerBar) return;
    lastShape.current = { bpm: options.bpm, beatsPerBar: options.beatsPerBar };
    if (playingRef.current) start();
  }, [options.bpm, options.beatsPerBar, start]);

  // 卸载时只收定时器，不再 setState
  useEffect(
    () => () => {
      playingRef.current = false;
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
    },
    [],
  );

  return { playing, playingStep, toggle, stop };
}
