import type { ReactElement, ReactNode } from 'react';

// Карточка-метрика поверх готовых CSS-классов stat-card__* (foundation.ts).
// value — ReactNode: число, строка или готовый узел с форматированием.
export const StatCard = ({
  label,
  value,
  sub
}: {
  label: string;
  value: ReactNode;
  sub?: string;
}): ReactElement => (
  <div className="stat-card">
    <span className="stat-card__label">{label}</span>
    <span className="stat-card__value">{value}</span>
    {sub ? <span className="stat-card__sub">{sub}</span> : null}
  </div>
);
