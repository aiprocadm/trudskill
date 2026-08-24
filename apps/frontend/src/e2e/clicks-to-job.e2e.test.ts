import { describe, expect, it } from 'vitest';

import { navigationModel } from '../features/navigation/model';
import { roleBlueprints } from '../features/navigation/role-blueprints';
import { TOP_JOB_ROUTES, UNREACHABLE, clicksToJob } from '../features/navigation/top-job-routes';

import type { UserSession } from '../entities/session/model';

/**
 * `GOAL-2` · «кликов до частой задачи: 4–5 → ≤3».
 *
 * Считается не «в среднем по продукту», а по списку частых задач каждой роли (ТЗ §3.1,
 * `roleBlueprints.topJobs`). Дорога = клики до раздела по настоящему меню плюс шаги
 * внутри экрана: выбор строки в реестре, нажатие первичного действия.
 *
 * ⚠️ Права здесь взяты полным набором — как и в замере меню. Для достижимости это
 * **лучший** случай, а не худший: у роли с урезанными правами раздел может не показаться
 * вовсе. Поэтому тест доказывает «дорога не длиннее трёх кликов, когда раздел доступен»,
 * а не «любая роль дойдёт». Настоящие наборы прав живут в `iam.role_permissions` и
 * мерятся на живой базе — выдумывать их здесь нельзя.
 */

const sessionFor = (role: string): UserSession => ({
  user: {
    id: 'u',
    tenantId: 't',
    login: 'l',
    email: null,
    status: 'active',
    displayName: 'X'
  },
  tokens: { accessToken: 'a', sessionId: 's', expiresIn: 300 },
  roles: [role],
  permissions: Array.from(new Set(navigationModel.flatMap((i) => i.requiredPermissions ?? [])))
});

describe('GOAL-2 · до частой задачи не больше трёх кликов', () => {
  it('у каждой частой задачи есть путь — иначе цель нечем мерить', () => {
    const orphans = roleBlueprints.flatMap((blueprint) =>
      blueprint.topJobs
        .filter((job) => !TOP_JOB_ROUTES[job])
        .map((job) => `${blueprint.role}: ${job}`)
    );

    expect(
      orphans,
      `эти задачи из topJobs не описаны в TOP_JOB_ROUTES:\n${orphans.join('\n')}`
    ).toEqual([]);
  });

  it('в карте путей нет задач, которых больше нет ни у одной роли', () => {
    const known = new Set(roleBlueprints.flatMap((blueprint) => blueprint.topJobs));
    const stale = Object.keys(TOP_JOB_ROUTES).filter((job) => !known.has(job));

    expect(
      stale,
      `задачу переименовали или убрали — поправьте карту:\n${stale.join('\n')}`
    ).toEqual([]);
  });

  it('каждый путь ведёт на существующий раздел меню', () => {
    const hrefs = new Set(navigationModel.map((item) => item.href));
    const dead = Object.entries(TOP_JOB_ROUTES)
      .filter(([, route]) => !hrefs.has(route.href))
      .map(([job, route]) => `${job} → ${route.href}`);

    expect(dead, `путь ведёт в никуда:\n${dead.join('\n')}`).toEqual([]);
  });

  it('ни одна частая задача не дальше трёх кликов', () => {
    const tooFar = roleBlueprints.flatMap((blueprint) => {
      const session = sessionFor(blueprint.role);
      return blueprint.topJobs
        .map((job) => ({ job, role: blueprint.role, clicks: clicksToJob(session, job) }))
        .filter((row) => row.clicks > 3)
        .map((row) =>
          row.clicks === UNREACHABLE
            ? `${row.role}: «${row.job}» — раздел не достижим из меню`
            : `${row.role}: «${row.job}» — ${row.clicks} клика`
        );
    });

    expect(
      tooFar,
      'до этих задач дорога длиннее бюджета §13.2. Поднимите раздел в главное меню роли ' +
        'или сократите путь внутри экрана — но не занижайте stepsInside, метрика тогда врёт.'
    ).toEqual([]);
  });

  it('мерка не выродилась: считаются настоящие пути, а не нули', () => {
    // Если бы все stepsInside были нулями, а разделы — главным меню, проверка выше
    // проходила бы по построению. Держим саму метрику честной.
    const withSteps = Object.values(TOP_JOB_ROUTES).filter((route) => route.stepsInside > 0);
    expect(withSteps.length).toBeGreaterThan(10);

    const admin = sessionFor('tenant_admin');
    expect(clicksToJob(admin, 'Зачислить слушателя в группу')).toBe(3);
  });
});
