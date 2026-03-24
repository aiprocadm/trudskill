import type { ReactElement } from 'react';

export function DemoCard({ title }: { title: string }): ReactElement {
  return (
    <section style={{ border: '1px solid #ddd', borderRadius: 12, padding: 16 }}>
      <h2>{title}</h2>
      <p>Shared UI package is connected.</p>
    </section>
  );
}
