import { describe, expect, it } from 'vitest';

import { computeUnlockedMaterials } from './lock-logic';

import type { CourseTree, ProgressByMaterial } from './types';
import type { CourseModule, Material, Progress } from '../mvp/types';

const baseEntity = {
  tenantId: 't1',
  status: 'active',
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z'
};

const buildModule = (id: string, sortOrder: number): CourseModule => ({
  ...baseEntity,
  id,
  courseVersionId: 'cv1',
  title: `Module ${id}`,
  sortOrder,
  minViewSeconds: 60,
  isRequired: true
});

const buildMaterial = (
  id: string,
  moduleId: string,
  sortOrder: number,
  isRequired = true
): Material => ({
  ...baseEntity,
  id,
  moduleId,
  title: `Material ${id}`,
  materialType: 'text',
  sortOrder,
  minViewSeconds: 30,
  isRequired
});

const buildProgress = (
  materialId: string,
  status: Progress['status'],
  moduleId = 'm1',
  courseId = 'c1'
): Progress => ({
  ...baseEntity,
  id: `p_${materialId}`,
  enrollmentId: 'e1',
  courseId,
  moduleId,
  materialId,
  progressPercent: status === 'completed' ? 100 : status === 'in_progress' ? 50 : 0,
  status
});

const progressMap = (items: Progress[]): ProgressByMaterial =>
  new Map(items.map((p) => [p.materialId, p]));

describe('computeUnlockedMaterials', () => {
  it('первый материал всегда разблокирован при пустом прогрессе', () => {
    const tree: CourseTree = [
      {
        module: buildModule('m1', 0),
        materials: [buildMaterial('mat1', 'm1', 0), buildMaterial('mat2', 'm1', 1)]
      }
    ];
    const result = computeUnlockedMaterials(tree, progressMap([]));
    expect(result.get('mat1')).toBe('unlocked');
    expect(result.get('mat2')).toBe('locked');
  });

  it('required completed → следующий разблокирован', () => {
    const tree: CourseTree = [
      {
        module: buildModule('m1', 0),
        materials: [buildMaterial('mat1', 'm1', 0), buildMaterial('mat2', 'm1', 1)]
      }
    ];
    const result = computeUnlockedMaterials(
      tree,
      progressMap([buildProgress('mat1', 'completed')])
    );
    expect(result.get('mat1')).toBe('unlocked');
    expect(result.get('mat2')).toBe('unlocked');
  });

  it('required in_progress → следующий заблокирован', () => {
    const tree: CourseTree = [
      {
        module: buildModule('m1', 0),
        materials: [buildMaterial('mat1', 'm1', 0), buildMaterial('mat2', 'm1', 1)]
      }
    ];
    const result = computeUnlockedMaterials(
      tree,
      progressMap([buildProgress('mat1', 'in_progress')])
    );
    expect(result.get('mat1')).toBe('unlocked');
    expect(result.get('mat2')).toBe('locked');
  });

  it('optional material не блокирует следующий required', () => {
    const tree: CourseTree = [
      {
        module: buildModule('m1', 0),
        materials: [
          buildMaterial('mat1', 'm1', 0, true),
          buildMaterial('mat2', 'm1', 1, false),
          buildMaterial('mat3', 'm1', 2, true)
        ]
      }
    ];
    const result = computeUnlockedMaterials(
      tree,
      progressMap([buildProgress('mat1', 'completed')])
    );
    expect(result.get('mat1')).toBe('unlocked');
    expect(result.get('mat2')).toBe('unlocked');
    expect(result.get('mat3')).toBe('unlocked');
  });

  it('cross-module: модуль B заблокирован пока в A не завершены required', () => {
    const tree: CourseTree = [
      { module: buildModule('m1', 0), materials: [buildMaterial('mat1', 'm1', 0)] },
      { module: buildModule('m2', 1), materials: [buildMaterial('mat2', 'm2', 0)] }
    ];
    const lockedResult = computeUnlockedMaterials(tree, progressMap([]));
    expect(lockedResult.get('mat1')).toBe('unlocked');
    expect(lockedResult.get('mat2')).toBe('locked');

    const unlockedResult = computeUnlockedMaterials(
      tree,
      progressMap([buildProgress('mat1', 'completed', 'm1')])
    );
    expect(unlockedResult.get('mat2')).toBe('unlocked');
  });

  it('пустой модуль не ломает обход', () => {
    const tree: CourseTree = [
      { module: buildModule('m1', 0), materials: [] },
      { module: buildModule('m2', 1), materials: [buildMaterial('mat1', 'm2', 0)] }
    ];
    const result = computeUnlockedMaterials(tree, progressMap([]));
    expect(result.get('mat1')).toBe('unlocked');
  });

  it('cross-module с optional gate: B unlocked если в A только optional не пройден', () => {
    const tree: CourseTree = [
      {
        module: buildModule('m1', 0),
        materials: [buildMaterial('mat1', 'm1', 0, true), buildMaterial('mat2', 'm1', 1, false)]
      },
      { module: buildModule('m2', 1), materials: [buildMaterial('mat3', 'm2', 0)] }
    ];
    const result = computeUnlockedMaterials(
      tree,
      progressMap([buildProgress('mat1', 'completed', 'm1')])
    );
    expect(result.get('mat3')).toBe('unlocked');
  });

  it('модули обходятся в порядке sortOrder, не в порядке массива', () => {
    const tree: CourseTree = [
      { module: buildModule('m2', 1), materials: [buildMaterial('mat2', 'm2', 0)] },
      { module: buildModule('m1', 0), materials: [buildMaterial('mat1', 'm1', 0)] }
    ];
    const result = computeUnlockedMaterials(tree, progressMap([]));
    expect(result.get('mat1')).toBe('unlocked');
    expect(result.get('mat2')).toBe('locked');
  });
});
