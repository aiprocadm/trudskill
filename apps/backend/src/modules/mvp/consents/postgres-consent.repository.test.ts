import { describe, expect, it } from 'vitest';

import { PostgresConsentRepository } from './postgres-consent.repository.js';

import type { DatabaseService } from '../../../infrastructure/database/database.service.js';

/**
 * Маппинг `learning.consent_documents` / `consent_facts` (покрытие 0% → полное).
 * Здесь особенно важен перенос исторических согласий: `document_version = null`
 * обязан остаться отсутствующим полем — приписать версию значило бы сфабриковать
 * доказательство подписи под текстом, которого не существовало.
 */
type Call = { sql: string; params: unknown[] };
function fakeDb(rows: unknown[] = []) {
  const calls: Call[] = [];
  const db = {
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return rows;
    }
  } as unknown as DatabaseService;
  return { db, calls };
}

const docRow = {
  tenant_id: 't1',
  kind: 'photo',
  version: 2,
  body: 'Текст согласия',
  body_hash: 'h2',
  created_at: 'c'
};
const factRow = {
  id: 'cf_1',
  tenant_id: 't1',
  learner_id: 'l1',
  kind: 'photo',
  document_version: null,
  body_hash: null,
  granted_at: '2026-01-01T00:00:00.000Z',
  revoked_at: null,
  ip: null,
  user_agent: null
};

describe('PostgresConsentRepository — маппинг и параметры', () => {
  it('исторический факт: null-версия текста НЕ превращается в поле', async () => {
    const { db } = fakeDb([factRow]);
    const fact = await new PostgresConsentRepository(db).findLatestFact('t1', 'l1', 'photo');

    expect(fact).toMatchObject({ grantedAt: '2026-01-01T00:00:00.000Z' });
    expect(fact).not.toHaveProperty('documentVersion');
    expect(fact).not.toHaveProperty('bodyHash');
    expect(fact).not.toHaveProperty('revokedAt');
  });

  it('документ: версия приводится к числу', async () => {
    const { db } = fakeDb([{ ...docRow, version: '2' }]);
    const doc = await new PostgresConsentRepository(db).findCurrentDocument('t1', 'photo');
    expect(doc!.version).toBe(2);
  });

  it('insertDocument: версия = max+1 одним запросом, старые строки не трогаются', async () => {
    const { db, calls } = fakeDb([docRow]);
    await new PostgresConsentRepository(db).insertDocument('t1', 'photo', 'Текст', 'h');
    expect(calls[0]!.sql).toContain('coalesce((select max(version)');
    expect(calls[0]!.sql).not.toMatch(/update/i);
  });

  it('insertFact: пустой grantedAt = «сейчас» через coalesce, заданный — сохраняется', async () => {
    const { db, calls } = fakeDb([factRow]);
    const repo = new PostgresConsentRepository(db);
    await repo.insertFact({ tenantId: 't1', learnerId: 'l1', kind: 'photo' });
    await repo.insertFact({
      tenantId: 't1',
      learnerId: 'l1',
      kind: 'photo',
      grantedAt: '2026-01-01T00:00:00.000Z'
    });

    expect(calls[0]!.sql).toContain('coalesce($7::timestamptz, now())');
    expect(calls[0]!.params[6]).toBeNull();
    expect(calls[1]!.params[6]).toBe('2026-01-01T00:00:00.000Z');
  });

  it('revokeLatestFact: отзыв ставит метку, строка не удаляется', async () => {
    const { db, calls } = fakeDb([{ ...factRow, revoked_at: '2026-02-01T00:00:00.000Z' }]);
    const fact = await new PostgresConsentRepository(db).revokeLatestFact(
      't1',
      'l1',
      'photo',
      '2026-02-01T00:00:00.000Z'
    );

    expect(calls[0]!.sql).toContain('revoked_at is null');
    expect(calls[0]!.sql).not.toMatch(/delete/i);
    expect(fact!.revokedAt).toBe('2026-02-01T00:00:00.000Z');
  });

  it('отзывать нечего — null, а не исключение', async () => {
    const { db } = fakeDb([]);
    await expect(
      new PostgresConsentRepository(db).revokeLatestFact('t1', 'l1', 'photo', 'x')
    ).resolves.toBeNull();
  });
});
