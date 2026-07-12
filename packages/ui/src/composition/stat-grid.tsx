import { StatCard } from '../components/stat-card/index';

import type { ReactElement, ReactNode } from 'react';

export interface StatGridItem {
  label: string;
  value: ReactNode;
  sub?: string;
}

// Канонический ряд метрик. Убивает 3 разные ручные отрисовки KPI (см. карту Фазы 3).
export const StatGrid = ({ items }: { items: StatGridItem[] }): ReactElement => (
  <div className="stat-grid">
    {items.map((item, index) => (
      <StatCard
        key={`${item.label}-${index}`}
        label={item.label}
        value={item.value}
        {...(item.sub ? { sub: item.sub } : {})}
      />
    ))}
  </div>
);
