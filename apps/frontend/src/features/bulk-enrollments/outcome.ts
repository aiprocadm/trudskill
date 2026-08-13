import type { BulkImportOutcome, BulkImportOutcomeRow, ClassifiedParsedRow } from './types';
import type { BulkOutcome } from '@trudskill/ui';

/**
 * Итог загрузки файла — по всему файлу, а не только по отправленным строкам.
 *
 * До этого экран показывал итог сервера, а строки, отсеянные проверкой ещё на компьютере,
 * из отчёта пропадали: в предпросмотре человек видел «ошибок 2», после загрузки — только
 * восемь успешных, и куда делись двое, экран не отвечал. Считаем от файла: сколько строк
 * было, сколько зачислено, кто и почему не прошёл.
 */

/** Человек ищет строку в своём файле по имени; номер строки — чтобы найти её глазами. */
export const rowLabel = (row: { rowNumber: number; fullName?: string; email?: string }): string => {
  const name = row.fullName?.trim();
  if (name) return `${name} (строка ${row.rowNumber})`;
  const email = row.email?.trim();
  if (email) return `${email} (строка ${row.rowNumber})`;
  return `Строка ${row.rowNumber}`;
};

/** Ответ сервера бывает без текста ошибки — код показывать человеку нельзя. */
const serverReason = (row: BulkImportOutcomeRow): string =>
  row.errorMessage?.trim() || 'Сервер отклонил строку, причина не указана';

export const STATUS_LABEL: Record<BulkImportOutcomeRow['status'], string> = {
  created: 'заведён и зачислен',
  reused: 'найден в базе и зачислен',
  enrolled_only: 'уже был зачислен',
  failed: 'не зачислен'
};

/**
 * Строки, которые не уедут на сервер: их отсеяла проверка на компьютере.
 * Отправлять их бессмысленно, но молчать о них нельзя.
 */
export const localFailures = (classified: ClassifiedParsedRow[]): BulkOutcome['failures'] =>
  classified
    .filter((item) => item.classification === 'invalid')
    .map((item) => ({
      label: rowLabel(item.row),
      reason: item.errors.map((error) => error.message).join('; ') || 'Строка не прошла проверку'
    }));

export const buildImportOutcome = (
  classified: ClassifiedParsedRow[],
  serverOutcome: BulkImportOutcome | null
): BulkOutcome => {
  const byRowNumber = new Map(classified.map((item) => [item.row.rowNumber, item.row]));
  const failures = localFailures(classified);

  const serverRows = serverOutcome?.rows ?? [];
  for (const row of serverRows) {
    if (row.status !== 'failed') continue;
    const parsed = byRowNumber.get(row.rowNumber);
    failures.push({
      label: rowLabel(parsed ?? { rowNumber: row.rowNumber }),
      reason: serverReason(row)
    });
  }

  // «Уже был зачислен» — это успех, а не отказ: повторная загрузка того же файла
  // не должна выглядеть как поломка.
  const succeeded = serverRows.filter((row) => row.status !== 'failed').length;

  return { total: classified.length, succeeded, failures };
};

/** Успешные строки — с человеческим статусом вместо кода (TXT-006). */
export const successfulRows = (
  classified: ClassifiedParsedRow[],
  serverOutcome: BulkImportOutcome | null
): Array<{ label: string; status: string; learnerId?: string }> => {
  const byRowNumber = new Map(classified.map((item) => [item.row.rowNumber, item.row]));
  return (serverOutcome?.rows ?? [])
    .filter((row) => row.status !== 'failed')
    .map((row) => {
      const parsed = byRowNumber.get(row.rowNumber);
      return {
        label: rowLabel(parsed ?? { rowNumber: row.rowNumber }),
        status: STATUS_LABEL[row.status],
        ...(row.learnerId ? { learnerId: row.learnerId } : {})
      };
    });
};
