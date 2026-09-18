import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { fromApp } from './app-root';
import { stripComments } from './backend-source';
import { blockingModuleTitle } from '../features/course-viewer/module-gate';
import { materialLockReason } from '../features/course-viewer/study-flow';

import type { ModuleGateState } from '../features/course-viewer/module-gate';
import type { CourseTree } from '../features/course-viewer/types';
import type { Progress } from '../features/mvp/types';

/**
 * Замок объяснён — обеими причинами (ТЗ «Стабилизация, UX и развитие», 6.5 / С5).
 *
 * **Как было.** Замков в курсе ДВА и они независимы: порядок материалов («не изучил
 * предыдущий») и ворота раздела («не сдал тест предыдущего раздела»). Подпись считалась
 * только по первому. Человек, изучивший ВСЕ материалы, читал «Откроется после изучения
 * предыдущих материалов» — условие, которое он уже выполнил, — перечитывал материалы и
 * звонил в учебный центр (журнал 501). У закрытого РАЗДЕЛА причины не было вовсе: значок и
 * слово «Раздел закрыт» (502).
 *
 * **Что закреплено.**
 *
 * 1. Причину считает ОДНА функция, знающая про оба замка.
 * 2. Ворота раздела важнее порядка материалов: пока тест не сдан, подпись говорит про тест.
 * 3. У закрытого раздела причина видна глазом, а не только в подписи значка.
 */

const TOC = fromApp('src', 'features', 'course-viewer', 'table-of-contents.tsx');
const read = (file: string): string => stripComments(readFileSync(file, 'utf8'));

const material = (id: string, title: string, sortOrder: number) =>
  ({ id, title, sortOrder, isRequired: true, materialType: 'text' }) as never;

const tree: CourseTree = [
  {
    module: { id: 'm1', title: 'Основы охраны труда', sortOrder: 1, isRequired: true } as never,
    materials: [material('a', 'Текст инструктажа', 1)]
  },
  {
    module: { id: 'm2', title: 'Работа на высоте', sortOrder: 2, isRequired: true } as never,
    materials: [material('b', 'Правила страховки', 1)]
  }
];

const completed = (ids: string[]): Map<string, Progress> =>
  new Map(ids.map((id) => [id, { status: 'completed' } as Progress]));

/** Тест первого раздела есть и НЕ сдан — значит второй раздел закрыт воротами. */
const gateClosed: ModuleGateState = new Map([['m1', { gatingTestId: 't1', passed: false }]]);
/** Тот же тест сдан — ворота открыты. */
const gateOpen: ModuleGateState = new Map([['m1', { gatingTestId: 't1', passed: true }]]);

describe('замок объяснён обеими причинами (ТЗ 6.5)', () => {
  it('ворота раздела называются прямо, а не прячутся за «предыдущими материалами»', () => {
    // Материалы первого раздела изучены — виновник ТОЛЬКО несданный тест.
    const reason = materialLockReason({
      tree,
      gate: gateClosed,
      progress: completed(['a']),
      moduleId: 'm2',
      materialId: 'b'
    });
    expect(reason).toBe('Откроется после того, как вы сдадите тест раздела «Основы охраны труда»');
    expect(
      reason,
      'старая подпись врала: человек изучил всё, что мог, и всё равно читал про материалы'
    ).not.toContain('после изучения предыдущих материалов');
  });

  it('когда причины ДВЕ, побеждают ворота раздела', () => {
    /*
     * Случай, различающий ПОРЯДОК правил: и материал не изучен, и тест не сдан. Первая
     * редакция сторожа этого не ловила — в её примере срабатывала только одна причина, и
     * любая очерёдность давала один ответ (журнал 504).
     *
     * Ворота важнее: доучив материал, человек всё равно не откроет раздел.
     */
    expect(
      materialLockReason({
        tree,
        gate: gateClosed,
        progress: completed([]),
        moduleId: 'm2',
        materialId: 'b'
      })
    ).toBe('Откроется после того, как вы сдадите тест раздела «Основы охраны труда»');
  });

  it('когда ворота открыты, причина снова про материалы', () => {
    expect(
      materialLockReason({
        tree,
        gate: gateOpen,
        progress: completed([]),
        moduleId: 'm2',
        materialId: 'b'
      })
    ).toBe('Откроется после изучения «Текст инструктажа»');
  });

  it('свой раздел виновником не назначается', () => {
    // Иначе материал внутри закрытого раздела обвинил бы сам себя.
    expect(blockingModuleTitle(tree, gateClosed, 'm1')).toBeNull();
    expect(blockingModuleTitle(tree, gateClosed, 'm2')).toBe('Основы охраны труда');
    expect(blockingModuleTitle(tree, gateOpen, 'm2'), 'сдан тест — ворота ни при чём').toBeNull();
  });

  it('необязательный раздел дверь не держит', () => {
    const optional: CourseTree = [
      {
        module: { id: 'm1', title: 'Методичка', sortOrder: 1, isRequired: false } as never,
        materials: [material('a', 'Памятка', 1)]
      },
      tree[1]!
    ];
    expect(blockingModuleTitle(optional, gateClosed, 'm2')).toBeNull();
  });

  it('оглавление берёт причину из общего правила, а не собирает само', () => {
    const code = read(TOC);
    expect(/materialLockReason\(/.test(code), 'решение живёт в одном месте').toBe(true);
    expect(/gate: moduleGate/.test(code), 'без состояния ворот причина считается наполовину').toBe(
      true
    );
  });

  it('у закрытого раздела причина видна глазом', () => {
    const code = read(TOC);
    expect(/course-toc-module-reason-/.test(code), 'раздел объясняет свой замок').toBe(true);
    expect(
      /label=\{moduleReason\}/.test(code),
      'читалка обязана произносить причину, а не слово «Раздел закрыт»'
    ).toBe(true);
    expect(code, 'прежняя немая подпись значка обязана исчезнуть').not.toContain(
      'label="Раздел закрыт"'
    );
  });

  it('план фазы 6 записан', () => {
    const plan = readFileSync(
      fromApp(
        '..',
        '..',
        'docs',
        'superpowers',
        'plans',
        '2026-09-18-stabux-phase-6-learner-cabinet.md'
      ),
      'utf8'
    );
    expect(plan).toContain('6.5');
    expect(plan, 'фаза идёт по плану — правило репозитория').toContain('Задача 4');
  });
});
