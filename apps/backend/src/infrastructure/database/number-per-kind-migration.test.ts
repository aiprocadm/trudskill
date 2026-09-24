import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const m0117 = readFileSync(
  resolve(HERE, '../../../migrations', '0117_generated_documents_number_per_kind.sql'),
  'utf8'
);

/**
 * МГ-F3.1 (ТЗ перехода с CDOPROF, Фаза 3, срез 19.1, РМ125): номер выпущенного документа
 * уникален в пределах вида. Текстовый сторож миграции: новый индекс ставится РАНЬШЕ, чем
 * снимается прежний, — между двумя операциями таблица не остаётся без защиты от дубля.
 */
describe('миграция 0117: номер документа уникален в пределах вида', () => {
  const createAt = m0117.search(
    /create unique index if not exists generated_documents_tenant_kind_number_uniq/i
  );
  const dropAt = m0117.search(
    /drop index if exists documents\.generated_documents_tenant_number_uniq/i
  );

  it('индекс по центру, виду и номеру — частичный, пустой вид сводится к пустой строке', () => {
    expect(createAt).toBeGreaterThanOrEqual(0);
    expect(m0117).toMatch(
      /\(tenant_id, coalesce\(kind_code, ''\), document_number\)\s+where document_number is not null/i
    );
  });

  it('прежний индекс «номер на весь центр» снимается после создания нового', () => {
    expect(dropAt).toBeGreaterThan(createAt);
  });

  it('данные не трогаются: ни update, ни delete', () => {
    const code = m0117
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    expect(code).not.toMatch(/\b(update|delete|truncate)\b/i);
  });
});
