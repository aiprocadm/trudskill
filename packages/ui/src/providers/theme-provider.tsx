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
import { baseVars, darkThemeVars, lightThemeVars } from '../tokens';
import { UI_THEME_STORAGE_KEY, type UiThemeChoice, UiThemeContextProvider } from './theme-context';

// Чистая сборка inline-переменных: базовые токены + переменные выбранной темы.
// Вынесена из useMemo, чтобы быть тестируемой (конвенция пакета — без RTL).
export const buildThemeVars = (resolved: 'light' | 'dark'): CSSProperties =>
  ({ ...baseVars, ...(resolved === 'dark' ? darkThemeVars : lightThemeVars) }) as CSSProperties;

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

  const vars = useMemo(() => buildThemeVars(resolved), [resolved]);

  return (
    <UiThemeContextProvider value={themeValue}>
      <div data-ui-theme={resolved} style={vars}>
        <style>{uiGlobalStyles}</style>
        {children}
      </div>
    </UiThemeContextProvider>
  );
};
