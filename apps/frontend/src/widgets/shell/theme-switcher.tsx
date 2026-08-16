'use client';

import { useUiTheme } from '@trudskill/ui';

import type { ReactElement } from 'react';

/**
 * `UI-026`: переключатель темы в шапке, три состояния — светлая / тёмная / как в системе.
 *
 * До этого он жил только на экране настроек: человек, которому темно или слишком ярко прямо
 * сейчас, должен был вспомнить про существование настроек и дойти до них. Тема — это как
 * громкость: её меняют по ходу работы, а не «настраивают однажды».
 *
 * Почему список, а не кнопка-переключатель по кругу. Кнопка требует догадки, что будет
 * следующим нажатием, и не показывает текущее состояние словом. Правило продукта:
 * при выборе между «красиво» и «предсказуемо» выигрывает предсказуемое.
 */
const OPTIONS: Array<{ value: 'system' | 'light' | 'dark'; label: string }> = [
  { value: 'system', label: 'Как в системе' },
  { value: 'light', label: 'Светлая' },
  { value: 'dark', label: 'Тёмная' }
];

export const ThemeSwitcher = (): ReactElement => {
  const { choice, setChoice } = useUiTheme();

  return (
    <label className="app-shell__theme">
      {/* Подпись нужна тем, кто слушает экран: без неё список читается как «светлая, поле». */}
      <span className="app-shell__theme-label">Оформление</span>
      <select
        className="ui-select app-shell__theme-select"
        value={choice}
        aria-label="Оформление интерфейса"
        onChange={(event) => {
          const value = event.target.value;
          if (value === 'light' || value === 'dark' || value === 'system') setChoice(value);
        }}
      >
        {OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
};
