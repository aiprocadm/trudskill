/**
 * Синтетический тенант «объём CDOPROF» для спайка производительности (ТЗ перехода с CDOPROF,
 * §15.1 МГ-A3.1; Часть VI PR-3).
 *
 * Запуск из корня: `pnpm perf:synth` (адрес базы — `DATABASE_URL`).
 *
 * Настройки (все — со значением по умолчанию, кроме тенанта):
 *   PERF_SYNTH_TENANT_ID      обязательно; тенант должен существовать (в свежей базе миграции
 *                             создают `tenant_demo` с `tenant_admin`)
 *   PERF_SYNTH_GROUPS         25000     PERF_SYNTH_LEARNERS     14000
 *   PERF_SYNTH_ENROLLMENTS    30000     PERF_SYNTH_COUNTERPARTIES 1622
 *   PERF_SYNTH_COURSES        427       PERF_SYNTH_SEED         1
 *   PERF_SYNTH_BATCH          1000
 *
 * **Скрипт отказывается работать в боевом контуре** и в базе, чьё имя не содержит `perf`:
 * 25 000 выдуманных групп в стендовом или рабочем центре — ровно то, что потом ищут неделю.
 * Замер делается в ОТДЕЛЬНОЙ базе (runbook стенда требует отдельный тенант; отдельная база
 * строже и проще откатывается — `drop database`).
 *
 * Логика — в `src/perf/` (типы, линтер, тесты); здесь только склейка окружения с кодом.
 */
import { Pool } from 'pg';

import { poolTransactions, writeRuntimeRows } from '../src/perf/runtime-rows-writer.js';
import {
  DEFAULT_SYNTHETIC_SHAPE,
  buildSyntheticCdoprofTenant,
  toRuntimeRows
} from '../src/perf/synthetic-volume-tenant.js';

const isProduction = (): boolean =>
  (process.env.NODE_ENV ?? '').toLowerCase() === 'production' ||
  (process.env.APP_ENV ?? '').toLowerCase() === 'production';

const intFromEnv = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} должно быть целым неотрицательным числом, а не «${raw}»`);
  }
  return parsed;
};

const databaseName = (connectionString: string): string => {
  try {
    return new URL(connectionString).pathname.replace(/^\//, '');
  } catch {
    return '';
  }
};

async function main(): Promise<void> {
  if (isProduction()) {
    console.error(
      'Отказ: синтетическим данным в боевом контуре не место. Снимите NODE_ENV/APP_ENV=production.'
    );
    process.exitCode = 1;
    return;
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('Отказ: не задан DATABASE_URL — некуда писать.');
    process.exitCode = 1;
    return;
  }
  const dbName = databaseName(connectionString);
  if (!dbName.includes('perf')) {
    console.error(
      `Отказ: база «${dbName}» не похожа на базу для замеров (в имени нет «perf»). ` +
        'Спайк заливает 25 000 групп — делайте это в отдельной базе, например trudskill_perf.'
    );
    process.exitCode = 1;
    return;
  }
  const tenantId = process.env.PERF_SYNTH_TENANT_ID;
  if (!tenantId) {
    console.error('Отказ: не задан PERF_SYNTH_TENANT_ID (в свежей базе это tenant_demo).');
    process.exitCode = 1;
    return;
  }

  const shape = {
    counterparties: intFromEnv('PERF_SYNTH_COUNTERPARTIES', DEFAULT_SYNTHETIC_SHAPE.counterparties),
    courses: intFromEnv('PERF_SYNTH_COURSES', DEFAULT_SYNTHETIC_SHAPE.courses),
    groups: intFromEnv('PERF_SYNTH_GROUPS', DEFAULT_SYNTHETIC_SHAPE.groups),
    learners: intFromEnv('PERF_SYNTH_LEARNERS', DEFAULT_SYNTHETIC_SHAPE.learners),
    enrollments: intFromEnv('PERF_SYNTH_ENROLLMENTS', DEFAULT_SYNTHETIC_SHAPE.enrollments)
  };
  const seed = intFromEnv('PERF_SYNTH_SEED', 1);
  const batchSize = intFromEnv('PERF_SYNTH_BATCH', 1000);

  console.log(`Синтетический тенант ${tenantId} в базе ${dbName} (seed ${seed}):`);
  console.log(`  контрагентов: ${shape.counterparties}`);
  console.log(`  курсов:       ${shape.courses}`);
  console.log(`  групп:        ${shape.groups} (+ столько же связей группа→курс)`);
  console.log(`  слушателей:   ${shape.learners} — без ПДн`);
  console.log(`  зачислений:   ${shape.enrollments}`);

  const startedAt = Date.now();
  const rows = toRuntimeRows(buildSyntheticCdoprofTenant(tenantId, shape, seed));
  console.log(`Сгенерировано строк: ${rows.length} за ${Date.now() - startedAt} мс. Пишу…`);

  const pool = new Pool({ connectionString });
  try {
    const exists = await pool.query('select 1 from core.tenants where id = $1', [tenantId]);
    if (exists.rowCount === 0) {
      console.error(
        `Отказ: тенанта ${tenantId} нет в core.tenants. Скрипт не заводит тенанты — миграции создают tenant_demo.`
      );
      process.exitCode = 1;
      return;
    }
    const writeStartedAt = Date.now();
    const result = await writeRuntimeRows(poolTransactions(pool), tenantId, rows, { batchSize });
    const size = await pool.query<{ bytes: string; rows: string }>(
      `select pg_size_pretty(sum(pg_column_size(data)))::text as bytes, count(*)::text as rows
         from learning.mvp_runtime_documents where tenant_id = $1`,
      [tenantId]
    );
    console.log(
      `Готово: ${result.inserted} строк в ${result.batches} пачках за ${Math.round((Date.now() - writeStartedAt) / 1000)} с; ` +
        `перезаписаны коллекции: ${result.deletedCollections.join(', ')}.`
    );
    console.log(
      `Снимок тенанта в базе: ${size.rows[0]?.rows ?? '?'} строк, ${size.rows[0]?.bytes ?? '?'} данных.`
    );
    console.log('Повторный запуск безопасен: свои коллекции перезаписываются, чужие не трогаются.');
  } catch (error) {
    console.error('Не получилось залить:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
