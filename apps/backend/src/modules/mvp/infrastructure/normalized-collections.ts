import { backendEnv } from '../../../env.js';

/**
 * Какие коллекции домена читаются из нормализованных таблиц, а не из JSON-снимка
 * (ТЗ перехода с CDOPROF, Фаза 1, решение РМ32).
 *
 * Значение `LMS_READ_MODEL=normalized` исторически означает «читать JSON-зеркало stage1», и
 * менять его смысл под действующими стендами нельзя. Поэтому переключение чтения идёт
 * отдельным флагом ПО КОЛЛЕКЦИЯМ: `LMS_NORMALIZED_COLLECTIONS=groups,counterparties`.
 * Пустое значение — всё читается из снимка (точка отката всей Фазы 1). Запись в таблицы от
 * флага не зависит: проекция при сохранении снимка включена всегда (РМ35), иначе записи,
 * сделанные между бэкфиллом и включением флага, терялись бы.
 *
 * Список допустимых имён закрыт и растёт по срезам: коллекция попадает сюда только вместе с
 * репозиторием, который умеет её читать. Опечатка в переменной — ошибка старта, а не тихое
 * чтение из снимка.
 */
export const NORMALIZABLE_COLLECTIONS = ['counterparties', 'groups'] as const;
export type NormalizableCollection = (typeof NORMALIZABLE_COLLECTIONS)[number];

export function parseNormalizedCollections(raw: string): Set<NormalizableCollection> {
  const names = raw
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
  const result = new Set<NormalizableCollection>();
  for (const name of names) {
    if (!(NORMALIZABLE_COLLECTIONS as ReadonlyArray<string>).includes(name)) {
      throw new Error(
        `LMS_NORMALIZED_COLLECTIONS: коллекция «${name}» не читается из таблиц; допустимы: ${NORMALIZABLE_COLLECTIONS.join(', ')}`
      );
    }
    result.add(name as NormalizableCollection);
  }
  return result;
}

let cached: Set<NormalizableCollection> | null = null;

/** Набор из переменной окружения; разбирается один раз на процесс. */
export function normalizedCollections(): Set<NormalizableCollection> {
  if (!cached) cached = parseNormalizedCollections(backendEnv.LMS_NORMALIZED_COLLECTIONS);
  return cached;
}

export function isNormalizedRead(collection: NormalizableCollection): boolean {
  return normalizedCollections().has(collection);
}

/** Для тестов, которые подменяют переменную окружения между случаями. */
export function resetNormalizedCollectionsCache(): void {
  cached = null;
}
