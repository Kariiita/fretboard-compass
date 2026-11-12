import { useCallback, useEffect, useRef, useState } from 'react';
import { Chord, closeVoicingMidis } from '../theory/chords';
import { mod } from '../theory/pitch';
import { pluck } from '../audio/engine';

/**
 * 琶音播放：按和弦音程顺序逐个高亮 + 发声。
 * 高亮通过 activePc 传给指板。
 */
export function useArpeggio(chord: Chord | null) {
  const [activePc, setActivePc] = useState<number | null>(null);
  const timers = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const play = useCallback(() => {
    if (!chord) return;
    clearTimers();
    const intervals = chord.type.intervals;
    const midis = closeVoicingMidis(chord.root, chord.type);
    const step = 380;
    intervals.forEach((iv, i) => {
      const pc = mod(chord.root + iv);
      const midi = midis[i];
      const t = window.setTimeout(() => {
        setActivePc(pc);
        pluck(midi, 0, 0.24, 1.1);
      }, i * step);
      timers.current.push(t);
    });
    const end = window.setTimeout(() => setActivePc(null), intervals.length * step);
    timers.current.push(end);
  }, [chord, clearTimers]);

  return { activePc, play };
}
