/**
 * Разовая уборка: учётки с публично известным паролем (журнал 290, порция 39).
 *
 * **Зачем.** До порции 31 создание сотрудника БЕЗ пароля подставляло `Password123!` — он
 * напечатан в руководстве по стенду, в демо-миграции и в самом репозитории. Источник закрыт,
 * но записи, заведённые раньше, остались: войти в них может любой, кто читал наши документы,
 * а сменить пароль в продукте нечем.
 *
 * **Почему руками, а не автоматикой при запуске.** Демо-пользователи стенда носят этот пароль
 * НАМЕРЕННО, а перебор scrypt-хэшей по всем учёткам — минуты работы при большом центре.
 * Поэтому: команда запускается человеком, по умолчанию НИЧЕГО не меняет (показывает список),
 * а запись делает только с явным согласием.
 *
 * Запуск (из корня):
 *   pnpm --filter @trudskill/backend exec tsx scripts/neutralize-known-passwords.ts
 *       — показать, кого нашли, ничего не меняя;
 *   ... --apply
 *       — нейтрализовать найденное: вход по паролю становится невозможен, человек входит
 *         по ссылке на почту (см. порцию 23);
 *   ... --keep-tenant tenant_demo
 *       — оставить как есть перечисленные центры (по умолчанию исключается `tenant_demo`).
 */
import { Pool } from 'pg';

import { unusablePasswordHash } from '../src/modules/iam/crypto.util.js';
import { findUsersWithKnownPassword } from '../src/modules/iam/services/known-password-audit.js';

const DEFAULT_KEEP_TENANTS = ['tenant_demo'];

interface Options {
  apply: boolean;
  keepTenantIds: string[];
}

function parseOptions(argv: string[]): Options {
  const keep: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--keep-tenant' && argv[i + 1]) {
      keep.push(argv[i + 1] as string);
      i++;
    }
  }
  return {
    apply: argv.includes('--apply'),
    keepTenantIds: keep.length > 0 ? keep : DEFAULT_KEEP_TENANTS
  };
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('Не задан DATABASE_URL — команде некуда смотреть.');
    process.exitCode = 1;
    return;
  }
  const options = parseOptions(process.argv.slice(2));
  const pool = new Pool({ connectionString });

  try {
    const { rows } = await pool.query<{
      id: string;
      tenant_id: string;
      login: string;
      password_hash: string;
    }>(
      `select id, tenant_id, login, password_hash
         from iam.users
        where deleted_at is null`
    );
    console.log(`Проверяем учётные записи: ${rows.length}.`);

    const found = findUsersWithKnownPassword({
      users: rows.map((row) => ({
        id: row.id,
        tenantId: row.tenant_id,
        login: row.login,
        passwordHash: row.password_hash
      })),
      keepTenantIds: options.keepTenantIds
    });

    if (found.length === 0) {
      console.log('Учётных записей с публично известным паролем не найдено.');
      return;
    }

    console.log(`Найдено записей с публично известным паролем: ${found.length}`);
    for (const item of found) {
      console.log(`  центр ${item.tenantId}: ${item.login} (${item.id})`);
    }
    console.log(`Центры, оставленные без изменений: ${options.keepTenantIds.join(', ') || '—'}`);

    if (!options.apply) {
      console.log(
        'Ничего не менялось. Чтобы закрыть вход по этому паролю, повторите запуск с --apply: ' +
          'вход паролем станет невозможен, человек войдёт по ссылке на почту.'
      );
      return;
    }

    for (const item of found) {
      await pool.query(
        'update iam.users set password_hash = $1, updated_at = now() where id = $2',
        [unusablePasswordHash(), item.id]
      );
    }
    console.log(
      `Готово: закрыт вход по паролю у ${found.length} записей. Предупредите этих людей: ` +
        'войти теперь можно по ссылке на почту.'
    );
  } finally {
    await pool.end();
  }
}

void main();
