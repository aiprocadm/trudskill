import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const SQL = readFileSync(
  join(__dirname, '../../../migrations/0090_documents_runtime_json_lookup_indexes.sql'),
  'utf-8'
);

const PERSISTENCE = readFileSync(
  join(__dirname, 'infrastructure/postgres-documents-persistence.backend.ts'),
  'utf-8'
);

/**
 * Журнал 331: фильтр по JSON-полю без индекса — полный перебор таблицы.
 *
 * Публичная проверка документа по QR ищет БЕЗ арендатора, а все индексы снимков начинаются
 * с `tenant_id` — не подходил ни один. Готовность считает очередь задач по `data->>'status'`
 * на каждом опросе живости.
 */
describe('миграция 0090 — индексы под запросы к снимкам документов', () => {
  it('индекс заведён ровно на то поле, по которому ищет публичная проверка', () => {
    // Сверяем с ИСХОДНИКОМ: переименуют поле в запросе — тест назовёт это раньше,
    // чем полный перебор вернётся незаметно.
    expect(PERSISTENCE).toMatch(/data->>'qrToken'/);
    expect(SQL).toMatch(/data\s*->>\s*'qrToken'/);
  });

  it('индексы заведены на ОБЕ таблицы-снимка', () => {
    // Читаемая выбирается переменной DOCUMENTS_READ_MODEL: правка настройки не должна
    // возвращать полный перебор.
    for (const table of ['documents.runtime_documents', 'documents.stage1_runtime_documents']) {
      expect(SQL).toContain(table);
    }
    expect((SQL.match(/CREATE INDEX/g) ?? []).length).toBe(4);
  });

  it('индексы ЧАСТИЧНЫЕ — по коллекции, иначе они разрастаются на весь снимок', () => {
    expect(SQL).toContain("WHERE collection = 'generatedDocuments'");
    expect(SQL).toContain("WHERE collection = 'tasks'");
  });

  it('идемпотентно: повторный прогон миграций не падает', () => {
    expect((SQL.match(/IF NOT EXISTS/g) ?? []).length).toBe(4);
  });

  it('объяснено, почему нет индекса по startedAt', () => {
    // Приведение текста к timestamptz не immutable — Postgres такое выражение не
    // индексирует. Молчаливое отсутствие индекса выглядело бы как недосмотр.
    expect(SQL).toContain('startedAt');
    expect(SQL).toMatch(/immutable/i);
  });
});
