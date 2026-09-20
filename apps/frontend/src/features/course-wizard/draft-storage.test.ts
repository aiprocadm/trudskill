import { describe, expect, it, vi } from 'vitest';

import {
  COURSE_WIZARD_DRAFT_KEY,
  clearDraft,
  parseDraft,
  peekDraft,
  saveDraft
} from './draft-storage';
import { emptyDraft } from './wizard-state';

/** Черновик мастера (ФТ-E1, Фаза 2 Task 11b): закрытая вкладка не должна стоить работы. */

const memoryStorage = (): Storage => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    length: 0
  } as unknown as Storage;
};

describe('parseDraft', () => {
  it('пустое хранилище даёт пустой черновик', () => {
    expect(parseDraft(null)).toEqual(emptyDraft());
  });

  it('битый JSON не роняет мастер', () => {
    expect(parseDraft('{не json')).toEqual(emptyDraft());
  });

  it('чужая форма данных не протекает в черновик', () => {
    const draft = parseDraft(JSON.stringify({ code: 42, modules: 'нет', sequentialModules: 'да' }));
    expect(draft.code).toBe('');
    expect(draft.modules).toEqual([]);
    // Строка «да» — не true: иначе включился бы строгий порядок, которого никто не просил.
    expect(draft.sequentialModules).toBe(false);
  });

  it('модули и материалы восстанавливаются с приведением типов', () => {
    const draft = parseDraft(
      JSON.stringify({
        modules: [
          {
            title: 'М1',
            materials: [
              { title: 'В', materialType: 'video', minViewSeconds: 60.7, isRequired: false },
              { title: 'Х', materialType: 'взорвись', minViewSeconds: -5 }
            ]
          }
        ]
      })
    );

    expect(draft.modules[0]!.title).toBe('М1');
    expect(draft.modules[0]!.materials[0]).toMatchObject({ minViewSeconds: 61, isRequired: false });
    // Неизвестный тип материала откатывается к тексту, а не роняет мастер.
    expect(draft.modules[0]!.materials[1]!.materialType).toBe('text');
    expect(draft.modules[0]!.materials[1]!.minViewSeconds).toBe(0);
  });
});

describe('saveDraft / peekDraft / clearDraft', () => {
  it('сохранённый черновик читается обратно вместе со временем записи', () => {
    const storage = memoryStorage();
    const draft = { ...emptyDraft(), code: 'OT-40', title: 'Курс' };
    const now = new Date(2026, 8, 20, 14, 20);

    saveDraft(draft, storage, now);

    const found = peekDraft(storage, now);
    expect(found?.draft).toMatchObject({ code: 'OT-40', title: 'Курс' });
    expect(found?.savedAt.getTime()).toBe(now.getTime());
    expect(storage.getItem(COURSE_WIZARD_DRAFT_KEY)).toBeTruthy();
  });

  it('черновик не подставляется молча — его именно ПРЕДЛАГАЮТ (ТЗ 10.3, журнал 591)', () => {
    /*
     * Смысл `peekDraft` в том, что она НЕ трогает форму: решение «восстановить или начать
     * заново» принимает человек. Раньше мастер подставлял черновик сам, и человек видел
     * наполовину заполненную форму, не понимая, его это работа или чужая.
     */
    const storage = memoryStorage();
    const now = new Date(2026, 8, 20, 14, 20);
    saveDraft({ ...emptyDraft(), title: 'Недособранный' }, storage, now);

    const found = peekDraft(storage, now);
    expect(found).not.toBeNull();
    expect(found?.savedAt).toBeInstanceOf(Date);
  });

  it('просроченный черновик не предлагается и стирается', () => {
    /* Работу недельной давности человек не помнит: чистая форма честнее чужого текста. */
    const storage = memoryStorage();
    saveDraft({ ...emptyDraft(), title: 'Давний' }, storage, new Date(2026, 8, 1, 10, 0));

    expect(peekDraft(storage, new Date(2026, 8, 20, 10, 0))).toBeNull();
    expect(storage.getItem(COURSE_WIZARD_DRAFT_KEY)).toBeNull();
  });

  it('пустое хранилище — предлагать нечего', () => {
    expect(peekDraft(memoryStorage(), new Date())).toBeNull();
  });

  it('очистка убирает черновик', () => {
    const storage = memoryStorage();
    saveDraft(emptyDraft(), storage);
    clearDraft(storage);
    expect(storage.getItem(COURSE_WIZARD_DRAFT_KEY)).toBeNull();
  });

  it('сбой хранилища (приватный режим) не ломает мастер', () => {
    const broken = {
      getItem: vi.fn(() => {
        throw new Error('denied');
      }),
      setItem: vi.fn(() => {
        throw new Error('quota');
      }),
      removeItem: vi.fn(() => {
        throw new Error('denied');
      })
    } as unknown as Storage;

    expect(() => saveDraft(emptyDraft(), broken)).not.toThrow();
    expect(() => clearDraft(broken)).not.toThrow();
    expect(peekDraft(broken)).toBeNull();
  });

  it('ключ версионированный — старый черновик другой формы не подхватывается', () => {
    expect(COURSE_WIZARD_DRAFT_KEY).toMatch(/\.v\d+$/);
  });
});
