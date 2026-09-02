import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const SQL = readFileSync(
  join(__dirname, '../../../migrations/0089_communication_webinar_attendance_check.sql'),
  'utf-8'
);

/** Статусы пишутся из нескольких мест модуля, а не только из сервиса. */
const WRITERS = ['webinars.service.ts', 'webinars.controller.ts', 'in-memory-webinars.state.ts']
  .map((file) => readFileSync(join(__dirname, file), 'utf-8'))
  .join('\n');

/**
 * Журнал 330: ограничение стояло на мёртвом близнеце таблицы.
 *
 * `comm.webinar_attendees.attendance_status` защищён с 0014, но схема `comm` не используется
 * вовсе — девять таблиц, ноль строк, ноль обращений из кода. Пишется
 * `communication.webinar_participants`, у которой ограничения не было никогда: читатель
 * миграций видел CHECK и считал данные защищёнными, а живая колонка принимала любую строку.
 */
describe('миграция 0089 — CHECK на ЖИВОЙ колонке посещаемости вебинара', () => {
  it('ограничение ставится на таблицу, в которую пишет код', () => {
    // Проверяем САМО распоряжение, а не файл целиком: мёртвого близнеца комментарий
    // называет законно — он объясняет, почему ограничение понадобилось.
    const statement = SQL.slice(SQL.indexOf('ALTER TABLE'));
    expect(statement).toContain('communication.webinar_participants');
    expect(statement).not.toContain('comm.webinar_attendees');
  });

  it('набор значений взят из кода, а не из мёртвого близнеца', () => {
    for (const value of ['invited', 'joined', 'left']) {
      expect(SQL).toContain(`'${value}'`);
    }
    // Словарь близнеца продуктом не используется — попади он сюда, ограничение снова
    // защищало бы не то, что происходит.
    for (const stale of ['registered', 'attended', 'missed', 'cancelled']) {
      expect(SQL).not.toContain(`'${stale}'`);
    }
  });

  it('в коде не появилось значения, которого ограничение не пропустит', () => {
    // Сверяем с источником: если сервис начнёт писать новый статус, тест назовёт его здесь,
    // а не пользователь — ошибкой сервера при подключении к вебинару.
    const written = new Set(
      [...WRITERS.matchAll(/attendanceStatus[:|]\s*'([a-z]+)'/g)].map((m) => m[1] as string)
    );
    const allowed = new Set(
      [...SQL.matchAll(/'([a-z]+)'/g)].map((m) => m[1] as string).filter((v) => v.length > 2)
    );

    expect([...written].filter((value) => !allowed.has(value))).toEqual([]);
    expect(written.size).toBeGreaterThan(1);
  });

  it('ограничение добавляется идемпотентно и НЕ валидирует старые строки', () => {
    // `not valid` — по образцу 0014: в накопленных строках может лежать что угодно, и
    // валидация под нагрузкой делается отдельным шагом, а не при выкатке.
    expect(SQL).toContain('NOT VALID');
    expect(SQL).toContain('IF NOT EXISTS');
  });
});
