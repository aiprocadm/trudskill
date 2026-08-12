import type { ReactElement, ReactNode } from 'react';

/**
 * Сравнение рядом со значением (CMP-004).
 *
 * `direction` и `tone` разделены намеренно: рост числа блокеров — это стрелка вверх
 * и одновременно плохая новость (`up` + `negative`). Слить их в одно поле значит
 * раскрасить рост зелёным там, где он тревожный.
 */
export interface StatCardTrend {
  value: string;
  direction: 'up' | 'down' | 'flat';
  tone: 'positive' | 'negative' | 'neutral';
}

const DIRECTION_SIGN: Record<StatCardTrend['direction'], string> = {
  up: '↑',
  down: '↓',
  flat: '→'
};

// Карточка-метрика поверх готовых CSS-классов stat-card__* (foundation.ts).
// value — ReactNode: число, строка или готовый узел с форматированием.
export const StatCard = ({
  label,
  value,
  sub,
  trend,
  href
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  trend?: StatCardTrend;
  /** Карточка становится ссылкой: показатель без перехода оставляет вопрос «а дальше что». */
  href?: string;
}): ReactElement => {
  const body = (
    <>
      <span className="stat-card__label">{label}</span>
      <span className="stat-card__value">{value}</span>
      {trend ? (
        <span className={`stat-card__trend stat-card__trend--${trend.tone}`}>
          <span aria-hidden>{DIRECTION_SIGN[trend.direction]}</span> {trend.value}
        </span>
      ) : null}
      {sub ? <span className="stat-card__sub">{sub}</span> : null}
    </>
  );

  return href ? (
    <a className="stat-card stat-card--link" href={href}>
      {body}
    </a>
  ) : (
    <div className="stat-card">{body}</div>
  );
};
