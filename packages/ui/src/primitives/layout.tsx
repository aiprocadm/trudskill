import type { CSSProperties, PropsWithChildren, ReactElement } from 'react';

/*
 * PageContainer жил здесь примитивом без просторного режима; с переездом каркаса страницы
 * в composition/page-shell (CMP-020) канонической стала та версия — двум одноимённым
 * компонентам в одном пакете не место.
 */

export function Section({ children }: PropsWithChildren): ReactElement {
  return <section>{children}</section>;
}

export function Stack({ children }: PropsWithChildren): ReactElement {
  return <div className="ui-stack">{children}</div>;
}

export function Inline({
  children,
  style
}: PropsWithChildren<{ style?: CSSProperties }>): ReactElement {
  return (
    <div className="ui-inline" style={style}>
      {children}
    </div>
  );
}

export function Card({ children }: PropsWithChildren): ReactElement {
  return (
    <article className="ui-card" style={{ padding: 16 }}>
      {children}
    </article>
  );
}
