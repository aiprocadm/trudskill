import { describe, expect, it } from 'vitest';

import { UserDisplayNamesService } from './user-display-names.service.js';

import type { DatabaseService } from '../../infrastructure/database/database.service.js';

/**
 * §5.432: имя учётной записи подставляет СЕРВЕР.
 *
 * Показывать сырой идентификатор человеку нельзя (правило продукта №2), а подставлять имя на
 * стороне экрана — значит врать на удалённых и на неизвестных записях (этим уже обожглись в
 * журнале действий). Там, где данные лежат в снимке состояния центра, соединения нет — и имя
 * спрашивается отдельным запросом.
 */
const fakeDb = (rows: Array<{ id: string; display_name: string | null }>) => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return rows;
    }
  } as unknown as DatabaseService;
  return { db, calls };
};

describe('имена учётных записей для показа человеку', () => {
  it('спрашивает разом всю страницу, а не по строке', async () => {
    const { db, calls } = fakeDb([
      { id: 'u1', display_name: 'Иванов И.' },
      { id: 'u2', display_name: 'Петров П.' }
    ]);
    const service = new UserDisplayNamesService(db);

    const names = await service.namesOf('t1', ['u1', 'u2', 'u1', null, undefined, '  ']);

    // Один запрос на страницу: повторы и пустые значения отсеиваются до обращения к базе.
    expect(calls).toHaveLength(1);
    expect(calls[0]!.params[1]).toEqual(['u1', 'u2']);
    expect(names.get('u1')).toBe('Иванов И.');
    expect(names.get('u2')).toBe('Петров П.');
  });

  it('спрашивает только свой центр', async () => {
    // Иначе имя сотрудника одного центра утекло бы на экран другого.
    const { db, calls } = fakeDb([]);
    await new UserDisplayNamesService(db).namesOf('t1', ['u1']);

    expect(calls[0]!.sql).toContain('tenant_id = $1');
    expect(calls[0]!.params[0]).toBe('t1');
  });

  it('неизвестная учётная запись имени не даёт — вместо правдоподобной неправды', async () => {
    const { db } = fakeDb([{ id: 'u1', display_name: null }]);
    const service = new UserDisplayNamesService(db);

    expect(await service.nameOf('t1', 'u1')).toBeNull();
    expect(await service.nameOf('t1', 'u_gone')).toBeNull();
    expect(await service.nameOf('t1', null)).toBeNull();
  });

  it('без базы не падает и не выдумывает имён', async () => {
    // В памяти (тесты, демо) справочника нет — это не повод ронять экран.
    const service = new UserDisplayNamesService();

    expect(await service.namesOf('t1', ['u1'])).toEqual(new Map());
  });

  it('пустой список не идёт в базу вовсе', async () => {
    const { db, calls } = fakeDb([]);
    await new UserDisplayNamesService(db).namesOf('t1', []);

    expect(calls).toHaveLength(0);
  });
});
