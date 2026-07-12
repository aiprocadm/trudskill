import type { PropsWithChildren, ReactElement, ReactNode } from 'react';

// Две колонки: main (секции) + aside (сводка KeyValueList/статус).
// Схлопывается в одну колонку на узких экранах (CSS .ui-detail в layout.ts).
export const DetailLayout = ({
  aside,
  children
}: PropsWithChildren<{ aside: ReactNode }>): ReactElement => (
  <div className="ui-detail">
    <div className="ui-detail__main">{children}</div>
    <aside className="ui-detail__aside">{aside}</aside>
  </div>
);
