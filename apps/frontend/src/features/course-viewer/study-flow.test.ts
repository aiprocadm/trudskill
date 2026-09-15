import { describe, expect, it } from 'vitest';

import {
  blockingMaterialTitle,
  lockCaption,
  nextUnlockedMaterialId,
  orderedMaterials,
  studyButtonState
} from './study-flow';

import type { CourseTree, LockState, ProgressByMaterial } from './types';
import type { Material, Progress } from '../mvp/types';

/**
 * Движение по курсу (ТЗ «Стабилизация, UX и развитие», 2.5.b / Б7).
 *
 * Кнопки «Материал изучен → Далее» не было вовсе: прогресс двигался только счётчиком времени,
 * и человек не понимал, засчиталось ли что-нибудь и куда идти. У замка стояла общая подпись
 * «сначала пройдите предыдущие уроки» — какие именно, не сказано.
 */

const material = (id: string, sortOrder: number, extra: Partial<Material> = {}): Material =>
  ({
    id,
    tenantId: 't',
    moduleId: 'm1',
    title: `Материал ${id}`,
    materialType: 'text',
    sortOrder,
    minViewSeconds: 60,
    isRequired: true,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...extra
  }) as Material;

const tree: CourseTree = [
  {
    module: {
      id: 'm1',
      tenantId: 't',
      courseVersionId: 'v1',
      title: 'Модуль 1',
      sortOrder: 0,
      minViewSeconds: 0,
      isRequired: true,
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    } as CourseTree[number]['module'],
    materials: [
      material('a', 0, { title: 'Текст инструктажа' }),
      material('b', 1, { title: 'Правила работы на высоте' }),
      material('c', 2, { title: 'Итоговая памятка' })
    ]
  }
];

const progressWith = (completedIds: string[]): ProgressByMaterial =>
  new Map(
    completedIds.map((id) => [id, { materialId: id, status: 'completed' } as unknown as Progress])
  );

const locks = (entries: Record<string, 'unlocked' | 'locked'>): LockState =>
  new Map(Object.entries(entries));

describe('движение слушателя по курсу (ТЗ 2.5.b)', () => {
  it('материалы идут в порядке прохождения', () => {
    expect(orderedMaterials(tree).map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('«далее» ведёт к следующему ОТКРЫТОМУ материалу', () => {
    const state = locks({ a: 'unlocked', b: 'unlocked', c: 'unlocked' });
    expect(nextUnlockedMaterialId(tree, state, 'a')).toBe('b');
  });

  it('закрытые материалы пропускаются — в запертую дверь не ведём', () => {
    const state = locks({ a: 'unlocked', b: 'locked', c: 'unlocked' });
    expect(nextUnlockedMaterialId(tree, state, 'a')).toBe('c');
  });

  it('дальше идти некуда — честный null, а не первый попавшийся', () => {
    const state = locks({ a: 'unlocked', b: 'locked', c: 'locked' });
    expect(nextUnlockedMaterialId(tree, state, 'a')).toBeNull();
    expect(nextUnlockedMaterialId(tree, locks({ a: 'unlocked' }), 'c')).toBeNull();
  });

  it('подпись у замка называет ВИНОВНИКА по имени', () => {
    const blocking = blockingMaterialTitle(tree, progressWith([]), 'c');
    expect(blocking).toBe('Текст инструктажа');
    expect(lockCaption(blocking)).toBe('Откроется после изучения «Текст инструктажа»');
  });

  it('пройденные материалы больше не держат дверь', () => {
    expect(blockingMaterialTitle(tree, progressWith(['a']), 'c')).toBe('Правила работы на высоте');
  });

  it('необязательный материал дверь не держит', () => {
    const withOptional: CourseTree = [
      {
        module: tree[0]!.module,
        materials: [
          material('a', 0, { title: 'Необязательное чтение', isRequired: false }),
          material('b', 1, { title: 'Обязательный урок' }),
          material('c', 2)
        ]
      }
    ];
    expect(blockingMaterialTitle(withOptional, progressWith([]), 'c')).toBe('Обязательный урок');
  });

  it('у первого материала виновника нет — и мы не выдумываем', () => {
    expect(blockingMaterialTitle(tree, progressWith([]), 'a')).toBeNull();
    expect(lockCaption(null)).toBe('Откроется после изучения предыдущих материалов');
  });
});

describe('кнопка «Материал изучен» (ТЗ 2.5.b)', () => {
  const base = {
    material: material('a', 0),
    remainingSeconds: 0,
    enrollmentId: 'e1',
    alreadyCompleted: false
  };

  it('доступна, когда время изучения отсижено', () => {
    expect(studyButtonState(base)).toEqual({ enabled: true, reason: '' });
  });

  it('не даёт обойти обязательное время — и говорит, сколько осталось', () => {
    /*
     * `minViewSeconds` — требование обязательного обучения, а не украшение. Кнопка, отмечающая
     * материал досрочно, обесценила бы учебный центр перед проверкой.
     */
    const state = studyButtonState({ ...base, remainingSeconds: 42 });
    expect(state.enabled).toBe(false);
    expect(state.reason).toContain('42');
  });

  it('никогда не гаснет молча: у каждого отказа есть причина словами', () => {
    const cases = [
      studyButtonState({ ...base, remainingSeconds: 10 }),
      studyButtonState({ ...base, enrollmentId: null }),
      studyButtonState({ ...base, alreadyCompleted: true }),
      studyButtonState({ ...base, material: material('s', 0, { materialType: 'scorm' }) })
    ];
    for (const state of cases) {
      expect(state.enabled).toBe(false);
      expect(state.reason.length, 'погашенная кнопка без объяснения — это тупик').toBeGreaterThan(
        10
      );
    }
  });

  it('у SCORM кнопки нет: отметку ставит его собственный плеер', () => {
    const state = studyButtonState({
      ...base,
      material: material('s', 0, { materialType: 'scorm' })
    });
    expect(state.reason).toContain('сам');
  });

  it('без зачисления отметка не сохранится — говорим прямо', () => {
    const state = studyButtonState({ ...base, enrollmentId: null });
    expect(state.reason).toContain('учебный центр');
  });
});
