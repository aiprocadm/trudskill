import { describe, expect, it } from 'vitest';

import {
  NAV_HINT_STORAGE_KEY,
  isNavHintDismissed,
  readNavHintState,
  writeNavHintDismissed
} from './nav-hint-storage';

/*
 * В проекте нет jsdom: тесты фронта идут в Node, window.localStorage не существует.
 * Поэтому функции принимают хранилище аргументом — это же делает проверяемым
 * случай приватного режима, где обращение к localStorage бросает исключение.
 */
const fakeStorage = (initial: Record<string, string> = {}): Storage => {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    clear: () => data.clear(),
    key: (index: number) => Array.from(data.keys())[index] ?? null,
    get length() {
      return data.size;
    }
  } as Storage;
};

const throwingStorage = () =>
  ({
    getItem: () => {
      throw new Error('SecurityError');
    },
    setItem: () => {
      throw new Error('SecurityError');
    }
  }) as unknown as Storage;

describe('память подсказки о новом меню (IA-020)', () => {
  it('по умолчанию подсказка показывается', () => {
    expect(isNavHintDismissed(readNavHintState(fakeStorage()))).toBe(false);
  });

  it('после закрытия подсказка больше не показывается', () => {
    const storage = fakeStorage();
    writeNavHintDismissed(storage);
    expect(isNavHintDismissed(readNavHintState(storage))).toBe(true);
  });

  it('мусор в ключе трактуется как «не закрыто», а не как ошибка', () => {
    // Цена ошибки разбора здесь — лишний показ подсказки, а не белый экран:
    // каркас приложения не должен падать из-за испорченного значения.
    const storage = fakeStorage({ [NAV_HINT_STORAGE_KEY]: '{{{' });
    expect(isNavHintDismissed(readNavHintState(storage))).toBe(false);
  });

  it('недоступное хранилище (приватный режим) не роняет ни чтение, ни запись', () => {
    const storage = throwingStorage();
    expect(() => readNavHintState(storage)).not.toThrow();
    expect(() => writeNavHintDismissed(storage)).not.toThrow();
    expect(isNavHintDismissed(readNavHintState(storage))).toBe(false);
  });

  it('ключ уже назван новым брендом — Фазе 8 его переименовывать не придётся', () => {
    // BR-020..BR-023 переименовывают старые ключи с периодом двойного чтения.
    // Заводить сегодня ещё один ключ со словом cdoprof значило бы добавить себе
    // работы в той фазе.
    expect(NAV_HINT_STORAGE_KEY).toBe('trudskill.ui.nav-hint.v1');
    expect(NAV_HINT_STORAGE_KEY).not.toContain('cdoprof');
  });
});
