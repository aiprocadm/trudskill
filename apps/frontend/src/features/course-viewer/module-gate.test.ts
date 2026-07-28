import { describe, expect, it } from 'vitest';

import {
  buildModuleGateState,
  computeModuleLocks,
  computeSequentialModuleLocks
} from './module-gate';

import type { CourseTree } from './types';

const tree: CourseTree = [
  {
    module: {
      id: 'm1',
      courseVersionId: 'v1',
      title: 'M1',
      sortOrder: 1,
      minViewSeconds: 0,
      isRequired: true,
      status: 'active',
      tenantId: 't',
      createdAt: '',
      updatedAt: ''
    },
    materials: []
  },
  {
    module: {
      id: 'm2',
      courseVersionId: 'v1',
      title: 'M2',
      sortOrder: 2,
      minViewSeconds: 0,
      isRequired: true,
      status: 'active',
      tenantId: 't',
      createdAt: '',
      updatedAt: ''
    },
    materials: []
  }
];

describe('buildModuleGateState', () => {
  it('maps a module to its gating test and its passed flag', () => {
    const tests = [{ id: 'test_m1', moduleId: 'm1', courseId: 'c1' }] as never[];
    const exams = [{ testId: 'test_m1', passed: true }] as never[];
    const gate = buildModuleGateState(tests, exams);
    expect(gate.get('m1')).toEqual({ gatingTestId: 'test_m1', passed: true });
  });

  it('reports passed=false when the module has a gating test but no passing exam result', () => {
    const tests = [{ id: 'test_m1', moduleId: 'm1', courseId: 'c1' }] as never[];
    const gate = buildModuleGateState(tests, []);
    expect(gate.get('m1')).toEqual({ gatingTestId: 'test_m1', passed: false });
  });
});

describe('computeModuleLocks', () => {
  it('locks module 2 while module 1 (required, has gating test) is not passed', () => {
    const gate = new Map([['m1', { gatingTestId: 'test_m1', passed: false }]]);
    const locks = computeModuleLocks(tree, gate);
    expect(locks.get('m1')).toBe('unlocked');
    expect(locks.get('m2')).toBe('locked');
  });

  it('unlocks module 2 once module 1 is passed', () => {
    const gate = new Map([['m1', { gatingTestId: 'test_m1', passed: true }]]);
    const locks = computeModuleLocks(tree, gate);
    expect(locks.get('m2')).toBe('unlocked');
  });

  it('does not lock when the prior module has no gating test', () => {
    const locks = computeModuleLocks(tree, new Map());
    expect(locks.get('m2')).toBe('unlocked');
  });

  it('does not lock module 2 when module 1 is non-required even with an unpassed gating test', () => {
    const nonRequiredTree: CourseTree = tree.map((node) =>
      node.module.id === 'm1'
        ? { module: { ...node.module, isRequired: false }, materials: [] }
        : node
    );
    const gate = new Map([['m1', { gatingTestId: 'test_m1', passed: false }]]);
    const locks = computeModuleLocks(nonRequiredTree, gate);
    expect(locks.get('m2')).toBe('unlocked');
  });
});

/** Строгий порядок модулей (ФТ-E1, Фаза 2 Task 11). */
describe('computeSequentialModuleLocks', () => {
  const tree = [
    {
      module: { id: 'mod_1', sortOrder: 1, title: 'M1', isRequired: true },
      materials: [
        { id: 'mat_1', isRequired: true },
        { id: 'mat_1_opt', isRequired: false }
      ]
    },
    {
      module: { id: 'mod_2', sortOrder: 2, title: 'M2', isRequired: true },
      materials: [{ id: 'mat_2', isRequired: true }]
    },
    {
      module: { id: 'mod_3', sortOrder: 3, title: 'M3', isRequired: true },
      materials: [{ id: 'mat_3', isRequired: true }]
    }
  ] as unknown as Parameters<typeof computeSequentialModuleLocks>[0];

  it('первый модуль открыт всегда, следующие закрыты до его закрытия', () => {
    const locks = computeSequentialModuleLocks(tree, []);
    expect(locks.get('mod_1')).toBe('unlocked');
    expect(locks.get('mod_2')).toBe('locked');
    expect(locks.get('mod_3')).toBe('locked');
  });

  it('закрытие обязательного материала открывает следующий модуль', () => {
    const locks = computeSequentialModuleLocks(tree, [{ materialId: 'mat_1', completed: true }]);
    expect(locks.get('mod_2')).toBe('unlocked');
    // Третий по-прежнему закрыт: второй ещё не пройден.
    expect(locks.get('mod_3')).toBe('locked');
  });

  it('необязательный материал не запирает — правило совпадает с серверным', () => {
    const locks = computeSequentialModuleLocks(tree, [{ materialId: 'mat_1', completed: true }]);
    expect(locks.get('mod_2')).toBe('unlocked');
  });

  it('пройденный курс открыт целиком', () => {
    const locks = computeSequentialModuleLocks(tree, [
      { materialId: 'mat_1', completed: true },
      { materialId: 'mat_2', completed: true },
      { materialId: 'mat_3', completed: true }
    ]);
    expect([...locks.values()].every((v) => v === 'unlocked')).toBe(true);
  });
});
