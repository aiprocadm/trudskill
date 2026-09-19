import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { fromApp } from './app-root';
import { stripComments } from './backend-source';
import { choosePreviewVersion } from '../features/courses/course-preview';
import {
  buildProgramTree,
  canMove,
  moduleSummary,
  movedByOne
} from '../features/courses/program-tree';

import type { CourseModule, Material } from '../features/mvp/types';

/**
 * Программа курса деревом «модуль → материалы» (ТЗ «Стабилизация, UX и развитие», 8.4, часть 2).
 *
 * **Как было.** Два независимых блока: таблица «Модули» и блок «Материалы модуля», где модуль
 * приходилось ВЫБИРАТЬ ЗАНОВО в выпадающем списке, а материалы показывались только у одного
 * модуля. Программу целиком не было видно нигде — методист держал её в голове. Переставить
 * что-либо было нельзя вовсе: порядок задавался порядком заведения.
 *
 * **Что закреплено.**
 *
 * 1. Дерево показывает ВСЕ модули со ВСЕМИ материалами, в порядке прохождения.
 * 2. Модуль без материалов виден и назван пустым; материал без модуля не теряется молча.
 * 3. Порядок меняется кнопками «вверх»/«вниз» — они работают с клавиатуры и на телефоне,
 *    в отличие от перетаскивания мышью.
 * 4. Выпадающего выбора модуля в форме материала больше нет.
 */

const module_ = (id: string, title: string, sortOrder: number): CourseModule =>
  ({ id, title, sortOrder }) as CourseModule;

const material = (id: string, moduleId: string, title: string, sortOrder: number): Material =>
  ({ id, moduleId, title, sortOrder, materialType: 'text' }) as Material;

describe('дерево программы (ТЗ 8.4)', () => {
  it('модули и материалы идут в порядке прохождения, а не в порядке ответа сервера', () => {
    const tree = buildProgramTree(
      [module_('m2', 'Второй', 1), module_('m1', 'Первый', 0)],
      [material('x2', 'm1', 'Б', 1), material('x1', 'm1', 'А', 0)]
    );

    expect(tree.nodes.map((node) => node.module.title)).toEqual(['Первый', 'Второй']);
    expect(tree.nodes[0]?.materials.map((item) => item.title)).toEqual(['А', 'Б']);
  });

  it('пустой модуль виден и назван пустым', () => {
    /* Иначе методист увидит короткий блок и решит, что материалы просто не поместились. */
    const tree = buildProgramTree([module_('m1', 'Первый', 0)], []);

    expect(tree.nodes).toHaveLength(1);
    expect(moduleSummary(tree.nodes[0]!)).toContain('Материалов нет');
  });

  it('материал без модуля не теряется молча', () => {
    /*
     * Иначе в сумме материалов было бы меньше, чем методист завёл, и он не понял бы почему.
     */
    const tree = buildProgramTree(
      [module_('m1', 'Первый', 0)],
      [material('x1', 'm1', 'А', 0), material('x9', 'удалённый', 'Потеряшка', 0)]
    );

    expect(tree.nodes[0]?.materials).toHaveLength(1);
    expect(tree.orphans.map((item) => item.title)).toEqual(['Потеряшка']);
  });

  it('счёт материалов склоняется по-русски', () => {
    const one = buildProgramTree([module_('m', 'М', 0)], [material('a', 'm', 'А', 0)]);
    expect(moduleSummary(one.nodes[0]!)).toBe('1 материал');

    const three = buildProgramTree(
      [module_('m', 'М', 0)],
      [material('a', 'm', 'А', 0), material('b', 'm', 'Б', 1), material('c', 'm', 'В', 2)]
    );
    expect(moduleSummary(three.nodes[0]!)).toBe('3 материала');
  });
});

describe('перестановка пунктов программы (ТЗ 8.4)', () => {
  it('пункт меняется местами с соседом', () => {
    expect(movedByOne(['a', 'b', 'c'], 'b', 'up')).toEqual(['b', 'a', 'c']);
    expect(movedByOne(['a', 'b', 'c'], 'b', 'down')).toEqual(['a', 'c', 'b']);
  });

  it('у края списка двигать некуда — кнопки там не рисуются', () => {
    expect(canMove(['a', 'b'], 'a', 'up')).toBe(false);
    expect(canMove(['a', 'b'], 'a', 'down')).toBe(true);
    expect(canMove(['a', 'b'], 'b', 'down')).toBe(false);
    expect(canMove(['a'], 'a', 'up'), 'единственный пункт двигать некуда').toBe(false);
  });

  it('экран рисует стрелку только когда двигать есть куда', () => {
    /*
     * Выключенная стрелка — молчащая кнопка: человек жмёт, ничего не происходит, причина
     * неизвестна (ТЗ 5.8). Поэтому кнопка не выключается, а не рисуется.
     */
    const screen = stripComments(
      readFileSync(fromApp('src', 'features', 'courses', 'courses-screens.tsx'), 'utf8')
    );
    expect(screen).toContain("canMove(moduleIds, node.module.id, 'up') ?");
    expect(screen, 'выключенных стрелок в дереве быть не должно').not.toMatch(
      /disabled=\{!canMove\(/
    );
  });

  it('выпадающего выбора модуля в форме материала больше нет', () => {
    /*
     * Жалоба ТЗ дословно: «модуль приходится повторно выбирать в выпадающем списке».
     * Теперь материал добавляется в тот модуль, у которого нажали «Добавить материал».
     */
    const screen = stripComments(
      readFileSync(fromApp('src', 'features', 'courses', 'courses-screens.tsx'), 'utf8')
    );
    expect(screen).not.toContain('<option value="">Выберите модуль</option>');
    expect(screen).toContain('Добавить материал в «');
  });
});

describe('предпросмотр показывает то, что методист правит (ТЗ 8.4)', () => {
  it('опубликованная версия важнее черновой', () => {
    const choice = choosePreviewVersion([
      { id: 'v1', status: 'published', versionNo: 1 },
      { id: 'v2', status: 'draft', versionNo: 2 }
    ]);
    expect(choice.versionId).toBe('v1');
    expect(choice.note, 'показано ровно то, что видит слушатель — оговорка не нужна').toBe('');
  });

  it('без публикации показывается черновая — с честной оговоркой', () => {
    /*
     * Иначе методист, ещё не опубликовавший курс, увидел бы «в программе нет материалов» —
     * то есть продукт соврал бы ему про его же работу (журнал 539).
     */
    const choice = choosePreviewVersion([
      { id: 'v1', status: 'draft', versionNo: 1 },
      { id: 'v2', status: 'draft', versionNo: 2 }
    ]);
    expect(choice.versionId, 'берётся самая свежая').toBe('v2');
    expect(choice.note).toContain('Опубликованной версии пока нет');
  });

  it('версий нет вовсе — показывать нечего и выдумывать нечего', () => {
    expect(choosePreviewVersion([])).toEqual({ versionId: null, note: '' });
  });

  it('план фазы 8 записан', () => {
    const plan = readFileSync(
      fromApp(
        '..',
        '..',
        'docs',
        'superpowers',
        'plans',
        '2026-09-19-stabux-phase-8-role-cabinets.md'
      ),
      'utf8'
    );
    expect(plan).toContain('Часть 2');
  });
});
