/**
 * ФТ-I3 — завести на стенде ВТОРОГО арендатора.
 *
 * Запуск: `pnpm seed:staging` из корня (делегирует в пакет бэкенда) (пароль — в `STAGING_SEED_PASSWORD`, адрес базы — в `DATABASE_URL`).
 *
 * Зачем это нужно: изоляция арендаторов закрыта тестами, но на живом стенде её нельзя было
 * увидеть глазами — в базе жил ровно один арендатор. Скрипт создаёт второго со своими
 * пользователями, курсом, группой и слушателем, чтобы можно было войти под каждым и убедиться,
 * что чужие данные не видны.
 *
 * Скрипт отказывается работать в проде: демонстрационные данные там не нужны, а «случайно
 * запустил не там» — ровно тот случай, который потом ищут неделю.
 */
import { Pool } from 'pg';

import {
  STAGING_TENANT,
  stagingPasswordHash,
  stagingSeedStatements
} from '../src/seeds/staging-seed.js';

const isProduction = (): boolean =>
  (process.env.NODE_ENV ?? '').toLowerCase() === 'production' ||
  (process.env.APP_ENV ?? '').toLowerCase() === 'production';

async function main(): Promise<void> {
  if (isProduction()) {
    console.error(
      'Отказ: это данные для стенда, в проде им не место. Снимите NODE_ENV/APP_ENV=production.'
    );
    process.exitCode = 1;
    return;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('Не задан DATABASE_URL — скрипту некуда писать.');
    process.exitCode = 1;
    return;
  }

  if (!process.env.STAGING_SEED_PASSWORD?.trim()) {
    console.warn(
      'STAGING_SEED_PASSWORD не задан: арендатор будет создан, но войти под ним не получится — ' +
        'пароль случайный. Задайте переменную и запустите ещё раз, если нужен вход.'
    );
  }

  const pool = new Pool({ connectionString });
  const passwordHash = stagingPasswordHash();

  try {
    const statements = stagingSeedStatements({ passwordHash });
    for (const [index, sql] of statements.entries()) {
      try {
        await pool.query(sql);
      } catch (error) {
        // Номер шага важнее стека: по нему сразу видно, на какой таблице споткнулись.
        console.error(`Шаг ${index + 1} из ${statements.length} не выполнен:`, error);
        throw error;
      }
    }
    console.log(
      `Готово: арендатор «${STAGING_TENANT.name}» (код ${STAGING_TENANT.code}) заведён. ` +
        'Войдите под beta_admin и проверьте, что данных демонстрационного арендатора не видно.'
    );
  } finally {
    await pool.end();
  }
}

void main();
