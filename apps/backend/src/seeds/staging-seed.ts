import { randomBytes } from 'node:crypto';

import { hashPassword } from '../modules/iam/crypto.util.js';

/**
 * ФТ-I3 — сид ВТОРОГО арендатора для стенда.
 *
 * **Зачем.** Изоляция арендаторов — требование уровня P0 (ФТ-D1), закрытое тестами
 * (`test:isolation`, 31 проверка). Но на живом стенде увидеть её было нечем: в базе жил
 * ровно один арендатор `tenant_demo`, заведённый миграцией `0010`. Утечку между
 * арендаторами невозможно заметить глазами там, где второго арендатора не существует, —
 * любая ручная проверка мультитенантности упиралась в это.
 *
 * **Почему скрипт, а не миграция.** Миграции применяются и в проде, а демонстрационные
 * данные там не нужны и вредны. Поэтому второй арендатор заводится отдельным шагом,
 * который запускают руками на стенде: `pnpm seed:staging`.
 *
 * **Почему права выдаются явно.** Новый арендатор без строк `iam.role_permissions` рождается
 * с ролями, у которых нет ни одного права: администратор входит и видит пустой продукт, где
 * каждая ручка отвечает отказом. Это уже случалось в соседнем проекте, поэтому права здесь
 * выдаются тем же запросом-образцом, что и демонстрационному арендатору в `0010`.
 *
 * **Кроме прав владельца платформы (журнал 336).** Образец из `0010` раздавал ВСЕ права — и
 * этот сид повторял его буквально, пока права `platform.*` и `library.publish` не появились
 * (0073+): администратор «Беты» на стенде видел и создавал арендаторов и входил «от имени».
 * Миграция 0073 прямо предупреждает: повторить «все скопом» — дать каждому арендатору админку
 * всех остальных. Ручки `platform/*` защищены только правом, других преград нет.
 */

export const STAGING_TENANT = {
  id: 'tenant_beta',
  code: 'beta',
  name: 'Бета — учебный центр для проверок'
} as const;

/** Роли арендатора: те же коды, что у демонстрационного, но собственные строки. */
const ROLES = [
  { id: 'r_beta_tenant_admin', code: 'tenant_admin', name: 'Администратор центра' },
  { id: 'r_beta_manager', code: 'manager', name: 'Менеджер' },
  { id: 'r_beta_methodist', code: 'methodist', name: 'Методист' },
  { id: 'r_beta_learner', code: 'learner', name: 'Слушатель' }
] as const;

const USERS = [
  {
    id: 'u_beta_tenant_admin',
    login: 'beta_admin',
    email: 'admin@beta.local',
    displayName: 'Администратор Бета',
    roleId: 'r_beta_tenant_admin'
  },
  {
    id: 'u_beta_methodist',
    login: 'beta_methodist',
    email: 'methodist@beta.local',
    displayName: 'Методист Бета',
    roleId: 'r_beta_methodist'
  },
  {
    id: 'u_beta_learner',
    login: 'beta_learner',
    email: 'learner@beta.local',
    displayName: 'Слушатель Бета',
    roleId: 'r_beta_learner'
  }
] as const;

/**
 * Пароль берётся из окружения. Если он не задан, ставится случайный: сид всё равно создаст
 * арендатора (он нужен для проверки изоляции), но войти под ним будет нельзя — это лучше,
 * чем всем известный пароль, тихо уехавший на стенд.
 */
export function stagingPasswordHash(): string {
  const provided = process.env.STAGING_SEED_PASSWORD?.trim();
  return hashPassword(provided && provided.length > 0 ? provided : randomBytes(24).toString('hex'));
}

const quote = (value: string): string => `'${value.replace(/'/g, "''")}'`;

/**
 * Права владельца платформы без префикса `platform.` — их миграции выдают только
 * `platform_admin`. Список сверяется с миграциями тестом: новое такое право без записи здесь
 * тест назовёт по имени.
 */
const PLATFORM_ONLY_PERMISSIONS = ['library.publish'] as const;

/** Право владельца платформы: арендатор его не получает ни на стенде, ни где-либо ещё. */
export const isPlatformOnlyPermission = (code: string): boolean =>
  code.startsWith('platform.') || (PLATFORM_ONLY_PERMISSIONS as readonly string[]).includes(code);

