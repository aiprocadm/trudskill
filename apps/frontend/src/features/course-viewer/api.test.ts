import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loadCourseTree } from './api';
import { buildProgressMap } from './hooks';
import { mvpApi } from '../mvp/api';

import type { UserSession } from '../../entities/session/model';
import type { CourseModule, Material, Progress } from '../mvp/types';

const session = { userId: 'u1' } as unknown as UserSession;

const baseEntity = {
  tenantId: 't1',
  status: 'active',
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z'
};

const module = (id: string, sortOrder: number): CourseModule => ({
  ...baseEntity,
  id,
  courseVersionId: 'cv1',
  title: id,
  sortOrder,
  minViewSeconds: 0,
  isRequired: true
});

const material = (id: string, moduleId: string, sortOrder: number): Material => ({
  ...baseEntity,
  id,
  moduleId,
  title: id,
  materialType: 'text',
  sortOrder,
  minViewSeconds: 0,
  isRequired: true
});

const listResponse = <T>(items: T[]) => ({
  items,
  page: 1,
  pageSize: items.length,
  total: items.length
});

describe('loadCourseTree', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('сортирует модули и материалы по sortOrder', async () => {
    vi.spyOn(mvpApi, 'listModules').mockResolvedValue(
      listResponse([module('m2', 1), module('m1', 0)])
    );
    vi.spyOn(mvpApi, 'listMaterials').mockImplementation((_session, moduleId) => {
      if (moduleId === 'm1') {
        return Promise.resolve(
          listResponse([material('mat2', 'm1', 1), material('mat1', 'm1', 0)])
        );
      }
      return Promise.resolve(listResponse([material('mat3', 'm2', 0)]));
    });

    const tree = await loadCourseTree(session, 'cv1');
    expect(tree.map((n) => n.module.id)).toEqual(['m1', 'm2']);
    expect(tree[0]?.materials.map((m) => m.id)).toEqual(['mat1', 'mat2']);
    expect(tree[1]?.materials.map((m) => m.id)).toEqual(['mat3']);
  });
});

describe('mvpApi.updateMaterialProgress', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('PATCH /progress/materials/:id с enrollmentId + studiedSeconds', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            id: 'p_x',
            tenantId: 't1',
            status: 'in_progress',
            createdAt: '2026-05-01T00:00:00.000Z',
            updatedAt: '2026-05-01T00:00:00.000Z',
            enrollmentId: 'e1',
            courseId: 'c1',
            moduleId: 'm1',
            materialId: 'mat1',
            progressPercent: 42
          },
          meta: {
            requestId: 'req-1',
            correlationId: 'corr-1',
            timestamp: '2026-05-27T00:00:00.000Z'
          }
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    const liveSession = {
      tokens: { accessToken: 'tk' },
      user: { id: 'u1' }
    } as unknown as UserSession;
    await mvpApi.updateMaterialProgress(liveSession, 'mat1', {
      enrollmentId: 'e1',
      studiedSeconds: 12
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toContain('/progress/materials/mat1');
    expect((init as RequestInit).method).toBe('PATCH');
    expect((init as RequestInit).body).toBe(
      JSON.stringify({ enrollmentId: 'e1', studiedSeconds: 12 })
    );
  });
});

describe('buildProgressMap', () => {
  it('возвращает пустой Map для null', () => {
    expect(buildProgressMap(null).size).toBe(0);
  });

  it('индексирует по materialId', () => {
    const items: Progress[] = [
      {
        ...baseEntity,
        id: 'p1',
        enrollmentId: 'e1',
        courseId: 'c1',
        moduleId: 'm1',
        materialId: 'mat1',
        progressPercent: 100,
        status: 'completed'
      }
    ];
    const map = buildProgressMap(items);
    expect(map.size).toBe(1);
    expect(map.get('mat1')?.status).toBe('completed');
  });
});
