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

import {
  UI_THEME_STORAGE_KEY,
  type UiThemeChoice,
  UiThemeContextProvider
} from './theme-context.js';
import { uiGlobalStyles } from '../styles/index.js';
import { baseVars, darkThemeVars, lightThemeVars } from '../tokens/index.js';

// Чистая сборка inline-переменных: базовые токены + переменные выбранной темы.
// Вынесена из useMemo, чтобы быть тестируемой (конвенция пакета — без RTL).
export const buildThemeVars = (resolved: 'light' | 'dark'): CSSProperties =>
  ({ ...baseVars, ...(resolved === 'dark' ? darkThemeVars : lightThemeVars) }) as CSSProperties;

type ThemeStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

/**
 * Сохранённый выбор темы (`BR-023`, период двойного чтения): новый ключ, при его
 * отсутствии — прежний. Вынесено чистой функцией, чтобы механизм проверялся тестом
 * напрямую: в пакете нет RTL, а внутри useEffect он был бы недосягаем.
 */
export const readStoredThemeChoice = (storage: {
  getItem: (key: string) => string | null;
}): UiThemeChoice | null => {
  const raw = storage.getItem(UI_THEME_STORAGE_KEY);
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : null;
};

/**
 * Запись выбора темы (`BR-023`). После выкатки N+1 ключ ровно один.
 *
 * Прежний ключ НЕ вычищается намеренно. Чтобы его стереть, пришлось бы навсегда оставить в
 * коде его имя — ради одной мёртвой строки в хранилище браузера у тех, кто не заходил всё
 * окно совместимости. Такой человек при следующем заходе просто получит системное
 * оформление и переключит тему заново. Решение записано в `docs/REBRANDING_KEYS_ROLLOUT.md`.
 */
export const migrateThemeChoice = (storage: ThemeStorage, value: UiThemeChoice): void => {
  storage.setItem(UI_THEME_STORAGE_KEY, value);
};

export const UiThemeProvider = ({ children }: PropsWithChildren): ReactElement => {
  const [choice, setChoiceState] = useState<UiThemeChoice>('system');
  const [systemDark, setSystemDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const stored = readStoredThemeChoice(localStorage);
      if (stored) {
        setChoiceState(stored);
        // Чтение — тоже переезд: см. пояснение у migrateThemeChoice.
        migrateThemeChoice(localStorage, stored);
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
      migrateThemeChoice(localStorage, value);
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
