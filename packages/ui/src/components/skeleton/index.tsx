import type { ReactElement } from 'react';

// Скелетон поверх готовых CSS-классов: ui-skeleton-block — grid-контейнер (foundation.ts),
// ui-skeleton-line — мерцающая полоса. Контейнер — единый live-region, полосы декоративные.
// Ширины линий чередуются (70/80/90%), как в существующих экранных скелетонах.
export const Skeleton = ({ lines = 3 }: { lines?: number }): ReactElement => (
  <div className="ui-skeleton-block" role="status" aria-live="polite" aria-label="Загрузка">
    {Array.from({ length: Math.max(1, lines) }, (_, index) => (
      <div
        key={index}
        className="ui-skeleton-line"
        style={{ width: `${70 + (index % 3) * 10}%` }}
        aria-hidden={true}
      />
    ))}
  </div>
);
