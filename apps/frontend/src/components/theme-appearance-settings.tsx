'use client';

import { useUiTheme } from '@cdoprof/ui';

export const ThemeAppearanceSettings = () => {
  const { choice, setChoice } = useUiTheme();

  return (
    <div className="ui-stack" style={{ maxWidth: 420 }}>
      <p style={{ margin: 0, color: 'var(--ui-text-muted)', fontSize: 14, lineHeight: 1.5 }}>
        Тема применяется ко всему интерфейсу и сохраняется в этом браузере.
      </p>
      <label style={{ display: 'grid', gap: 6, fontSize: 14 }}>
        <span style={{ fontWeight: 600 }}>Оформление</span>
        <select
          className="ui-select"
          value={choice}
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'light' || v === 'dark' || v === 'system') setChoice(v);
          }}
        >
          <option value="system">Как в системе</option>
          <option value="light">Светлая</option>
          <option value="dark">Тёмная</option>
        </select>
      </label>
    </div>
  );
};
