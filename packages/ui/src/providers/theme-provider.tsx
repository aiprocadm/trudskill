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
  LEGACY_UI_THEME_STORAGE_KEY,
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
  const raw = storage.getItem(UI_THEME_STORAGE_KEY) ?? storage.getItem(LEGACY_UI_THEME_STORAGE_KEY);
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : null;
};

/**
 * Переезд выбора темы: значение пишется под ОБА ключа (правило окна, см. cookie).
 *
 * ⚠️ Вызывается не только при переключении тумблера, но и при ЧТЕНИИ на старте. Иначе
 * человек, включивший тёмную тему когда-то давно и с тех пор тумблер не трогавший,
 * так и остался бы жить на прежнем ключе — а вторая выкатка (когда чтение прежнего
 * имени уберут) сбросила бы ему тему в системную. Ровно тот сброс, ради предотвращения
 * которого `BR-023` и написан. Из ключей выкатки тема — единственный, который не
 * переезжает «сам собой» при обычной работе: снимок сессии обновляется при каждом
 * входе, cookie — на каждом запросе, а тему можно не трогать годами.
 *
 * Прежний ключ не удаляется здесь намеренно: он держит откат без потерь и вычищается
 * на выкатке N+1 — так предписывает `BR-020` п.3.
 */
export const migrateThemeChoice = (storage: ThemeStorage, value: UiThemeChoice): void => {
  storage.setItem(UI_THEME_STORAGE_KEY, value);
  storage.setItem(LEGACY_UI_THEME_STORAGE_KEY, value);
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
