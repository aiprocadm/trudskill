import type { CSSProperties, PropsWithChildren, ReactElement } from 'react';

export function PageContainer({ children }: PropsWithChildren): ReactElement {
  return <main style={{ maxWidth: 1200, margin: '0 auto', padding: 16 }}>{children}</main>;
}

export function Section({ children }: PropsWithChildren): ReactElement {
  return <section style={{ marginBottom: 16 }}>{children}</section>;
}

export function Stack({ children, gap = 12 }: PropsWithChildren<{ gap?: number }>): ReactElement {
  return <div style={{ display: 'flex', flexDirection: 'column', gap }}>{children}</div>;
}

export function Inline({ children, gap = 8, style }: PropsWithChildren<{ gap?: number; style?: CSSProperties }>): ReactElement {
  return <div style={{ display: 'flex', alignItems: 'center', gap, ...style }}>{children}</div>;
}

export function Card({ children }: PropsWithChildren): ReactElement {
  return <article style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>{children}</article>;
}
