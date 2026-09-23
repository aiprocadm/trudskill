/**
 * Выгрузка CDOPROF в JSON на стенде миграции (ТЗ перехода с CDOPROF, Фаза 0, МГ-K1.1; Часть VI
 * PR-2: «только чтение API CDOPROF в JSON-файлы на стенде (ключ из env, паузы, пагинация)»).
 *
 * Запуск из корня: `pnpm export:cdoprof` (живой API) или `pnpm export:cdoprof -- --fixtures`
 * (учебный прогон на обезличенных фикстурах, без сети и без ключа).
 *
 * Настройки — только из окружения (адреса CDOPROF в коде не живут — правило трекера):
 *   CDOPROF_API_BASE_URL       адрес источника, например https://<центр>.cdoprof.com
 *   CDOPROF_API_KEY            ключ из «Настройка УЦ → API» (владелец, О1)
 *   CDOPROF_EXPORT_DIR         папка ВНЕ репозитория; в файлах — ПДн слушателей
 *   CDOPROF_REQUEST_PAUSE_MS   пауза между запросами, по умолчанию 300
 *   CDOPROF_PAGE_LIMIT         размер страницы (≤100), по умолчанию 100
 *   CDOPROF_MAX_RETRIES        повторов при 429/5xx, по умолчанию 3
 *
 * Флаги: `--fixtures` — без сети, папка по умолчанию во временной; `--no-trainings` — не обходить
 * обучения по контрагентам (самая долгая часть: по вызову на каждого из ~1 600 контрагентов).
 *
 * Логика — в `src/modules/import-cdoprof/`, там она под типами, линтером и тестами. Здесь только
 * склейка окружения с кодом.
 */
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { runCdoprofExport } from '../src/modules/import-cdoprof/export/cdoprof-export.js';
import { assertExportDirOutsideRepo } from '../src/modules/import-cdoprof/export/export-dir-guard.js';
import { FsExportSink } from '../src/modules/import-cdoprof/export/fs-export-sink.js';
import { CdoprofApiClient } from '../src/modules/import-cdoprof/sources/cdoprof-api-client.js';
import { FixtureCdoprofTransport } from '../src/modules/import-cdoprof/sources/fixture-cdoprof-transport.js';
import { HttpCdoprofTransport } from '../src/modules/import-cdoprof/sources/http-cdoprof-transport.js';

import type { CdoprofExportManifest } from '../src/modules/import-cdoprof/export/cdoprof-export.js';
import type { CdoprofTransport } from '../src/modules/import-cdoprof/sources/cdoprof-transport.js';

const REPO_ROOT = resolve(import.meta.dirname, '../../..');

const numberFromEnv = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} должно быть неотрицательным числом, а не «${raw}»`);
  }
  return parsed;
};

const printManifest = (manifest: CdoprofExportManifest, dir: string): void => {
  console.log('');
  console.log(`Выгрузка CDOPROF завершена за ${Math.round(manifest.durationMs / 1000)} с → ${dir}`);
  for (const [name, entity] of Object.entries(manifest.entities)) {
    console.log(`  ${name.padEnd(14)} ${String(entity.count).padStart(7)}  (${entity.file})`);
  }
  if (manifest.trainings.requested > 0) {
    console.log(
      `  ${'trainings'.padEnd(14)} ${String(manifest.trainings.exported).padStart(7)} из ${manifest.trainings.requested} контрагентов`
    );
  }
  if (manifest.warnings.length > 0) {
    console.log('');
    console.log(`Предупреждений: ${manifest.warnings.length} — полный список в manifest.json`);
    for (const warning of manifest.warnings.slice(0, 10)) console.log(`  • ${warning}`);
  }
  console.log('');
  console.log('Профиль колонок (заполнено / пусто) — в manifest.json; ПДн в нём нет.');
  console.log('Файлы данных содержат ПДн: не копировать в репозиторий и в чат.');
};

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const useFixtures = args.has('--fixtures');
  const withTrainings = !args.has('--no-trainings');

  let transport: CdoprofTransport;
  let dir: string;

  if (useFixtures) {
    transport = new FixtureCdoprofTransport();
    dir = process.env.CDOPROF_EXPORT_DIR ?? join(tmpdir(), 'cdoprof-export-fixtures');
    console.log('Учебный прогон на обезличенных фикстурах: сеть и ключ не нужны.');
  } else {
    const baseUrl = process.env.CDOPROF_API_BASE_URL;
    const apiKey = process.env.CDOPROF_API_KEY;
    const exportDir = process.env.CDOPROF_EXPORT_DIR;
    const missing = [
      !baseUrl && 'CDOPROF_API_BASE_URL',
      !apiKey && 'CDOPROF_API_KEY',
      !exportDir && 'CDOPROF_EXPORT_DIR'
    ].filter(Boolean);
    if (missing.length > 0 || !baseUrl || !apiKey || !exportDir) {
      console.error(`Отказ: не заданы ${missing.join(', ')}. Ключ и адрес — у владельца (О1).`);
      console.error('Для прогона без доступа к CDOPROF: pnpm export:cdoprof -- --fixtures');
      process.exitCode = 1;
      return;
    }
    dir = exportDir;
    transport = new HttpCdoprofTransport({
      baseUrl,
      apiKey,
      pauseMs: numberFromEnv('CDOPROF_REQUEST_PAUSE_MS', 300),
      maxRetries: numberFromEnv('CDOPROF_MAX_RETRIES', 3)
    });
  }

  assertExportDirOutsideRepo(dir, REPO_ROOT, { allowInsideRepo: useFixtures });

  const client = new CdoprofApiClient(transport, {
    pageLimit: numberFromEnv('CDOPROF_PAGE_LIMIT', 100)
  });
  const sink = new FsExportSink(resolve(dir));
  const manifest = await runCdoprofExport(client, sink, {
    withTrainings,
    log: (message) => console.log(`  … ${message}`)
  });
  printManifest(manifest, resolve(dir));
}

main().catch((error: unknown) => {
  console.error('Выгрузка не удалась:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
