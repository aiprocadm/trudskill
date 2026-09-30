/**
 * Сканы внешних документов пачкой (МГ-K6.1, срез 23.6): файл → документ по номеру в имени.
 *
 * Выгрузка прежней системы называет файлы номером документа («264501-3.pdf», «Иванов
 * 264501-3.pdf»). Номер ищется в имени целым словом; совпал у нескольких документов (одна
 * серия номеров у разных видов) — выбирает фамилия слушателя в имени. Не нашлось или осталось
 * несколько — файл не прикрепляется, а объясняется: прикрепить не к тому документу хуже, чем
 * не прикрепить вовсе.
 */

export interface ScanCandidate {
  id: string;
  number: string;
  /** Фамилия слушателя документа — чтобы развести одинаковые номера. */
  learnerLastName?: string;
  hasScan: boolean;
}

export type ScanMatch =
  | { status: 'attach'; documentId: string; number: string }
  | { status: 'has_scan'; documentId: string; number: string }
  | { status: 'not_matched' }
  | { status: 'ambiguous'; numbers: string[] };

const fold = (value: string): string =>
  value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[_\s]+/g, ' ')
    .trim();

/** Имя файла без расширения, в нижнем регистре, «_» как пробел. */
export const scanBaseName = (fileName: string): string =>
  fold(fileName.replace(/\.[a-z0-9]{1,5}$/i, ''));

const escape = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Номер стоит в имени целым словом: «264501-3» не найдётся в «1264501-35». */
const containsWord = (base: string, word: string): boolean =>
  new RegExp(`(^|[^0-9a-zа-я])${escape(word)}($|[^0-9a-zа-я])`, 'i').test(base);

export const matchScan = (fileName: string, candidates: readonly ScanCandidate[]): ScanMatch => {
  const base = scanBaseName(fileName);
  if (!base) return { status: 'not_matched' };
  let found = candidates.filter((item) => item.number && containsWord(base, fold(item.number)));
  if (found.length > 1) {
    const byName = found.filter(
      (item) => item.learnerLastName && containsWord(base, fold(item.learnerLastName))
    );
    if (byName.length >= 1) found = byName;
  }
  if (found.length === 0) return { status: 'not_matched' };
  if (found.length > 1)
    return { status: 'ambiguous', numbers: [...new Set(found.map((item) => item.number))] };
  const [only] = found;
  return only!.hasScan
    ? { status: 'has_scan', documentId: only!.id, number: only!.number }
    : { status: 'attach', documentId: only!.id, number: only!.number };
};
