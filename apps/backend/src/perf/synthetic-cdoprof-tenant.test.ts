import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SYNTHETIC_SHAPE,
  buildSyntheticCdoprofTenant,
  toRuntimeRows
} from './synthetic-cdoprof-tenant.js';
import { MVP_COLLECTIONS } from '../modules/mvp/infrastructure/mvp-collections.js';

const SMALL = { counterparties: 7, courses: 5, groups: 40, learners: 30, enrollments: 90 };

describe('buildSyntheticCdoprofTenant', () => {
  it('форма по умолчанию — объёмы обследования CDOPROF', () => {
    expect(DEFAULT_SYNTHETIC_SHAPE).toEqual({
      counterparties: 1622,
      courses: 427,
      groups: 25_000,
      learners: 14_000,
      enrollments: 30_000
    });
  });

  it('размеры равны форме, все записи принадлежат тенанту', () => {
    const tenant = buildSyntheticCdoprofTenant('t_perf', SMALL, 7);

    expect(tenant.counterparties).toHaveLength(7);
    expect(tenant.courses).toHaveLength(5);
    expect(tenant.groups).toHaveLength(40);
    expect(tenant.groupCourses).toHaveLength(40);
    expect(tenant.learners).toHaveLength(30);
    expect(tenant.enrollments).toHaveLength(90);
    for (const rows of Object.values(tenant)) {
      for (const row of rows) expect(row.tenantId).toBe('t_perf');
    }
  });

  it('детерминирован: один seed → один набор, другой seed → другой', () => {
    const a = JSON.stringify(buildSyntheticCdoprofTenant('t', SMALL, 42));
    const b = JSON.stringify(buildSyntheticCdoprofTenant('t', SMALL, 42));
    const c = JSON.stringify(buildSyntheticCdoprofTenant('t', SMALL, 43));

    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('все ссылки указывают на существующие сущности', () => {
    const tenant = buildSyntheticCdoprofTenant('t', SMALL, 3);
    const groupIds = new Set(tenant.groups.map((g) => g.id));
    const learnerIds = new Set(tenant.learners.map((l) => l.id));
    const courseIds = new Set(tenant.courses.map((c) => c.id));
    const counterpartyIds = new Set(tenant.counterparties.map((c) => c.id));

    for (const e of tenant.enrollments) {
      expect(groupIds.has(e.groupId)).toBe(true);
      expect(learnerIds.has(e.learnerId)).toBe(true);
    }
    for (const gc of tenant.groupCourses) {
      expect(groupIds.has(gc.groupId)).toBe(true);
      expect(courseIds.has(gc.courseId)).toBe(true);
    }
    for (const g of tenant.groups) expect(counterpartyIds.has(g.counterpartyId ?? '')).toBe(true);
  });

  it('у слушателей нет ПДн, которые бэкенд перешифровывает при чтении', () => {
    const tenant = buildSyntheticCdoprofTenant('t', SMALL, 5);

    for (const learner of tenant.learners) {
      expect(learner).not.toHaveProperty('snils');
      expect(learner).not.toHaveProperty('email');
      expect(learner).not.toHaveProperty('phone');
      expect(learner).not.toHaveProperty('dateOfBirth');
      expect(learner.firstName).toBeTruthy();
      expect(learner.lastName).toBeTruthy();
    }
  });

  it('идентификаторы уникальны, статусы зачислений из допустимого набора', () => {
    const tenant = buildSyntheticCdoprofTenant('t', SMALL, 9);
    const ids = toRuntimeRows(tenant).map((r) => `${r.collection}:${r.id}`);

    expect(new Set(ids).size).toBe(ids.length);
    for (const e of tenant.enrollments) {
      expect(['completed', 'active', 'cancelled']).toContain(e.status);
      if (e.status === 'completed') expect(e.completedAt).toBeTruthy();
    }
  });
});

describe('toRuntimeRows', () => {
  it('раскладывает по коллекциям с именами из mvp-collections', () => {
    const rows = toRuntimeRows(buildSyntheticCdoprofTenant('t', SMALL, 1));
    const collections = new Set(rows.map((r) => r.collection));

    expect(rows).toHaveLength(7 + 5 + 40 + 40 + 30 + 90);
    expect([...collections].sort()).toEqual(
      ['counterparties', 'courses', 'enrollments', 'groupCourses', 'groups', 'learners'].sort()
    );
    for (const collection of collections) {
      expect(MVP_COLLECTIONS as readonly string[]).toContain(collection);
    }
    expect((rows[0]?.data as { id: string }).id).toBe(rows[0]?.id);
  });
});