/** SQL-условие «право не платформенное» — одно на выдачу и на отзыв, чтобы они не разошлись. */
const notPlatformOnly = (column: string): string =>
  `${column} not like 'platform.%' and ${column} not in (${PLATFORM_ONLY_PERMISSIONS.map(quote).join(', ')})`;

/**
 * SQL сида — отдельными командами, чтобы скрипт мог выполнить их по одной и сказать, на какой
 * именно споткнулся. Каждая команда идемпотентна: скрипт запускают руками и обычно не раз.
 */
export function stagingSeedStatements(options: { passwordHash?: string } = {}): string[] {
  const passwordHash = options.passwordHash ?? stagingPasswordHash();
  const t = quote(STAGING_TENANT.id);

  return [
    `insert into core.tenants (id, code, name, status)
     values (${t}, ${quote(STAGING_TENANT.code)}, ${quote(STAGING_TENANT.name)}, 'active')
     on conflict (id) do nothing`,

    `insert into org.tenant_settings (id, tenant_id, payload)
     values ('tenant_settings_beta', ${t},
       '{"locale":"ru-RU","timezone":"Europe/Moscow","academyName":"Бета"}'::jsonb)
     on conflict (tenant_id) do nothing`,

    `insert into org.tenant_requisites (id, tenant_id, legal_name, tax_number, payload)
     values ('tenant_req_beta', ${t}, 'ООО Бета', '7800000000', '{"address":"Санкт-Петербург"}'::jsonb)
     on conflict (tenant_id) do nothing`,

    `insert into iam.roles (id, tenant_id, code, name)
     values ${ROLES.map((r) => `(${quote(r.id)}, ${t}, ${quote(r.code)}, ${quote(r.name)})`).join(', ')}
     on conflict (id) do nothing`,

    `insert into iam.users (id, tenant_id, login, email, password_hash, status, display_name)
     values ${USERS.map(
       (u) =>
         `(${quote(u.id)}, ${t}, ${quote(u.login)}, ${quote(u.email)}, ${quote(passwordHash)}, 'active', ${quote(u.displayName)})`
     ).join(', ')}
     on conflict (id) do nothing`,

    `insert into iam.user_roles (id, tenant_id, user_id, role_id)
     values ${USERS.map((u) => `(${quote(`ur_beta_${u.login}`)}, ${t}, ${quote(u.id)}, ${quote(u.roleId)})`).join(', ')}
     on conflict (tenant_id, user_id, role_id) do nothing`,

    // Без этой строки арендатор рождается с ролями без единого права — вход есть, продукта нет.
    // Но права владельца платформы (`platform.*`, `library.publish`) арендатору не положены.
    `insert into iam.role_permissions (id, tenant_id, role_id, permission_id)
     select concat('rp_', r.id, '_', p.id), ${t}, r.id, p.id
     from iam.roles r
     join iam.permissions p on ${notPlatformOnly('p.code')}
     where r.tenant_id = ${t} and r.code = 'tenant_admin'
     on conflict (tenant_id, role_id, permission_id) do nothing`,

    // Стенд, засеянный до починки 336, уже носит платформенные права — отбираем их.
    `delete from iam.role_permissions rp
     using iam.permissions p
     where rp.tenant_id = ${t} and rp.permission_id = p.id and not (${notPlatformOnly('p.code')})`,

    `insert into learning.courses (id, tenant_id, code, title, description, status)
     values ('course_beta_ot', ${t}, 'OT-BETA', 'Охрана труда (Бета)',
       'Курс арендатора «Бета» — виден только внутри него', 'published')
     on conflict (id) do nothing`,

    `insert into learning.groups (id, tenant_id, code, name, status)
     values ('group_beta_1', ${t}, 'G-BETA-1', 'Группа Бета-1', 'active')
     on conflict (id) do nothing`,

    `insert into learning.learners (id, tenant_id, user_id, first_name, last_name, email, status)
     values ('learner_beta_1', ${t}, 'u_beta_learner', 'Пётр', 'Бетов', 'learner@beta.local', 'active')
     on conflict (id) do nothing`
  ];
}
