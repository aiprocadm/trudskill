import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const m0118 = readFileSync(
  resolve(HERE, '../../../migrations', '0118_generated_documents_number_per_kind_live.sql'),
  'utf8'
);

/**
 * РМ127 (срез 21.4): номер уникален среди ДЕЙСТВУЮЩИХ документов вида — аннулированный при
 * перевыпуске оригинал номер не держит. Новый индекс — раньше, чем снимается прежний.
 */
describe('миграция 0118: номер уникален среди действующих документов вида', () => {
  const createAt = m0118.search(
    /create unique index if not exists generated_documents_tenant_kind_number_live_uniq/i
  );
  const dropAt = m0118.search(
    /drop index if exists documents\.generated_documents_tenant_kind_number_uniq/i
  );

  it('индекс по центру, виду и номеру — без аннулированных', () => {
    expect(createAt).toBeGreaterThanOrEqual(0);
    expect(m0118).toMatch(
      /\(tenant_id, coalesce\(kind_code, ''\), document_number\)\s+where document_number is not null and status <> 'revoked'/i
    );
  });

  it('прежний индекс 0117 снимается после создания нового; данные не трогаются', () => {
    expect(dropAt).toBeGreaterThan(createAt);
    const code = m0118
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    expect(code).not.toMatch(/\b(update|delete|truncate)\b/i);
  });
});
