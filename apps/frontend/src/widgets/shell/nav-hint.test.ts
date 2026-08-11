import { describe, expect, it } from 'vitest';

import { NAV_HINT_STORAGE_KEY, dismissNavHint, shouldShowNavHint } from './nav-hint';

describe('однократная подсказка о новом меню (IA-020)', () => {
  it('показывается, пока её не закрыли', () => {
    expect(shouldShowNavHint(() => null)).toBe(true);
  });

  it('не показывается после закрытия', () => {
    expect(shouldShowNavHint((key) => (key === NAV_HINT_STORAGE_KEY ? 'dismissed' : null))).toBe(
      false
    );
  });

  it('закрытие записывает отметку в хранилище', () => {
    const written: Record<string, string> = {};
    dismissNavHint((key, value) => {
      written[key] = value;
    });
    expect(written[NAV_HINT_STORAGE_KEY]).toBe('dismissed');
  });

  it('недоступное хранилище не ломает экран', () => {
    expect(
      shouldShowNavHint(() => {
        throw new Error('storage disabled');
      })
    ).toBe(false);
    expect(() =>
      dismissNavHint(() => {
        throw new Error('storage disabled');
      })
    ).not.toThrow();
  });

  it('ключ хранения не пересекается с ключом сессии', () => {
    expect(NAV_HINT_STORAGE_KEY).not.toBe('cdoprof.session.v1');
    expect(NAV_HINT_STORAGE_KEY.startsWith('cdoprof.')).toBe(true);
  });
});
