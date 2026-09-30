/**
 * «Номера удостоверений» группы (ТЗ перехода с CDOPROF, МГ-F3.2, Фаза 3, срез 20.3a) — аналог
 * «Расстановки номеров» CDOPROF: номер, серия и разряд удостоверения назначаются слушателю ДО
 * выпуска и правятся руками, пока удостоверение не выпущено.
 *
 * Чистые правила без ввода-вывода: что уже занято и что выпущено, даёт `MvpService`.
 * Массовая правка — по принципу частичного успеха: годные строки сохраняются, отказы
 * возвращаются поимённо с причиной, одна плохая строка не отменяет остальные.
 */

export interface CertificateNumberRowInput {
  enrollmentId: string;
  number?: string | null | undefined;
  series?: string | null | undefined;
  rank?: string | null | undefined;
}

export type CertificateNumberRowStatus = 'updated' | 'failed';

export interface CertificateNumberRowOutcome {
  rowNumber: number;
  enrollmentId: string;
  status: CertificateNumberRowStatus;
  code?: string;
  message?: string;
}

export interface CertificateNumbersOutcome {
  total: number;
  updated: number;
  failed: number;
  rows: CertificateNumberRowOutcome[];
}

export interface CertificateNumberContext {
  /** Записи этой группы (не отменённые): идентификатор → есть ли уже выпущенное удостоверение. */
  enrollments: ReadonlyMap<string, { issued: boolean }>;
  /** Номера удостоверений, уже назначенные записям ВНЕ этой пачки: номер → запись. */
  takenNumbers: ReadonlyMap<string, string>;
}

/** Пусто — снять назначение; иначе строка без краевых пробелов. */
const clean = (value: string | null | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

export interface CertificateNumberChange {
  enrollmentId: string;
  number: string | undefined;
  series: string | undefined;
  rank: string | undefined;
}

/**
 * Решение по каждой строке: что сохранить и почему отказать. Номер уникален среди номеров
 * удостоверений центра — и в пачке, и среди уже назначенных другим записям (выданные номера
 * сторожит ещё и выпуск: `document_number_taken`, заявка 0088).
 */
export function planCertificateNumbers(
  rows: readonly CertificateNumberRowInput[],
  context: CertificateNumberContext
): { changes: CertificateNumberChange[]; outcome: CertificateNumbersOutcome } {
  const changes: CertificateNumberChange[] = [];
  const outcomes: CertificateNumberRowOutcome[] = [];
  const inBatch = new Map<string, string>();

  rows.forEach((row, index) => {
    const rowNumber = index + 1;
    const fail = (code: string, message: string) =>
      outcomes.push({ rowNumber, enrollmentId: row.enrollmentId, status: 'failed', code, message });

    const enrollment = context.enrollments.get(row.enrollmentId);
    if (!enrollment) {
      fail('enrollment_not_in_group', 'Слушатель не состоит в этой группе');
      return;
    }
    if (enrollment.issued) {
      fail(
        'certificate_already_issued',
        'Удостоверение уже выпущено — номер меняется только перевыпуском'
      );
      return;
    }
    const number = clean(row.number);
    if (number) {
      const owner = context.takenNumbers.get(number);
      if (owner && owner !== row.enrollmentId) {
        fail('certificate_number_taken', `Номер ${number} уже назначен другому слушателю`);
        return;
      }
      const sameBatch = inBatch.get(number);
      if (sameBatch && sameBatch !== row.enrollmentId) {
        fail('certificate_number_duplicate', `Номер ${number} повторяется в списке`);
        return;
      }
      inBatch.set(number, row.enrollmentId);
    }
    changes.push({
      enrollmentId: row.enrollmentId,
      number,
      series: clean(row.series),
      rank: clean(row.rank)
    });
    outcomes.push({ rowNumber, enrollmentId: row.enrollmentId, status: 'updated' });
  });

  const updated = outcomes.filter((o) => o.status === 'updated').length;
  return {
    changes,
    outcome: { total: rows.length, updated, failed: rows.length - updated, rows: outcomes }
  };
}
