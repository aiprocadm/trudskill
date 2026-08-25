import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { clearUnsavedProgress, markUnsavedProgress, readUnsavedProgress } from './unsaved-progress';

/**
 * Пометка «прогресс курса не сохранился».
 *
 * Ради чего: финальная отправка прогресса при уходе со страницы глоталась молча, и человек
 * узнавал о потере только по незачтённому занятию. Показать сообщение в тот момент нельзя —
 * экран уже уходит; значит неудачу нужно запомнить и показать при следующем открытии.
 */

const originalWindow = globalThis.window;

const createLocalStorage = () => {
  const storage = new Map<string, string>();
  return {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
    clear: () => {
      storage.clear();
    }
  };
};

describe('пометка о несохранённом прогрессе курса', () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, 'window', {
      value: { localStorage: createLocalStorage() },
      configurable: true
    });
  });

  afterAll(() => {
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true });
  });

  beforeEach(() => {
    window.localStorage.clear();
  });

  it('без неудач пометки нет', () => {
    expect(readUnsavedProgress('mat_1')).toBeNull();
  });

  it('неудача запоминается и переживает закрытие вкладки', () => {
    markUnsavedProgress('mat_1');
    expect(readUnsavedProgress('mat_1')).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('пометки разных курсов не путаются', () => {
    // Иначе человек, у которого сорвалась отправка в одном курсе, получал бы
    // предупреждение во всех остальных — и перестал бы его читать.
    markUnsavedProgress('mat_1');
    expect(readUnsavedProgress('mat_2')).toBeNull();
  });

  it('успешная отправка снимает пометку', () => {
    markUnsavedProgress('mat_1');
    clearUnsavedProgress('mat_1');
    expect(readUnsavedProgress('mat_1')).toBeNull();
  });

  it('недоступное хранилище не роняет плеер', () => {
    // Приватный режим: записать нельзя. Предупредить не выйдет, но занятие должно идти.
    Object.defineProperty(globalThis, 'window', {
      value: {
        localStorage: {
          getItem: () => {
            throw new Error('denied');
          },
          setItem: () => {
            throw new Error('denied');
          },
          removeItem: () => {
            throw new Error('denied');
          }
        }
      },
      configurable: true
    });

    expect(() => markUnsavedProgress('mat_1')).not.toThrow();
    expect(readUnsavedProgress('mat_1')).toBeNull();
    expect(() => clearUnsavedProgress('mat_1')).not.toThrow();

    Object.defineProperty(globalThis, 'window', {
      value: { localStorage: createLocalStorage() },
      configurable: true
    });
  });
});
