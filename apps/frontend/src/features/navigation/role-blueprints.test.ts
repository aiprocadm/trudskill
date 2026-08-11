import { describe, expect, it } from 'vitest';

import { navigationModel } from './model';
import { getRoleBlueprints } from './role-blueprints';

describe('главные меню ролей (IA-013, IA-002)', () => {
  it('каждая роль укладывается в бюджет меню ≤7 пунктов', () => {
    for (const blueprint of getRoleBlueprints()) {
      expect(blueprint.primaryNav.length, blueprint.role).toBeLessThanOrEqual(7);
    }
  });

  it('каждый маршрут primaryNav существует в модели навигации', () => {
    const known = new Set(navigationModel.map((item) => item.href));
    for (const blueprint of getRoleBlueprints()) {
      for (const href of blueprint.primaryNav) {
        expect(known, `${blueprint.role}: ${href}`).toContain(href);
      }
    }
  });

  it('администратор получает семь пунктов из ТЗ §4.4', () => {
    const admin = getRoleBlueprints().find((item) => item.role === 'tenant_admin');
    expect(admin?.primaryNav).toEqual([
      '/workspace',
      '/learners',
      '/groups',
      '/assessment',
      '/documents',
      '/reports',
      '/settings'
    ]);
  });

  it('менеджер описан отдельной ролью, а не запасным путём', () => {
    const manager = getRoleBlueprints().find((item) => item.role === 'manager');
    expect(manager?.primaryNav).toEqual([
      '/groups',
      '/learners',
      '/counterparties',
      '/documents',
      '/reports'
    ]);
  });

  it('у каждой роли задачи сформулированы как действия пользователя', () => {
    for (const blueprint of getRoleBlueprints()) {
      expect(blueprint.topJobs.length, blueprint.role).toBeGreaterThan(0);
      for (const job of blueprint.topJobs) {
        // TXT-006/TXT-007: без англицизмов и восклицаний в тексте интерфейса.
        expect(job, blueprint.role).not.toMatch(/LMS|inbox|dashboard|!/i);
      }
    }
  });
});
