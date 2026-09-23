/**
 * Выгрузка CDOPROF в JSON — Фаза 0, МГ-K1.1 («посчитать объёмы, описать колонки»).
 *
 * Чистая функция: клиент даёт данные, приёмник (`ExportSink`) их сохраняет. Так одна и та же
 * выгрузка проверяется на фикстурах в памяти и запускается на стенде в папку с файлами.
 *
 * **Манифест без ПДн.** Файлы с данными остаются на защищённом стенде; в репозиторий и в отчёт
 * попадает только манифест — счётчики и профиль колонок (заполнено / пусто / строка
 * «undefined»). По нему видно, какие поля источника реально заполнены, а какие — декорация,
 * и это решает, что переносить в Фазе 4, без единого ФИО в git.
 *
 * **Частичный успех.** `contragent.students.trainings` — ~1 622 вызова; отказ по одному
 * контрагенту записывается поимённо и не останавливает остальные (принцип массовых операций
 * репозитория).
 */
import type { CdoprofApiClient } from '../sources/cdoprof-api-client.js';
import type { CdoprofTrainingsResponse } from '../sources/cdoprof-api.schemas.js';

export interface ExportSink {
  write(name: string, payload: unknown): Promise<void>;
}

export interface ColumnProfile {
  filled: number;
  empty: number;
  /** Сколько раз значение было буквально строкой `undefined` — известная грязь источника. */
  undefinedStrings: number;
}

export interface EntityManifest {
  file: string;
  count: number;
  columns: Record<string, ColumnProfile>;
}

export interface CdoprofExportManifest {
  exportedAt: string;
  durationMs: number;
  entities: Record<string, EntityManifest>;
  trainings: {
    requested: number;
    exported: number;
    failed: Array<{ contragentId: number; reason: string }>;
  };
  warnings: string[];
}

export interface CdoprofExportOptions {
  /** Обходить ли обучения по каждому контрагенту (самая долгая часть). По умолчанию да. */
  withTrainings?: boolean;
  now?: () => Date;
  log?: (message: string) => void;
}

export const EXPORT_FILES = {
  contragents: 'contragents.json',
  students: 'students.json',
  parentCourses: 'parent-courses.json',
  courses: 'courses.json',
  groups: 'groups.json',
  trainings: 'trainings.json',
  manifest: 'manifest.json'
} as const;

const isEmpty = (value: unknown): boolean =>
  value === null || value === undefined || (typeof value === 'string' && value.trim() === '');

export const profileColumns = (
  rows: ReadonlyArray<Record<string, unknown>>
): Record<string, ColumnProfile> => {
  const columns: Record<string, ColumnProfile> = {};
  const keys = new Set<string>();
  for (const row of rows) for (const key of Object.keys(row)) keys.add(key);
  for (const key of [...keys].sort()) {
    const profile: ColumnProfile = { filled: 0, empty: 0, undefinedStrings: 0 };
    for (const row of rows) {
      const value = row[key];
      if (isEmpty(value)) profile.empty += 1;
      else profile.filled += 1;
      if (value === 'undefined') profile.undefinedStrings += 1;
    }
    columns[key] = profile;
  }
  return columns;
};

const collect = async <T>(iterator: AsyncGenerator<T>): Promise<T[]> => {
  const out: T[] = [];
  for await (const item of iterator) out.push(item);
  return out;
};

export async function runCdoprofExport(
  client: CdoprofApiClient,
  sink: ExportSink,
  options: CdoprofExportOptions = {}
): Promise<CdoprofExportManifest> {
  const now = options.now ?? (() => new Date());
  const log = options.log ?? (() => {});
  const startedAt = now();
  const warnings: string[] = [];
  const entities: Record<string, EntityManifest> = {};

  const saveEntity = async (
    name: keyof typeof EXPORT_FILES,
    rows: Array<Record<string, unknown>>
  ) => {
    const file = EXPORT_FILES[name];
    await sink.write(file, rows);
    entities[name] = { file, count: rows.length, columns: profileColumns(rows) };
    log(`${name}: ${rows.length}`);
  };

  const contragents = await collect(client.iterateContragents());
  await saveEntity('contragents', contragents);
  await saveEntity('students', await collect(client.iterateStudents()));
  await saveEntity('parentCourses', await collect(client.iterateParentCourses()));
  await saveEntity('courses', await collect(client.iterateCourses()));
  await saveEntity('groups', await collect(client.iterateGroups()));

  const trainings: CdoprofExportManifest['trainings'] = { requested: 0, exported: 0, failed: [] };
  if (options.withTrainings ?? true) {
    const responses: Array<{ contragentId: number; response: CdoprofTrainingsResponse }> = [];
    for (const contragent of contragents) {
      trainings.requested += 1;
      try {
        const response = await client.getContragentTrainings(contragent.id);
        responses.push({ contragentId: contragent.id, response });
        trainings.exported += 1;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        trainings.failed.push({ contragentId: contragent.id, reason });
        warnings.push(`Обучения контрагента ${contragent.id} не выгружены: ${reason}`);
        log(`обучения контрагента ${contragent.id}: отказ`);
      }
    }
    await sink.write(EXPORT_FILES.trainings, responses);
    log(`trainings: ${trainings.exported} из ${trainings.requested}`);
  }

  const manifest: CdoprofExportManifest = {
    exportedAt: startedAt.toISOString(),
    durationMs: Math.max(0, now().getTime() - startedAt.getTime()),
    entities,
    trainings,
    warnings
  };
  await sink.write(EXPORT_FILES.manifest, manifest);
  return manifest;
}
