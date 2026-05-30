import { describe, expect, it } from 'vitest';

import { buildModuleGateState, computeModuleLocks } from './module-gate';

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
});
