import type { CSSProperties, PropsWithChildren, ReactElement } from 'react';

export function PageContainer({ children }: PropsWithChildren): ReactElement {
  return <main className="ui-page-container">{children}</main>;
}

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
