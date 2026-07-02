import type { ReactElement, ReactNode } from 'react';

export type CalloutTone = 'info' | 'success' | 'warning' | 'danger';

// Статичная плашка поверх готовых классов ui-callout--<tone> (foundation.ts).
// info/success — фоновое status-сообщение; warning/danger — alert (озвучивается сразу).
export const Callout = ({
  tone = 'info',
  title,
  children
}: {
  tone?: CalloutTone;
  title?: string;
  children: ReactNode;
}): ReactElement => (
  <div
    className={`ui-callout ui-callout--${tone}`}
    role={tone === 'warning' || tone === 'danger' ? 'alert' : 'status'}
  >
    <div>
      {title ? <p className="ui-callout__title">{title}</p> : null}
      {children}
    </div>
  </div>
);
