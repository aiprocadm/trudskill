import { Inject, Injectable } from '@nestjs/common';

import { MvpService } from './mvp.service.js';

import type { BulkImportLearnersRequest } from './learners-bulk-import.dto.js';
import type {
  BulkImportOutcome,
  BulkImportOutcomeRow,
  BulkImportRow,
  ClassifiedRow,
  ExistingLearnersSnapshot,
  RowError
} from './learners-bulk-import.types.js';
import type { RequestContext } from '../../common/context/request-context.js';

/**
 * Phase 2 Plan A — pure-function классификатор строк bulk-import.
 *
 * Не имеет состояния и DI. Принимает rows + snapshot существующих учётков,
 * возвращает ClassifiedRow[] с per-row классификацией и errors.
 *
 * Используется и backend'ом (Task 3), и frontend'ом (Task 6 — preview UX).
 */

/** Регэксп email — стандартный «есть @ и точка после неё». */
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** ФИО part — заглавная буква А-Я + строчные с возможным дефисом (для двойных). */
const FIO_PART_RE = /^[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?$/;

/** Возвращает только цифры из строки СНИЛС (формат XXX-XXX-XXX YY или XXXXXXXXXYY). */
export function normalizeSnils(input: string): string {
  return input.replace(/\D/g, '');
}

/**
 * Валидация СНИЛС по алгоритму ПФР (контрольная сумма последних 2 цифр).
 *
 * Шаги:
 *   1) первые 9 цифр умножаются на позиции 9..1 (слева направо);
 *   2) если сумма < 100 — контрольное число = сумма;
 *   3) если сумма == 100 или 101 — контрольное число = 0;
 *   4) если сумма > 101 — контрольное число = (сумма mod 101), при результате
 *      100 или 101 — контрольное число = 0.
 *
 * @param digits — нормализованные 11 цифр (см. `normalizeSnils`).
 */
export function isValidSnilsChecksum(digits: string): boolean {
  if (digits.length !== 11 || !/^\d{11}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += Number(digits[i]) * (9 - i);
  }
  let computed: number;
  if (sum < 100) {
    computed = sum;
  } else if (sum === 100 || sum === 101) {
    computed = 0;
  } else {
    const mod = sum % 101;
    computed = mod === 100 || mod === 101 ? 0 : mod;
  }
  const checksum = Number(digits.slice(9, 11));
  return computed === checksum;
}

/**
 * Классификация строк bulk-import: create / reuse / invalid.
 *
 * - `create`: нет совпадений в snapshot, все валидации прошли.
 * - `reuse`: email или СНИЛС совпали с существующим (возвращаем `reuseLearnerId`).
 * - `invalid`: есть errors (формат, in-file дубликат, identity-конфликт).
 *
 * Email сравнивается case-insensitive; СНИЛС — по нормализованным цифрам.
 */
export function classifyRows(
  rows: BulkImportRow[],
  snapshot: ExistingLearnersSnapshot
): ClassifiedRow[] {
  // === Lookup-карты существующих учётков ===
  const existingByEmail = new Map<string, string>();
  const existingBySnils = new Map<string, string>();
  for (const learner of snapshot.learners) {
    if (learner.email) {
      existingByEmail.set(learner.email.toLowerCase().trim(), learner.id);
    }
    if (learner.snils) {
      const normalized = normalizeSnils(learner.snils);
      if (normalized.length === 11) existingBySnils.set(normalized, learner.id);
    }
  }

  // === Pre-pass: in-file дубликаты по email и СНИЛС ===
  const emailCounts = new Map<string, number>();
  const snilsCounts = new Map<string, number>();
  for (const row of rows) {
    const email = (row.email ?? '').toLowerCase().trim();
    if (email) emailCounts.set(email, (emailCounts.get(email) ?? 0) + 1);
    if (row.snils) {
      const snils = normalizeSnils(row.snils);
      if (snils.length === 11) snilsCounts.set(snils, (snilsCounts.get(snils) ?? 0) + 1);
    }
  }

  // === Per-row классификация ===
  const result: ClassifiedRow[] = [];
  for (const row of rows) {
    const errors: RowError[] = [];

    // ФИО: 2-4 слова кириллицей с заглавной
    const fullName = (row.fullName ?? '').trim();
    const parts = fullName.length > 0 ? fullName.split(/\s+/) : [];
    if (parts.length < 2 || parts.length > 4) {
      errors.push({
        field: 'fullName',
        code: 'invalid_format',
        message: 'ФИО должно состоять из 2-4 слов'
      });
    } else if (!parts.every((p) => FIO_PART_RE.test(p))) {
      errors.push({
        field: 'fullName',
        code: 'invalid_format',
        message: 'ФИО должно быть кириллицей с заглавных букв'
      });
    }

    // Email
    const emailLower = (row.email ?? '').toLowerCase().trim();
    if (!EMAIL_RE.test(emailLower)) {
      errors.push({
        field: 'email',
        code: 'invalid_format',
        message: 'Некорректный email'
      });
    }

    // СНИЛС (опциональный)
    let snilsNormalized: string | null = null;
    if (row.snils && row.snils.trim().length > 0) {
      snilsNormalized = normalizeSnils(row.snils);
      if (snilsNormalized.length !== 11 || !isValidSnilsChecksum(snilsNormalized)) {
        errors.push({
          field: 'snils',
          code: 'invalid_format',
          message: 'Некорректный СНИЛС (формат или контрольная сумма)'
        });
        snilsNormalized = null;
      }
    }

    // In-file дубликаты
    if (emailLower && (emailCounts.get(emailLower) ?? 0) > 1) {
      errors.push({
        field: 'email',
        code: 'duplicate_in_file',
        message: 'Email повторяется в файле'
      });
    }
    if (snilsNormalized && (snilsCounts.get(snilsNormalized) ?? 0) > 1) {
      errors.push({
        field: 'snils',
        code: 'duplicate_in_file',
        message: 'СНИЛС повторяется в файле'
      });
    }

    if (errors.length > 0) {
      result.push({ row, classification: 'invalid', errors });
      continue;
    }

    // Reuse-резолюция
    const matchByEmail = existingByEmail.get(emailLower);
    const matchBySnils = snilsNormalized ? existingBySnils.get(snilsNormalized) : undefined;

    if (matchByEmail && matchBySnils && matchByEmail !== matchBySnils) {
      result.push({
        row,
        classification: 'invalid',
        errors: [
          {
            field: 'row',
            code: 'identity_conflict',
            message: 'Email и СНИЛС указывают на разных существующих учеников'
          }
        ]
      });
      continue;
    }

    const reuseId = matchByEmail ?? matchBySnils;
    if (reuseId) {
      result.push({ row, classification: 'reuse', reuseLearnerId: reuseId, errors: [] });
    } else {
      result.push({ row, classification: 'create', errors: [] });
    }
  }

  return result;
}

/** Парсит «Фамилия Имя [Отчество]» в части. Возвращает безопасные fallback'и для коротких имён. */
export function parseFullName(fullName: string): {
  firstName: string;
  lastName: string;
  middleName?: string;
} {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { lastName: '', firstName: parts[0]! };
  if (parts.length === 2) return { lastName: parts[0]!, firstName: parts[1]! };
  const [lastName, firstName, ...middleParts] = parts;
  return {
    lastName: lastName!,
    firstName: firstName!,
    middleName: middleParts.join(' ')
  };
}

/**
 * Phase 2 Plan A — оркестратор bulk-import: classify → resolve/create → enroll.
 *
 * Atomic flow с idempotency: повторный вызов с тем же `idempotencyKey` в рамках
 * tenant вернёт кешированный outcome (учётки/зачисления НЕ дублируются).
 *
 * Принцип `partial-success`: невалидные строки попадают в outcome со status='failed',
 * валидные — создаются/переиспользуются и зачисляются. Если ноль валидных —
 * outcome возвращается без вызова `createBulkEnrollments`.
 */
@Injectable()
export class LearnersBulkImportService {
  constructor(@Inject(MvpService) private readonly mvpService: MvpService) {}

  bulkImportLearners(
    tenantId: string,
    actorId: string | undefined,
    request: BulkImportLearnersRequest,
    context: RequestContext
  ): BulkImportOutcome {
    // 1) Idempotency lookup
    const cached = this.mvpService.getBulkImportOutcomeIfAny(tenantId, request.idempotencyKey);
    if (cached) return cached;

    // 2) Snapshot существующих учётков tenant (для reuse-детекции)
    const existingPage = this.mvpService.listLearners(tenantId, { page: 1, page_size: 10_000 });
    const snapshot: ExistingLearnersSnapshot = {
      learners: existingPage.items.map((l) => ({
        id: l.id,
        ...(l.email ? { email: l.email } : {}),
        ...(l.snils ? { snils: l.snils } : {})
      }))
    };

    // 3) Classification
    const classified = classifyRows(request.rows, snapshot);

    // 4) Per-row processing: create / reuse / fail. Собираем learnerIds для enroll.
    const outcomeRowByRowNumber = new Map<number, BulkImportOutcomeRow>();
    const learnerIdToRowNumber = new Map<string, number>();
    const learnerIdToStatus = new Map<string, 'created' | 'reused'>();
    let createdCount = 0;
    let reusedCount = 0;
    let failedCount = 0;

    for (const c of classified) {
      const rowNum = c.row.rowNumber;
      if (c.classification === 'invalid') {
        const first = c.errors[0];
        outcomeRowByRowNumber.set(rowNum, {
          rowNumber: rowNum,
          status: 'failed',
          errorCode: first?.code ?? 'invalid',
          errorMessage: first?.message ?? 'Строка не прошла валидацию'
        });
        failedCount += 1;
        continue;
      }

      if (c.classification === 'reuse') {
        const learnerId = c.reuseLearnerId!;
        const claimedByRow = learnerIdToRowNumber.get(learnerId);
        if (claimedByRow != null) {
          // An earlier row in this batch already resolved to the SAME existing
          // learner (e.g. that row matched by email, this one by СНИЛС). That is a
          // duplicate person within the file. Fail the later row instead of
          // overwriting the first row's enrollment mapping and double-counting
          // `reused` — consistent with classifyRows' duplicate_in_file handling.
          outcomeRowByRowNumber.set(rowNum, {
            rowNumber: rowNum,
            status: 'failed',
            errorCode: 'duplicate_in_file',
            errorMessage: `Та же учётная запись, что и в строке ${claimedByRow}`
          });
          failedCount += 1;
          continue;
        }
        outcomeRowByRowNumber.set(rowNum, {
          rowNumber: rowNum,
          status: 'reused',
          learnerId
        });
        learnerIdToRowNumber.set(learnerId, rowNum);
        learnerIdToStatus.set(learnerId, 'reused');
        reusedCount += 1;
        continue;
      }

      // classification === 'create'
      const parsed = parseFullName(c.row.fullName);
      const created = this.mvpService.createLearnerExtended(
        tenantId,
        actorId,
        {
          firstName: parsed.firstName,
          lastName: parsed.lastName,
          ...(parsed.middleName ? { middleName: parsed.middleName } : {}),
          email: c.row.email.toLowerCase().trim(),
          ...(c.row.snils ? { snils: normalizeSnils(c.row.snils) } : {}),
          ...(c.row.position ? { position: c.row.position.trim() } : {}),
          ...(c.row.dateOfBirth ? { dateOfBirth: c.row.dateOfBirth.trim() } : {})
        },
        context
      );
      outcomeRowByRowNumber.set(rowNum, {
        rowNumber: rowNum,
        status: 'created',
        learnerId: created.id
      });
      learnerIdToRowNumber.set(created.id, rowNum);
      learnerIdToStatus.set(created.id, 'created');
      createdCount += 1;
    }

    // 5) Bulk-enroll (только если есть кого зачислять)
    let enrolledCount = 0;
    if (learnerIdToRowNumber.size > 0) {
      const enrollOutcome = this.mvpService.createBulkEnrollments(
        tenantId,
        actorId,
        {
          idempotencyKey: `${request.idempotencyKey}::bulk-import-enroll`,
          groupId: request.groupId,
          learnerIds: Array.from(learnerIdToRowNumber.keys())
        },
        context
      );

      // Новые зачисления
      for (const enrollment of enrollOutcome.created) {
        const rowNum = learnerIdToRowNumber.get(enrollment.learnerId);
        if (rowNum == null) continue;
        const outcomeRow = outcomeRowByRowNumber.get(rowNum);
        if (outcomeRow) outcomeRow.enrollmentId = enrollment.id;
        enrolledCount += 1;
      }

      // Уже существующие зачисления (pre-existing)
      for (const skipped of enrollOutcome.skippedExisting) {
        const rowNum = learnerIdToRowNumber.get(skipped.learnerId);
        if (rowNum == null) continue;
        const outcomeRow = outcomeRowByRowNumber.get(rowNum);
        if (!outcomeRow) continue;
        outcomeRow.enrollmentId = skipped.enrollmentId;
        // Reuse-строки, у которых уже было зачисление, помечаются 'enrolled_only'
        if (learnerIdToStatus.get(skipped.learnerId) === 'reused') {
          outcomeRow.status = 'enrolled_only';
        }
      }

      // Per-learner ошибки зачисления → строка fail
      for (const err of enrollOutcome.errors) {
        const rowNum = learnerIdToRowNumber.get(err.learnerId);
        if (rowNum == null) continue;
        const outcomeRow = outcomeRowByRowNumber.get(rowNum);
        if (!outcomeRow) continue;
        outcomeRow.status = 'failed';
        outcomeRow.errorCode = err.code;
        outcomeRow.errorMessage = err.message;
        if (learnerIdToStatus.get(err.learnerId) === 'created') createdCount -= 1;
        else reusedCount -= 1;
        failedCount += 1;
      }
    }

    // 6) Сборка outcome в порядке исходных строк
    const rows: BulkImportOutcomeRow[] = request.rows.map(
      (r) =>
        outcomeRowByRowNumber.get(r.rowNumber) ?? {
          rowNumber: r.rowNumber,
          status: 'failed',
          errorCode: 'unknown',
          errorMessage: 'Строка не была обработана'
        }
    );

    const outcome: BulkImportOutcome = {
      idempotencyKey: request.idempotencyKey,
      groupId: request.groupId,
      total: request.rows.length,
      created: createdCount,
      reused: reusedCount,
      enrolled: enrolledCount,
      failed: failedCount,
      rows
    };

    // 7) Persist idempotency
    this.mvpService.saveBulkImportOutcome(tenantId, request.idempotencyKey, outcome);

    return outcome;
  }
}
