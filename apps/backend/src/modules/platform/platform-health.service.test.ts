import 'reflect-metadata';
import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { PlatformHealthService } from './platform-health.service.js';

const tenantRow = (overrides: Record<string, unknown> = {}) => ({
  tenantId: 't1',
  code: 'demo',
  name: 'Демо',
  status: 'active',
  documentTasksQueued: 3,
  documentTasksFailed: 1,
  syncJobsPending: 0,
  syncJobsFailed: 2,
  deadLetters: 5,
  exportsFailed: 0,
  lastExportAt: '2026-08-01T10:00:00.000Z',
  lastActivityAt: '2026-08-04T12:00:00.000Z',
  ...overrides
});

function make(queryImpl?: (sql: string) => Promise<unknown[]>) {
  const query = vi.fn(
    queryImpl ??
      (async (sql: string) =>
        sql.includes('outbox_events') ? [{ pending: 7, failed: 1 }] : [tenantRow()])
  );
  return { service: new PlatformHealthService({ query } as never), query };
}

describe('PlatformHealthService (ФТ-D7)', () => {
  it('собирает состояние всех арендаторов и общую очередь платформы', async () => {
    const { service } = make();
    const report = await service.getReport();
    expect(report.tenants).toHaveLength(1);
    expect(report.tenants[0]).toMatchObject({
      code: 'demo',
      documentTasksQueued: 3,
      deadLetters: 5,
      syncJobsFailed: 2
    });
    expect(report.platformOutbox).toEqual({ pending: 7, failed: 1 });
    expect(report.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('весь экран — ДВА запроса, а не обход тенантов по одному (N+1)', async () => {
    const { service, query } = make();
    await service.getReport();
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('архивные арендаторы в списке здоровья не показываются', async () => {
    const { service, query } = make();
    await service.getReport();
    const tenantsSql = query.mock.calls[0]![0] as string;
    expect(tenantsSql).toContain("t.status <> 'archived'");
  });

  it('отдаются ТОЛЬКО агрегаты — никакого содержимого задач и документов', async () => {
    const { service } = make();
    const report = await service.getReport();
    const keys = Object.keys(report.tenants[0]!);
    // Разрешено: идентификаторы центра, счётчики и отметки времени.
    for (const key of keys) {
      expect(
        /^(tenantId|code|name|status)$/.test(key) ||
          /(Queued|Failed|Pending|Letters|deadLetters|exportsFailed)$/.test(key) ||
          /At$/.test(key)
      ).toBe(true);
    }
    // Явный запрет на поля с содержимым.
    for (const forbidden of ['payload', 'error', 'message', 'learnerName', 'documentNumber']) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it('запрос не тянет содержательных колонок из источников', async () => {
    const { service, query } = make();
    await service.getReport();
    const sql = (query.mock.calls[0]![0] as string).toLowerCase();
    for (const forbidden of ['payload', 'last_error', 'error_message', 'body']) {
      expect(sql).not.toContain(forbidden);
    }
    // Считаем только count/max — агрегаты.
    expect(sql).toContain('count(*)');
    expect(sql).toContain('max(');
  });

  it('очередь платформы отделена: у outbox_events нет привязки к арендатору', async () => {
    const { service, query } = make();
    await service.getReport();
    const outboxSql = query.mock.calls[1]![0] as string;
    expect(outboxSql).toContain('core.outbox_events');
    expect(outboxSql).not.toContain('tenant_id');
  });

  it('без базы — честная 503, а не пустой отчёт', async () => {
    const service = new PlatformHealthService(undefined);
    await expect(service.getReport()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('нули и отсутствие активности не ломают отчёт', async () => {
    const { service } = make(async (sql) =>
      sql.includes('outbox_events')
        ? [{ pending: 0, failed: 0 }]
        : [tenantRow({ lastExportAt: null, lastActivityAt: null, deadLetters: 0 })]
    );
    const report = await service.getReport();
    expect(report.tenants[0]!.lastActivityAt).toBeNull();
    expect(report.tenants[0]!.deadLetters).toBe(0);
  });
});
