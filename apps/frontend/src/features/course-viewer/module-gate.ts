import type { CourseTree, LockState, LockStatus } from './types';

/** Per-module: its gating test id (if any) and whether the learner passed it. */
export interface ModuleGateInfo {
  gatingTestId?: string;
  passed: boolean;
}

export type ModuleGateState = Map<string, ModuleGateInfo>;

interface TestLike {
  id: string;
  moduleId?: string;
}
interface ExamResultLike {
  testId: string;
  passed: boolean;
}

/** Build the per-module gate state from the course's tests and the learner's exam results. */
export const buildModuleGateState = (
  tests: TestLike[],
  examResults: ExamResultLike[]
): ModuleGateState => {
  const passedTestIds = new Set(examResults.filter((e) => e.passed).map((e) => e.testId));
  const state: ModuleGateState = new Map();
  for (const test of tests) {
    if (!test.moduleId) continue;
    state.set(test.moduleId, { gatingTestId: test.id, passed: passedTestIds.has(test.id) });
  }
  return state;
};

/**
 * A module is locked when a required earlier module (by sortOrder) has a gating
 * test that has not been passed. Mirrors the server-side assertModuleSequenceGate.
 */
export const computeModuleLocks = (tree: CourseTree, gate: ModuleGateState): LockState => {
  const locks: LockState = new Map();
  const orderedModules = [...tree].sort((a, b) => a.module.sortOrder - b.module.sortOrder);
  let priorGateOpen = true;
  for (const node of orderedModules) {
    const status: LockStatus = priorGateOpen ? 'unlocked' : 'locked';
    locks.set(node.module.id, status);
    const info = gate.get(node.module.id);
    const blocks =
      node.module.isRequired && info?.gatingTestId !== undefined && info.passed === false;
    if (blocks) priorGateOpen = false;
  }
  return locks;
};

/**
 * Строгий порядок модулей (ФТ-E1, Фаза 2 Task 11).
 *
 * Клиентский замок — это подсказка, а не защита: настоящий запрет живёт на сервере
 * (`VideoAccessService.assertSequentialModules`). Здесь мы лишь не даём слушателю
 * ткнуть в модуль, который всё равно не откроется.
 *
 * Запирает только НЕЗАКРЫТЫЕ ОБЯЗАТЕЛЬНЫЕ материалы: необязательную методичку методист
 * добавляет как справочную, и запирать из-за неё курс нельзя — правило совпадает
 * с серверным.
 */
export interface MaterialCompletionLike {
  materialId: string;
  completed: boolean;
}

export const computeSequentialModuleLocks = (
  tree: CourseTree,
  completion: MaterialCompletionLike[]
): LockState => {
  const completedIds = new Set(
    completion.filter((item) => item.completed).map((i) => i.materialId)
  );
  const locks: LockState = new Map();
  const orderedModules = [...tree].sort((a, b) => a.module.sortOrder - b.module.sortOrder);
  let priorClosed = true;
  for (const node of orderedModules) {
    locks.set(node.module.id, priorClosed ? 'unlocked' : 'locked');
    const unfinishedRequired = node.materials.some(
      (material) => material.isRequired && !completedIds.has(material.id)
    );
    if (unfinishedRequired) priorClosed = false;
  }
  return locks;
};
