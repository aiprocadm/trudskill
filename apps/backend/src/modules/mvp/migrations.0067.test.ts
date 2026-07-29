import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(__dirname, '../../../migrations/0067_learning_simple_signature.sql'),
  'utf8'
);

/** ПЭП: соглашение и факт принятия (ФТ-C1.1, Фаза 3 Task 3). */
describe('migration 0067', () => {
  it('хранит текст соглашения с версией и хэшем', () => {
    expect(sql).toContain('learning.esignature_agreements');
    expect(sql).toContain('body_hash');
    expect(sql).toContain('PRIMARY KEY (tenant_id, version)');
  });

  it('фиксирует принятие с хэшем текста, IP и user-agent', () => {
    expect(sql).toContain('learning.esignature_acceptances');
    for (const column of ['body_hash', 'ip', 'user_agent', 'accepted_at']) {
      expect(sql).toContain(column);
    }
  });

  it('повторное принятие той же версии не создаёт второе доказательство', () => {
    expect(sql).toContain(
      'esignature_acceptances_unique UNIQUE (tenant_id, user_id, agreement_version)'
    );
  });

  it('право правки текста — только администрации центра', () => {
    expect(sql).toContain('esignature.configure');
    const grant = /p\.code = 'esignature\.configure'[\s\S]*?r\.code IN \(([^)]*)\)/.exec(sql);
    expect(grant).not.toBeNull();
    expect(grant![1]).not.toContain('methodist');
    expect(grant![1]).not.toContain('learner');
  });

  it('аддитивна и обёрнута в транзакцию', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS');
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN)/i);
    expect(sql).toContain('BEGIN;');
    expect(sql).toContain('COMMIT;');
  });
});
