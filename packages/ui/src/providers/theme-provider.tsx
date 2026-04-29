'use client';

import {
  type CSSProperties,
  type PropsWithChildren,
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useState
} from 'react';

import { uiGlobalStyles } from '../styles';
import { darkThemeVars, lightThemeVars } from '../tokens';
import { UI_THEME_STORAGE_KEY, type UiThemeChoice, UiThemeContextProvider } from './theme-context';

export const UiThemeProvider = ({ children }: PropsWithChildren): ReactElement => {
  const [choice, setChoiceState] = useState<UiThemeChoice>('system');
  const [systemDark, setSystemDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const raw = localStorage.getItem(UI_THEME_STORAGE_KEY);
      if (raw === 'light' || raw === 'dark' || raw === 'system') {
        setChoiceState(raw);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystemDark(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const resolved: 'light' | 'dark' = !mounted
    ? 'light'
    : choice === 'system'
      ? systemDark
        ? 'dark'
        : 'light'
      : choice;

  const setChoice = useCallback((value: UiThemeChoice) => {
    setChoiceState(value);
    try {
      localStorage.setItem(UI_THEME_STORAGE_KEY, value);
    } catch {
      /* ignore */
    }
  }, []);

  const themeValue = useMemo(
    () => ({
      choice,
      resolved,
      setChoice
    }),
    [choice, resolved, setChoice]
  );

  const vars = useMemo(() => {
    const source = resolved === 'dark' ? darkThemeVars : lightThemeVars;
    return Object.fromEntries(Object.entries(source)) as CSSProperties;
  }, [resolved]);

  return (
    <UiThemeContextProvider value={themeValue}>
      <div data-ui-theme={resolved} style={vars}>
        <style>{uiGlobalStyles}</style>
        {children}
      </div>
    </UiThemeContextProvider>
  );
};
