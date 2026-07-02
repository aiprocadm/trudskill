import type { ReactElement, ReactNode } from 'react';

export type CalloutTone = 'info' | 'success' | 'warning' | 'danger';

// Статичная плашка поверх готовых классов ui-callout--<tone> (foundation.ts).
// info/success — фоновое status-сообщение; warning/danger — alert (озвучивается сразу).
export const Callout = ({
  tone = 'info',
  role,
  title,
  children
}: {
  tone?: CalloutTone;
  /** Переопределение роли: статичный баннер, видимый при загрузке страницы, — 'status'
   *  (иначе скринридер озвучит его как срочный alert на каждом заходе); по умолчанию — из tone. */
  role?: 'alert' | 'status';
  title?: string;
  children: ReactNode;
}): ReactElement => (
  <div
    className={`ui-callout ui-callout--${tone}`}
    role={role ?? (tone === 'warning' || tone === 'danger' ? 'alert' : 'status')}
  >
    <div>
      {title ? <p className="ui-callout__title">{title}</p> : null}
      {children}
    </div>
  </div>
);
