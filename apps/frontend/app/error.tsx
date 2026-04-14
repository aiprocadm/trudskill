'use client';

import { GlobalError } from '../src/components/state-wrappers';

export default function GlobalErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="ui-centered-page">
      <div className="ui-centered-stack">
        <GlobalError message={error.message} />
        <button type="button" className="ui-button" onClick={reset}>
          Повторить
        </button>
      </div>
    </main>
  );
}
