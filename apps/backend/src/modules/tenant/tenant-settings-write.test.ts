import { describe, expect, it, vi } from 'vitest';

import { TenantService } from './tenant.service.js';

import type { DatabaseService } from '../../infrastructure/database/database.service.js';

/**
 * Сохранение карточки учебного центра — настроек и реквизитов.
 *
 * Почему этот файл появился. Обе ручки записи (`PUT /tenant/settings`, `PUT /tenant/requisites`)
 * падали с ошибкой сервера при ПЕРВОМ сохранении: во вставку не передавался `id`, а колонка
 * объявлена `not null` без значения по умолчанию. То есть центр не мог задать ни часовой пояс,
 * ни юридическое название с ИНН — экран «Реквизиты» не работал вообще, а сообщение об ошибке
 * человеку ничего не объясняло.
 *
 * Обиднее всего, что рядом, в том же файле, ветка брендирования `id` заполняет правильно —
 * `concat('tenant_settings_', $1::text)`. Лечение было в трёх строках ниже по коду.
 *
 * Реквизиты — не «просто карточка»: из них берутся юридическое название, ИНН и ссылки на
 * подпись руководителя с печатью, которые попадают в выдаваемые удостоверения.
 */

const repo = { enforceTenantScope: () => undefined } as never;

/**
 * БД-заглушка, запоминающая выполненные запросы.
 *
 * На чтение отдаёт существующую строку — как в живой базе, где карточка центра заводится
 * при его создании. Это важно: сохранение начинается с чтения текущего значения, и без
 * строки проверка не дошла бы до самой вставки, ради которой всё и написано.
 */
const makeDb = () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (!sql.trimStart().toLowerCase().startsWith('select')) return [];
    if (sql.includes('tenant_requisites')) {
      return [{ tenant_id: 'tenant_demo', legal_name: 'Прежнее', tax_number: '0', payload: {} }];
    }
    if (sql.includes('tenant_settings')) {
      return [
        { tenant_id: 'tenant_demo', payload: { locale: 'ru-RU', timezone: 'Europe/Moscow' } }
      ];
    }
    return [];
  });
  return { db: { query } as unknown as DatabaseService, calls };
};

const sqlFor = (calls: Array<{ sql: string }>, fragment: string) =>
  calls.find((c) => c.sql.includes(fragment))?.sql ?? '';

describe('сохранение карточки учебного центра', () => {
  /*
   * Ключевая проверка. `id` обязан попадать во вставку: без него запись невозможна,
   * и первое сохранение всегда даёт ошибку сервера.
   */
  it('настройки: первая запись заполняет идентификатор', async () => {
    const { db, calls } = makeDb();
    const service = new TenantService(repo, db);

    await service.updateSettings('tenant_demo', { timezone: 'Europe/Moscow' });

    const insert = sqlFor(calls, 'insert into org.tenant_settings');
    expect(insert, 'вставка настроек не выполнялась').not.toBe('');
    expect(
      insert.includes('(id,') || insert.includes('(id ,'),
      'во вставку настроек не передан id — первое сохранение упадёт на not-null'
    ).toBe(true);
  });

  it('реквизиты: первая запись заполняет идентификатор', async () => {
    const { db, calls } = makeDb();
    const service = new TenantService(repo, db);

    await service.updateRequisites('tenant_demo', {
      legalName: 'АНО ДПО «Пример»',
      taxNumber: '7701234567'
    });

    const insert = sqlFor(calls, 'insert into org.tenant_requisites');
    expect(insert, 'вставка реквизитов не выполнялась').not.toBe('');
    expect(
      insert.includes('(id,') || insert.includes('(id ,'),
      'во вставку реквизитов не передан id — первое сохранение упадёт на not-null'
    ).toBe(true);
  });

  /*
   * Повторное сохранение обязано ОБНОВЛЯТЬ ту же строку, а не заводить вторую: у центра
   * одна карточка. Идентификатор поэтому выводится из арендатора, а не случайный.
   */
  it('повторное сохранение обновляет ту же строку, а не плодит вторую', async () => {
    const { db, calls } = makeDb();
    const service = new TenantService(repo, db);

    await service.updateRequisites('tenant_demo', { legalName: 'А', taxNumber: '1' });
    await service.updateRequisites('tenant_demo', { legalName: 'Б', taxNumber: '2' });

    const inserts = calls.filter((c) => c.sql.includes('insert into org.tenant_requisites'));
    expect(inserts).toHaveLength(2);
    for (const call of inserts) {
      expect(call.sql).toContain('on conflict (tenant_id)');
      expect(call.sql).toContain('do update');
    }
  });

  it('обновление помечает время правки — иначе непонятно, когда карточку меняли', async () => {
    const { db, calls } = makeDb();
    const service = new TenantService(repo, db);

    await service.updateRequisites('tenant_demo', { legalName: 'А', taxNumber: '1' });
    expect(sqlFor(calls, 'insert into org.tenant_requisites')).toContain('updated_at = now()');
  });
});
