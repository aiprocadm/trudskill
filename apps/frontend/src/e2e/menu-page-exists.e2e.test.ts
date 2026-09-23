import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { fromApp } from './app-root';
import { stripComments } from './backend-source';
import { ROLE_PERMISSIONS } from './role-permissions.fixture';
import { getVisibleNavigation } from '../features/navigation/helpers';
import { navigationModel } from '../features/navigation/model';

import type { UserSession } from '../entities/session/model';

/**
 * За каждым пунктом меню стоит настоящая страница (ТЗ «Стабилизация, UX и развитие», 16.1).
 *
 * **Чего не хватало.** Требование 16.1 — «пройти по всем пунктам меню каждой роли и убедиться,
 * что страница отрисовалась, нет 403, нет молчаливого редиректа». Отказ по правам уже закрыт
 * сторожем `menu-leads-somewhere`: он проходит меню всех семи ролей и требует «ok» от
 * `evaluateRouteAccess`. А вот вторая половина — что по адресу вообще ЕСТЬ страница — не
 * проверялась ничем.
 *
 * Разница существенная. Право пускает на адрес, которого нет: человек жмёт пункт меню и
 * попадает на «страница не найдена». Для него это одно и то же — продукт сломан, — но причина
 * другая, и ловится она иначе: не правами, а наличием файла в `app/`.
 *
 * **Почему по файлам, а не в браузере.** Браузера в проекте нет (см. `reference-screens`:
 * ввод Playwright — решение владельца). Наличие маршрута в Next.js определяется файлом
 * `app/<путь>/page.tsx`, и это проверяется честно и без браузера. Чего проверка НЕ ловит:
 * ошибку ВНУТРИ страницы во время отрисовки. Это остаётся за дымовыми проверками экранов.
 *
 * **Права ролей — снимок живой `iam.role_permissions`** (`role-permissions.fixture.ts`).
 * Сверен 19.09.2026: совпадает с базой стенда по всем семи ролям (1/18/33/51/96/15/91).
 */

const APP_DIR = fromApp('app');

const sessionFor = (role: string): UserSession =>
  ({
    user: {
      id: `u_${role}`,
      tenantId: 'tenant_demo',
      login: role,
      email: null,
      status: 'active',
      displayName: role
    },
    tokens: { accessToken: 'a', sessionId: 's', expiresIn: 300 },
    roles: [role],
    permissions: [...(ROLE_PERMISSIONS[role] ?? [])]
  }) as unknown as UserSession;

const ROLES = Object.keys(ROLE_PERMISSIONS);

/**
 * Есть ли страница по адресу.
 *
 * Сначала точное совпадение (`/admin/tests` → `app/admin/tests/page.tsx`), затем сегмент с
 * подстановкой (`app/courses/[id]/page.tsx`) — на случай, если в меню когда-нибудь появится
 * адрес с идентификатором. Группы маршрутов Next.js (`(group)`) в проекте не используются;
 * появятся — эта проверка их не увидит, и это лучше, чем молча считать любой путь найденным.
 */
const pageExists = (href: string): boolean => {
  const segments = href.split('/').filter(Boolean);
  let dir = APP_DIR;
  for (const segment of segments) {
    const exact = join(dir, segment);
    if (existsSync(exact) && statSync(exact).isDirectory()) {
      dir = exact;
      continue;
    }
    const dynamic = readdirSync(dir).find(
      (entry) =>
        entry.startsWith('[') && entry.endsWith(']') && statSync(join(dir, entry)).isDirectory()
    );
    if (!dynamic) return false;
    dir = join(dir, dynamic);
  }
  return existsSync(join(dir, 'page.tsx'));
};

describe('за каждым пунктом меню есть страница (ТЗ 16.1)', () => {
  it('проверка вообще что-то проверяет', () => {
    /* Сломайся разбор — список опустеет, и требование стало бы зелёным ни на чём. */
    expect(navigationModel.length).toBeGreaterThan(20);
    /* Восьмая — куратор обучения (миграция 0099, ТЗ перехода с CDOPROF). */
    expect(ROLES.length, 'восемь ролей живой базы').toBe(8);
  });

  it('ни один пункт меню ни одной роли не ведёт на несуществующую страницу', () => {
    const missing: string[] = [];

    for (const role of ROLES) {
      for (const item of getVisibleNavigation(sessionFor(role))) {
        if (!pageExists(item.href)) {
          missing.push(`${role}: «${item.label}» → ${item.href}`);
        }
      }
    }

    expect(
      [...new Set(missing)].sort(),
      'человек жмёт пункт меню и попадает на «страница не найдена»'
    ).toEqual([]);
  });

  it('в самой модели навигации нет адресов без страницы', () => {
    /*
     * Шире предыдущей проверки: пункт может быть закрыт правами у ВСЕХ семи ролей сегодня и
     * открыться завтра одной миграцией. Такой пункт тоже обязан вести на существующий экран.
     */
    const missing = navigationModel
      .filter((item) => !pageExists(item.href))
      .map((item) => `${item.href} («${item.label}»)`);

    expect(missing.sort(), 'адрес в модели навигации без страницы в app/').toEqual([]);
  });

  it('проверка наличия страницы не врёт: выдуманный адрес не находится', () => {
    /*
     * Мерка проверяется на себе. Если бы `pageExists` возвращал «есть» на что угодно, обе
     * проверки выше были бы зелёными всегда — и молчали бы о настоящей поломке.
     */
    expect(pageExists('/такого-раздела-нет')).toBe(false);
    expect(pageExists('/admin/такого-нет')).toBe(false);
    expect(pageExists('/workspace'), 'а настоящий адрес — находится').toBe(true);
  });
});

describe('снимок навигации закрывает 16.2', () => {
  it('состав меню зафиксирован снимком для всех ролей живой базы', () => {
    /*
     * 16.2 просит «состав меню каждой роли и реестр разделов фиксируются снапшот-тестом».
     * Оба сторожа существуют: состав меню — `role-menu-composition` (сверка на РАВЕНСТВО),
     * реестр разделов — `one-section-one-name` (сверка кода с `docs/ia/routes.md`).
     * Здесь закрепляется, что снимок покрывает ровно те роли, что есть в живой базе: роль,
     * добавленная миграцией и забытая в снимке, иначе меняла бы меню молча.
     */
    const snapshot = readFileSync(
      fromApp('src', 'e2e', 'role-menu-composition.e2e.test.ts'),
      'utf8'
    );
    for (const role of ROLES) {
      expect(snapshot, `роль ${role} не попала в снимок состава меню`).toContain(`${role}: {`);
    }
  });

  it('реестр разделов сверяется с кодом отдельным сторожем', () => {
    /*
     * Комментарии снимаются перед поиском. Первый замер этого не делал, и подсаженная поломка
     * (сторож стал читать `roles.md` вместо `routes.md`) прошла незамеченной: нужная строка
     * нашлась в пояснении к коду. Та же грабля, что в журнале 537, — и она повторилась через
     * один срез (журнал 542).
     */
    const registry = stripComments(
      readFileSync(fromApp('src', 'e2e', 'one-section-one-name.e2e.test.ts'), 'utf8')
    );
    expect(registry, 'сторож обязан читать именно реестр адресов').toMatch(/['"]routes\.md['"]/);
  });
});
