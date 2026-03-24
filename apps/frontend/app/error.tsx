'use client';

import { GlobalError } from '../src/components/state-wrappers';

export default function GlobalErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <div style={{ display: 'grid', gap: 10 }}>
        <GlobalError message={error.message} />
        <button type="button" onClick={reset}>Повторить</button>
      </div>
    </main>
  );
}
