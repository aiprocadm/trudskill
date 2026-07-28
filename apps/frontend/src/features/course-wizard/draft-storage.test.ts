import { describe, expect, it, vi } from 'vitest';

import {
  COURSE_WIZARD_DRAFT_KEY,
  clearDraft,
  loadDraft,
  parseDraft,
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

describe('saveDraft / loadDraft / clearDraft', () => {
  it('сохранённый черновик читается обратно', () => {
    const storage = memoryStorage();
    const draft = { ...emptyDraft(), code: 'OT-40', title: 'Курс' };

    saveDraft(draft, storage);

    expect(loadDraft(storage)).toMatchObject({ code: 'OT-40', title: 'Курс' });
    expect(storage.getItem(COURSE_WIZARD_DRAFT_KEY)).toBeTruthy();
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
    expect(loadDraft(broken)).toEqual(emptyDraft());
  });

  it('ключ версионированный — старый черновик другой формы не подхватывается', () => {
    expect(COURSE_WIZARD_DRAFT_KEY).toMatch(/\.v\d+$/);
  });
});
