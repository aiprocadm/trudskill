'use client';

import { useEffect, useState } from 'react';

import { isNavHintDismissed, readNavHintState, writeNavHintDismissed } from './nav-hint-storage';

/**
 * IA-020: однократное объяснение нового меню.
 *
 * Состояние читается только на клиенте после монтирования: на сервере
 * localStorage нет, и рендер разъехался бы с гидрацией.
 */
export const NavHint = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(!isNavHintDismissed(readNavHintState(window.localStorage)));
  }, []);

  if (!visible) return null;

  return (
    <div className="app-shell__hint" role="status">
      <p className="app-shell__hint-text">
        Меню стало короче. Всё остальное — в разделе «Ещё» и по Ctrl+K.
      </p>
      <button
        type="button"
        className="ui-button"
        onClick={() => {
          writeNavHintDismissed(window.localStorage);
          setVisible(false);
        }}
      >
        Понятно
      </button>
    </div>
  );
};
