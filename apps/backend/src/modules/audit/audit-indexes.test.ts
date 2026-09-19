import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { SERVICE_ACTIONS } from './audit.service.js';

/**
 * Запросы к журналу действий опираются на индексы (ТЗ «Стабилизация, UX и развитие», 15.4).
 *
 * **Почему именно журнал.** Это самая большая таблица в системе: в неё пишется каждое действие
 * каждого человека. ТЗ называет её первым кандидатом на проблему с объёмом, и причина понятна:
 * продление сеанса пишется у каждого работающего человека каждые несколько минут. Чем дольше
 * живёт центр, тем больше доля служебных записей — и тем больше строк база читает и выбрасывает,
 * чтобы набрать одну страницу полезных (журнал 589).
 *
 * **Что это за класс дефекта.** Запрос не «медленный» — он медленнее с каждым месяцем. Такое не
 * ловится ни на разработке, ни на стенде: там журнал пуст. Оно проявляется у центра, который
 * проработал год, и выглядит как «система стала тормозить», без единой подсказки, где искать.
 *
 * **Главная опасность этого исправления.** Список служебных действий повторён в индексе — иначе
 * частичный индекс не построить. Если списки разойдутся, выдача останется ВЕРНОЙ, а индекс
 * просто перестанет применяться: всё станет медленным молча. Ровно это здесь и стережётся.
 */

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(here, '..', '..', '..', 'migrations');

const allMigrations = readdirSync(migrationsDir)
  .filter((name) => name.endsWith('.sql'))
  .map((name) => readFileSync(resolve(migrationsDir, name), 'utf8'))
  .join('\n');

describe('частый запрос к журналу покрыт индексом (ТЗ 15.4)', () => {
  it('есть индекс под «журнал без служебных, свежие сверху»', () => {
    expect(allMigrations).toMatch(/audit_log_tenant_visible_created_idx/);
  });

  it('индекс частичный — служебные записи в него не попадают', () => {
    /*
     * В этом и смысл: индекс получается меньше таблицы во столько раз, во сколько служебных
     * записей больше полезных, и сортировка по нему уже готова.
     */
    const index = allMigrations.slice(
      allMigrations.indexOf('audit_log_tenant_visible_created_idx')
    );
    expect(index.slice(0, 400)).toMatch(/WHERE action <> /i);
  });

  it('порядок в индексе совпадает с порядком в запросе', () => {
    /*
     * Запрос сортирует по убыванию времени, затем по убыванию идентификатора. Индекс,
     * построенный по возрастанию, для такой сортировки годится хуже — база вынуждена
     * досортировывать.
     */
    const index = allMigrations.slice(
      allMigrations.indexOf('audit_log_tenant_visible_created_idx')
    );
    expect(index.slice(0, 400)).toMatch(/created_at DESC, id DESC/i);
  });
});

describe('журнал входов покрыт индексом (ТЗ 15.4 и 17.1)', () => {
  it('есть индекс по паре «человек + действие»', () => {
    /*
     * Имеющийся индекс знает только про человека: чтобы найти четыре вида входа, база читает
     * ВСЕ действия этого человека за всё время. У администратора, работающего год, это десятки
     * тысяч строк ради двадцати на экране профиля.
     */
    expect(allMigrations).toMatch(/audit_log_tenant_actor_action_created_idx/);
    const index = allMigrations.slice(
      allMigrations.indexOf('audit_log_tenant_actor_action_created_idx')
    );
    expect(index.slice(0, 300)).toMatch(/tenant_id, actor_id, action, created_at DESC/i);
  });
});

describe('два списка служебных действий не разошлись (ТЗ 15.4)', () => {
  /*
   * Список повторён в индексе — иначе частичный индекс не построить. Расхождение не сломает
   * выдачу: запрос останется верным, а индекс просто перестанет применяться. Всё станет
   * медленным МОЛЧА, и виноватого будут искать в другом месте.
   */
  it('каждое служебное действие из кода названо в индексе', () => {
    const index = allMigrations.slice(
      allMigrations.indexOf('audit_log_tenant_visible_created_idx'),
      allMigrations.indexOf('audit_log_tenant_visible_created_idx') + 400
    );
    for (const action of SERVICE_ACTIONS) {
      expect(index, `действие «${action}» есть в коде, но не исключено в индексе`).toContain(
        `'${action}'`
      );
    }
  });

  it('в индексе не исключено лишнего', () => {
    /*
     * Обратная сторона: исключить из индекса действие, которое код считает обычным, значит
     * потерять его из выдачи по индексу — то есть сделать журнал неполным там, где он ищется
     * быстро.
     */
    const index = allMigrations.slice(
      allMigrations.indexOf('audit_log_tenant_visible_created_idx'),
      allMigrations.indexOf('audit_log_tenant_visible_created_idx') + 400
    );
    const excluded = [...index.matchAll(/'([a-z_]+\.[a-z_]+)'/g)].map((match) => match[1]!);
    for (const action of excluded) {
      expect(
        SERVICE_ACTIONS,
        `действие «${action}» исключено из индекса, но код считает его обычным`
      ).toContain(action);
    }
  });
});

describe('миграция аддитивна (регламент проекта)', () => {
  it('ничего не удаляет и не переделывает', () => {
    /*
     * Правило проекта: миграции только аддитивные. Это то, что делает откат релиза возможным —
     * старый код продолжает работать с новой базой.
     */
    const migration = readFileSync(
      resolve(migrationsDir, '0098_audit_log_query_indexes.sql'),
      'utf8'
    );
    expect(migration).not.toMatch(/\bdrop\b|\balter\b.*\bdrop\b/i);
    /*
     * Проверяем КАЖДОЕ создание индекса, а не «хотя бы одно». Прежняя проверка находила защиту
     * у соседнего индекса и пропускала незащищённый — поймано подсадкой.
     */
    const creations = migration.match(/CREATE INDEX(?: IF NOT EXISTS)?/gi) ?? [];
    expect(creations.length, 'в миграции нет ни одного индекса').toBeGreaterThan(0);
    for (const creation of creations) {
      expect(creation, 'индекс создаётся без защиты от повторного применения').toMatch(
        /IF NOT EXISTS/i
      );
    }
  });
});
