import { describe, expect, it } from 'vitest';

import { DatabaseService } from './database.service.js';

/**
 * Готовность не должна выдавать «доставка здорова» за механизм, которым не пользуются
 * (журнал 329).
 *
 * `core.outbox_events` построен целиком — таблица, рассыльщик, метрика — но **не пишет в
 * него никто**, и это записанное решение (журнал 273: подключать ради одного случая значило
 * бы переносить весь выпуск в очередь). Беда в другом: готовность рапортовала «очередь 0,
 * здорово» — то есть зелёный сигнал о доставке, которой нет. Эксплуатант читает это как
 * «события доставляются исправно».
 *
 * Отличаем по данным, а не по догадке: если в таблице НЕТ НИ ОДНОЙ строки, механизм ни разу
 * не использовался. Появится первая запись — признак исчезнет сам, без правки кода.
 */
const serviceWith = (rows: Record<string, number>[]): DatabaseService => {
  const service = Object.create(DatabaseService.prototype) as DatabaseService;
  // Подменяем только `query`: остальная служба нам не нужна, а поднимать пул ради трёх
  // проверок дороже, чем сама проверка.
  (service as unknown as { query: (sql: string) => Promise<unknown[]> }).query = async (
    sql: string
  ) =>
    /count\(\*\)::int as total/.test(sql) ? [rows[1] ?? { total: 0 }] : [rows[0] ?? { backlog: 0 }];
  return service;
};

describe('готовность исходящего журнала событий', () => {
  it('пустая таблица без единой строки — механизм НЕ ИСПОЛЬЗУЕТСЯ, а не «здоров»', async () => {
    const result = await serviceWith([{ backlog: 0 }, { total: 0 }]).getOutboxReadiness(100);

    expect(result.unused).toBe(true);
    expect(result.backlog).toBe(0);
  });

  it('есть строки и очередь в пределах порога — обычное здоровое состояние', async () => {
    const result = await serviceWith([{ backlog: 3 }, { total: 42 }]).getOutboxReadiness(100);

    expect(result.unused).toBe(false);
    expect(result.healthy).toBe(true);
  });

  it('очередь выше порога — нездорово, и признак «не используется» тут ни при чём', async () => {
    const result = await serviceWith([{ backlog: 500 }, { total: 500 }]).getOutboxReadiness(100);

    expect(result.healthy).toBe(false);
    expect(result.unused).toBe(false);
  });
});
