import { describe, expect, it } from 'vitest';

import { ROLE_PERMISSIONS } from './role-permissions.fixture';
import {
  activeNavHref,
  evaluateRouteAccess,
  getVisibleNavigation
} from '../features/navigation/helpers';

import type { UserSession } from '../entities/session/model';

/**
 * Пункт меню ведёт туда, куда обещает (ТЗ «Стабилизация, UX и развитие», 2.2 / Б4).
 *
 * Правило ТЗ без исключений: **если роль не может открыть раздел — пункта нет в её меню.**
 * Никаких «покажем, но не пустим». Критерий приёмки оттуда же: «для каждой роли пройти по всем
 * пунктам её меню — ни один не отдаёт 403 и не делает молчаливый редирект».
 *
 * Сверка 15.09.2026 показала: **на текущем коде отказов нет ни у одной из семи ролей** —
 * жалоба ТЗ описывает состояние до наведения порядка в маршрутах и адресности меню (§5.418,
 * журнал 344–345, 08.09). Тест не чинит, а ЗАКРЕПЛЯЕТ: без него свойство держалось случайно.
 *
 * А вот третий пункт той же задачи — «подсветка активного пункта ровно одна за раз» — на коде
 * НЕ выполнялся. Признак активности был «адрес начинается со ссылки пункта», и на любой
 * странице кабинета слушателя загорались ДВА пункта сразу: «Мой кабинет» и, скажем, «Мои
 * курсы». Таких вложенных пар в меню девять.
 *
 * Права ролей берутся из снимка ЖИВОЙ базы (`role-permissions.fixture.ts`), а не из текста ТЗ.
 */

const sessionFor = (role: string): UserSession =>
  ({
    user: {
      id: `u_${role}`,
      tenantId: 'tenant_demo',
      login: role,
      email: `${role}@example.com`,
      status: 'active',
      displayName: role
    },
    tokens: { accessToken: 'a', sessionId: 's', expiresIn: 300 },
    roles: [role],
    permissions: [...(ROLE_PERMISSIONS[role] ?? [])]
  }) as unknown as UserSession;

const ROLES = Object.keys(ROLE_PERMISSIONS);

describe('меню не обещает того, чего не даёт', () => {
  it('ни один пункт меню ни одной роли не отдаёт отказ', () => {
    const broken: string[] = [];

    for (const role of ROLES) {
      const session = sessionFor(role);
      for (const item of getVisibleNavigation(session)) {
        const access = evaluateRouteAccess(item.href, session).kind;
        if (access !== 'ok') {
          broken.push(`${role}: «${item.label}» → ${item.href} = ${access}`);
        }
      }
    }

    expect(broken, `пункты меню, ведущие в тупик:\n${broken.join('\n')}`).toEqual([]);
  });

  it('у каждой роли меню не пустое — иначе проверка выше ничего не значит', () => {
    const empty = ROLES.filter((role) => getVisibleNavigation(sessionFor(role)).length === 0);
    expect(empty, `роли без единого пункта меню: ${empty.join(', ')}`).toEqual([]);
  });
});

describe('подсвечен ровно один пункт меню', () => {
  it('на вложенном адресе активен самый точный пункт, а не оба', () => {
    const hrefs = ['/learner', '/learner/courses', '/learner/documents'];

    expect(
      activeNavHref('/learner/courses', hrefs),
      'иначе на странице «Мои курсы» горят и «Мой кабинет», и «Мои курсы»'
    ).toBe('/learner/courses');
    expect(activeNavHref('/learner', hrefs)).toBe('/learner');
  });

  it('вложенная страница без своего пункта подсвечивает родителя', () => {
    /* У карточки курса своего пункта нет — человек должен видеть, что он «в Курсах». */
    expect(activeNavHref('/courses/course_abc', ['/courses', '/groups'])).toBe('/courses');
  });

  it('чужой адрес не подсвечивает ничего', () => {
    expect(activeNavHref('/settings', ['/courses', '/groups'])).toBeNull();
  });

  it('во всём меню каждой роли активен максимум один пункт', () => {
    const problems: string[] = [];

    for (const role of ROLES) {
      const items = getVisibleNavigation(sessionFor(role));
      const hrefs = items.map((item) => item.href);
      for (const item of items) {
        const active = hrefs.filter((href) => activeNavHref(item.href, hrefs) === href);
        if (active.length > 1) {
          problems.push(`${role}: на ${item.href} активны ${active.join(', ')}`);
        }
      }
    }

    expect(problems, `подсвечено больше одного пункта:\n${problems.join('\n')}`).toEqual([]);
  });
});
