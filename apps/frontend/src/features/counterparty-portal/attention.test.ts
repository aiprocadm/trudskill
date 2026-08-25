import { describe, expect, it } from 'vitest';

import { documentExpiries, expirySummary, needsAttention } from './attention';

import type { PortalDocument } from '../mvp/types';

/**
 * Сроки удостоверений для заказчика (ФТ-H2).
 *
 * Считается чистой функцией с явным «сегодня»: иначе тест зависел бы от календаря машины
 * и начал бы падать сам собой через месяц — ровно та беда, из-за которой в этом проекте
 * уже ловили времязависимые проверки.
 */

const NOW = new Date('2026-08-25T12:00:00.000Z');

const doc = (id: string, validUntil?: string): PortalDocument =>
  ({
    id,
    tenantId: 't',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    documentType: 'certificate',
    name: 'Удостоверение',
    learnerName: 'Иванов Иван',
    ...(validUntil ? { validUntil } : {})
  }) as PortalDocument;

describe('сроки удостоверений сотрудников заказчика', () => {
  it('документы без срока в очередь не попадают', () => {
    // Бессрочная справка сроком не истекает: показывать её значит зашумлять список тем,
    // с чем ничего делать не надо.
    expect(documentExpiries([doc('d1'), doc('d2', '2026-12-31T00:00:00.000Z')], NOW)).toHaveLength(
      1
    );
  });

  it('просроченный, горящий и спокойный различаются', () => {
    const rows = documentExpiries(
      [
        doc('expired', '2026-08-01T00:00:00.000Z'),
        doc('critical', '2026-08-29T00:00:00.000Z'),
        doc('soon', '2026-09-30T00:00:00.000Z'),
        doc('ok', '2027-06-01T00:00:00.000Z')
      ],
      NOW
    );

    expect(rows.map((row) => row.urgency)).toEqual(['expired', 'critical', 'soon', 'ok']);
  });

  it('очередь отсортирована по срочности, а не по типу документа', () => {
    // Человеку нужен порядок действий, а не оглавление.
    const rows = documentExpiries(
      [
        doc('later', '2026-10-01T00:00:00.000Z'),
        doc('overdue', '2026-07-01T00:00:00.000Z'),
        doc('week', '2026-08-28T00:00:00.000Z')
      ],
      NOW
    );

    expect(rows.map((row) => row.document.id)).toEqual(['overdue', 'week', 'later']);
  });

  it('в очередь внимания попадает только то, с чем надо что-то делать', () => {
    const rows = documentExpiries(
      [doc('ok', '2027-06-01T00:00:00.000Z'), doc('soon', '2026-09-20T00:00:00.000Z')],
      NOW
    );

    expect(needsAttention(rows).map((row) => row.document.id)).toEqual(['soon']);
  });

  it('сводка считает каждое состояние отдельно', () => {
    const rows = documentExpiries(
      [
        doc('a', '2026-07-01T00:00:00.000Z'),
        doc('b', '2026-08-27T00:00:00.000Z'),
        doc('c', '2026-09-15T00:00:00.000Z'),
        doc('d', '2027-01-01T00:00:00.000Z')
      ],
      NOW
    );

    expect(expirySummary(rows)).toEqual({ expired: 1, critical: 1, soon: 1 });
  });

  it('граница недели считается по дням, а не «примерно»', () => {
    // Ровно семь дней — ещё «на этой неделе»; восемь — уже «в течение месяца».
    const rows = documentExpiries(
      [doc('seven', '2026-09-01T12:00:00.000Z'), doc('eight', '2026-09-02T12:00:00.000Z')],
      NOW
    );

    expect(rows.map((row) => row.urgency)).toEqual(['critical', 'soon']);
  });
});
