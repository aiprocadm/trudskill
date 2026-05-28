/**
 * Phase 2 Plan A Task 11 — E2E smoke для admin bulk-import.
 *
 * Контур по конвенциям проекта (см. canonical-e2e-readiness.e2e.test.ts):
 *  - Routing/permission через evaluateRouteAccess + getVisibleNavigation.
 *  - Pipeline-integration parse → classify через сгенерированный in-memory xlsx.
 *  - Smoke-import экранов, чтобы поймать сломанные импорты/синтаксис.
 *
 * Реальный React mount нет (RTL не в зависимостях). Backend business-flow
 * покрыт LearnersBulkImportService unit-тестами + HTTP integration в PR #193.
 */

import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';

import { parseExcelBuffer } from '../features/bulk-enrollments/excel-parser';
import { classifyParsedRows } from '../features/bulk-enrollments/validators';
import { evaluateRouteAccess, getVisibleNavigation } from '../features/navigation/helpers';

import type { UserSession } from '../entities/session/model';

const adminWithBoth: UserSession = {
  user: {
    id: 'u_admin',
    tenantId: 'tenant_demo',
    login: 'admin',
    email: null,
    status: 'active',
    displayName: 'Admin'
  },
  tokens: { accessToken: 'a', sessionId: 's1', expiresIn: 1000 },
  roles: ['tenant_admin'],
  permissions: ['learners.write', 'enrollments.write']
};

const adminOnlyLearners: UserSession = {
  ...adminWithBoth,
  permissions: ['learners.write']
};

function makeXlsx(aoa: unknown[][]): ArrayBuffer {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

describe('admin bulk-enrollment E2E smoke', () => {
  it('routes: /admin/bulk-enrollments accessible only with both permissions', () => {
    expect(evaluateRouteAccess('/admin/bulk-enrollments', adminWithBoth)).toEqual({ kind: 'ok' });
    expect(evaluateRouteAccess('/admin/bulk-enrollments', adminOnlyLearners)).toEqual({
      kind: 'forbidden'
    });
    expect(evaluateRouteAccess('/admin/bulk-enrollments', null)).toEqual({
      kind: 'redirect-login'
    });
  });

  it('nav: «Массовая загрузка» visible only with both permissions', () => {
    expect(getVisibleNavigation(adminWithBoth).map((i) => i.href)).toContain(
      '/admin/bulk-enrollments'
    );
    expect(getVisibleNavigation(adminOnlyLearners).map((i) => i.href)).not.toContain(
      '/admin/bulk-enrollments'
    );
  });

  it('pipeline: parse + classify for a happy 3-row file → 3 valid', () => {
    const buf = makeXlsx([
      ['ФИО', 'Email', 'СНИЛС', 'Должность'],
      ['Иванов Иван Иванович', 'a@x.ru', '111-111-111 45', 'Слесарь'],
      ['Петрова Анна Сергеевна', 'b@x.ru', '11234567828', 'Инженер'],
      ['Сидоров Пётр Михайлович', 'c@x.ru', '', '']
    ]);
    const parsed = parseExcelBuffer(buf);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(3);

    const classified = classifyParsedRows(parsed.rows);
    expect(classified.every((r) => r.classification === 'valid')).toBe(true);
  });

  it('pipeline: parse + classify for a mixed file → partial-success counts match', () => {
    const buf = makeXlsx([
      ['ФИО', 'Email', 'СНИЛС'],
      ['Иванов Иван', 'a@x.ru', '111-111-111 45'], // valid
      ['Bad Name', 'b@x.ru', ''], // invalid: латиница в ФИО
      ['Петров Пётр', 'not-email', ''], // invalid: bad email
      ['Сидоров Иван', 'd@x.ru', '111-111-111 99'], // invalid: bad SNILS checksum
      ['Кузнецов Алексей', 'e@x.ru', ''] // valid
    ]);
    const parsed = parseExcelBuffer(buf);
    expect(parsed.rows).toHaveLength(5);

    const classified = classifyParsedRows(parsed.rows);
    const valid = classified.filter((r) => r.classification === 'valid').length;
    const invalid = classified.filter((r) => r.classification === 'invalid').length;
    expect(valid).toBe(2);
    expect(invalid).toBe(3);
  });

  it('pipeline: in-file duplicates flagged on both occurrences', () => {
    const buf = makeXlsx([
      ['ФИО', 'Email'],
      ['Иванов Иван', 'same@x.ru'],
      ['Петров Пётр', 'same@x.ru']
    ]);
    const parsed = parseExcelBuffer(buf);
    const classified = classifyParsedRows(parsed.rows);
    expect(classified.every((r) => r.classification === 'invalid')).toBe(true);
    expect(classified.every((r) => r.errors.some((e) => e.code === 'duplicate_in_file'))).toBe(
      true
    );
  });

  it('smoke: BulkImportScreen module loads (no broken imports)', async () => {
    const mod = await import('../features/bulk-enrollments/bulk-import-screen');
    expect(typeof mod.BulkImportScreen).toBe('function');
  });

  it('smoke: PreviewTable module loads', async () => {
    const mod = await import('../features/bulk-enrollments/preview-table');
    expect(typeof mod.PreviewTable).toBe('function');
  });

  it('smoke: useBulkImportMutation hook module loads', async () => {
    const mod = await import('../features/bulk-enrollments/hooks');
    expect(typeof mod.useBulkImportMutation).toBe('function');
  });
});
