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

export const UI_THEME_STORAGE_KEY = 'cdoprof-ui-theme';
