import { useMemo } from 'react';
import { useFretStore } from '../store/useFretStore';

const ITEMS = [
  { cls: 'root', label: '根音 1' },
  { cls: 'third', label: '三音 3' },
  { cls: 'fifth', label: '五音 5' },
  { cls: 'seventh', label: '七音 7' },
  { cls: 'other', label: '其他调内音' },
];

export function Legend() {
  const showChord = useFretStore((s) => s.showChord);
  const displayMode = useFretStore((s) => s.displayMode);
  // 和弦音图层关掉后指板上没有音符，图例也不该继续解释颜色
  if (!showChord) return null;
  // 级数模式只画和弦内音，「其他调内音」这一项不存在了
  const items = displayMode === 'degree' ? ITEMS.filter((i) => i.cls !== 'other') : ITEMS;
  return (
    <div className="legend">
      {items.map((i) => (
        <span key={i.cls} className="legend-item">
          <span className={`legend-dot note--${i.cls}`} />
          {i.label}
        </span>
      ))}
      {showChord && (
        <span className="legend-item">
          <span className="legend-ring" />
          和弦内音
        </span>
      )}
    </div>
  );
}
