'use client';

import { createContext, useContext } from 'react';

export type UiThemeChoice = 'light' | 'dark' | 'system';

export type UiThemeContextValue = {
  choice: UiThemeChoice;
  resolved: 'light' | 'dark';
  setChoice: (value: UiThemeChoice) => void;
};

const UiThemeContext = createContext<UiThemeContextValue | null>(null);

export const UiThemeContextProvider = UiThemeContext.Provider;

export const useUiTheme = (): UiThemeContextValue => {
  const ctx = useContext(UiThemeContext);
  if (!ctx) {
    throw new Error('useUiTheme must be used within UiThemeProvider');
  }
  return ctx;
};

/*
 * BR-023 / UI-027 — выкатка N периода двойного чтения: прямое переименование сбросило бы
 * выбранную тему у всех. Читаем новый ключ → при отсутствии старый, пишем всегда новый.
 */
export const UI_THEME_STORAGE_KEY = 'trudskill-ui-theme';
/** Прежний ключ — только на период двойного чтения (60 дней). */
