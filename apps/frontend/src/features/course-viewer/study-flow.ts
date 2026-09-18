import { blockingModuleTitle } from './module-gate';

import type { ModuleGateState } from './module-gate';
import type { CourseTree, LockState, ProgressByMaterial } from './types';
import type { Material } from '../mvp/types';

/**
 * Движение слушателя по курсу: что дальше и почему закрыто (ТЗ 2.5.b / Б7).
 *
 * **Как было.** Кнопки «Материал изучен → Далее» не существовало вовсе: прогресс двигался
 * только счётчиком времени просмотра, и человек не понимал, засчиталось ли ему что-нибудь и
 * куда идти дальше. У замка стояла общая подпись «сначала пройдите предыдущие уроки» — какие
 * именно, не сказано, а в модуле из семи материалов это не подсказка, а загадка.
 *
 * Чистые функции, а не часть экрана: в наборе нет React Testing Library (CLAUDE.md), и порядок
 * прохождения — как раз то, что нужно проверять таблицей случаев, а не отрисовкой.
 */

/** Все материалы курса в порядке прохождения: модули по порядку, внутри — материалы. */
export const orderedMaterials = (tree: CourseTree): Material[] =>
  [...tree]
    .sort((a, b) => a.module.sortOrder - b.module.sortOrder)
    .flatMap((node) => [...node.materials].sort((a, b) => a.sortOrder - b.sortOrder));

/**
 * Следующий материал после текущего — первый ОТКРЫТЫЙ по порядку.
 *
 * Пропускаем закрытые: вести человека в запертую дверь — обещание, которое экран не исполнит.
 * `null` означает «дальше идти некуда»: либо это был последний материал, либо всё, что за ним,
 * ещё закрыто. Экран об этом скажет словами, а не молча погасит кнопку.
 */
export const nextUnlockedMaterialId = (
  tree: CourseTree,
  lockState: LockState,
  currentMaterialId: string | null
): string | null => {
  const all = orderedMaterials(tree);
  const index = all.findIndex((material) => material.id === currentMaterialId);
  if (index === -1) return null;
  for (const material of all.slice(index + 1)) {
    if (lockState.get(material.id) === 'unlocked') return material.id;
  }
  return null;
};

/**
 * Из-за какого материала закрыт этот — по названию, а не «из-за предыдущих».
 *
 * ТЗ дословно: у замка подпись «Откроется после изучения „Текст инструктажа“». Ищем ПЕРВЫЙ
 * незавершённый обязательный материал, стоящий раньше: именно он держит дверь, и именно его
 * человеку нужно открыть, чтобы двинуться дальше.
 *
 * Возвращает `null`, если материал не закрыт или виновника найти не удалось — тогда экран
 * скажет общими словами, а не соврёт конкретикой.
 */
export const blockingMaterialTitle = (
  tree: CourseTree,
  progress: ProgressByMaterial,
  materialId: string
): string | null => {
  const all = orderedMaterials(tree);
  const index = all.findIndex((material) => material.id === materialId);
  if (index <= 0) return null;

  for (const earlier of all.slice(0, index)) {
    if (!earlier.isRequired) continue;
    if (progress.get(earlier.id)?.status === 'completed') continue;
    return earlier.title;
  }
  return null;
};

/** Человеческая подпись у замка: с названием виновника, если он известен. */
export const lockCaption = (blockingTitle: string | null): string =>
  blockingTitle === null
    ? 'Откроется после изучения предыдущих материалов'
    : `Откроется после изучения «${blockingTitle}»`;

/**
 * Почему закрыт этот материал — одной подписью, учитывающей ОБА замка (ТЗ 6.5 / С5).
 *
 * Решение о том, какая причина главнее, живёт здесь, а не в разметке: иначе его нельзя
 * проверить значениями, а только отрисовкой, которой у нас нет (`RISK-002`).
 *
 * Ворота раздела важнее порядка материалов: пока не сдан тест предыдущего раздела, ни один
 * материал этого раздела не откроется, сколько бы человек ни изучал.
 */
export const materialLockReason = (input: {
  tree: CourseTree;
  gate: ModuleGateState;
  progress: ProgressByMaterial;
  moduleId: string;
  materialId: string;
}): string => {
  /* Имя `module` брать нельзя: в сборке Next это имя занято системой модулей. */
  const gatingModule = blockingModuleTitle(input.tree, input.gate, input.moduleId);
  if (gatingModule !== null)
    return `Откроется после того, как вы сдадите тест раздела «${gatingModule}»`;
  return lockCaption(blockingMaterialTitle(input.tree, input.progress, input.materialId));
};

/**
 * Можно ли отметить материал изученным, и если нет — почему.
 *
 * **Время просмотра снимать нельзя.** `minViewSeconds` — требование обязательного обучения, а
 * не украшение: кнопка, отмечающая материал до истечения срока, обесценила бы весь учебный
 * центр перед проверкой. Поэтому кнопка ждёт вместе с человеком — и говорит, сколько осталось,
 * а не гаснет молча.
 *
 * SCORM отмечается только своим плеером (он один знает, дошёл ли человек до конца), поэтому
 * кнопки у него нет вовсе — и это тоже сказано словами.
 */
export interface StudyButtonState {
  enabled: boolean;
  /** Пусто — если кнопка доступна и объяснять нечего. */
  reason: string;
}

export const studyButtonState = (input: {
  material: Material | null;
  remainingSeconds: number;
  enrollmentId: string | null;
  alreadyCompleted: boolean;
}): StudyButtonState => {
  const { material, remainingSeconds, enrollmentId, alreadyCompleted } = input;
  if (!material) return { enabled: false, reason: '' };

  if (material.materialType === 'scorm') {
    return {
      enabled: false,
      reason: 'Этот материал отмечается сам, когда вы дойдёте до конца задания.'
    };
  }
  if (!enrollmentId) {
    return {
      enabled: false,
      reason:
        'Отметка не сохранится: вы открыли курс без зачисления в группу. Сообщите в учебный центр.'
    };
  }
  if (alreadyCompleted) {
    return { enabled: false, reason: 'Материал уже отмечен изученным.' };
  }
  if (remainingSeconds > 0) {
    return {
      enabled: false,
      reason: `Кнопка станет доступна через ${remainingSeconds} с — столько нужно изучать этот материал.`
    };
  }
  return { enabled: true, reason: '' };
};
