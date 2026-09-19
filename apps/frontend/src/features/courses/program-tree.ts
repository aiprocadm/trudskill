import { plural } from '../../lib/format/plural';

import type { CourseModule, Material } from '../mvp/types';

/**
 * Дерево программы «модуль → материалы» (ТЗ «Стабилизация, UX и развитие», 8.4).
 *
 * **Как было.** Два независимых блока: таблица «Модули» и блок «Материалы модуля», где модуль
 * приходилось ВЫБИРАТЬ ЗАНОВО в выпадающем списке. Программу целиком не было видно нигде:
 * чтобы проверить, что во втором модуле три материала, а в третьем ни одного, методист
 * перещёлкивал список и держал картину в голове. ТЗ просит дерево.
 *
 * Чистая часть вынесена сюда: порядок и состав дерева проверяются тестом без React.
 */

export interface ProgramNode {
  module: CourseModule;
  materials: Material[];
}

/**
 * Дерево в том порядке, в каком программу пройдёт слушатель.
 *
 * Модуль без материалов остаётся в дереве и виден пустым — это первое, что методист должен
 * заметить. Материал, чей модуль не пришёл, не теряется молча: он попадает в «потерянные»,
 * иначе человек видел бы в сумме меньше материалов, чем завёл, и не понимал почему.
 */
export const buildProgramTree = (
  modules: CourseModule[],
  materials: Material[]
): { nodes: ProgramNode[]; orphans: Material[] } => {
  const byModule = new Map<string, Material[]>();
  for (const material of materials) {
    const list = byModule.get(material.moduleId) ?? [];
    list.push(material);
    byModule.set(material.moduleId, list);
  }

  const known = new Set(modules.map((item) => item.id));
  const nodes = [...modules]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((module) => ({
      module,
      materials: [...(byModule.get(module.id) ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)
    }));

  const orphans = materials.filter((material) => !known.has(material.moduleId));
  return { nodes, orphans };
};

/**
 * Сдвиг пункта на шаг — тот же расчёт, что на сервере (`program-order.ts`).
 *
 * Повторён намеренно и с оговоркой: сервер не вправе доверять порядку, пришедшему с экрана,
 * а экран должен показать новый порядок сразу, не дожидаясь ответа. Правило простое и
 * проверяется с обеих сторон; если оно усложнится — переносить его в `shared-types`.
 */
export const movedByOne = (ids: string[], id: string, direction: 'up' | 'down'): string[] => {
  const index = ids.indexOf(id);
  if (index === -1) return ids;
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= ids.length) return ids;
  const next = [...ids];
  next[index] = ids[target]!;
  next[target] = id;
  return next;
};

/** Можно ли двинуть пункт в эту сторону — чтобы кнопка была выключена, а не отвечала молчанием. */
export const canMove = (ids: string[], id: string, direction: 'up' | 'down'): boolean => {
  const index = ids.indexOf(id);
  if (index === -1) return false;
  return direction === 'up' ? index > 0 : index < ids.length - 1;
};

/**
 * Что сказать про модуль в одной строке: сколько внутри материалов.
 *
 * Пустой модуль называется пустым прямо в заголовке — иначе методист увидит свёрнутый блок и
 * решит, что материалы просто не поместились.
 */
export const moduleSummary = (node: ProgramNode): string => {
  const count = node.materials.length;
  if (count === 0) return 'Материалов нет — слушателю в этом модуле нечего изучать';
  /* Склонение берётся из общего правила: своё второе разъехалось бы с первым (журнал 415). */
  return `${count} ${plural(count, ['материал', 'материала', 'материалов'])}`;
};
