import { describe, expect, it } from 'vitest';

import { STAGING_TENANT, stagingSeedStatements } from './staging-seed.js';

/**
 * ФТ-I3: «staging с сид-данными ДВУХ тенантов».
 *
 * Зачем именно двух. Изоляция арендаторов — требование уровня P0 (ФТ-D1), и она закрыта
 * тестами (`test:isolation`). Но на живом стенде проверить её было **нечем**: в базе жил
 * ровно один арендатор `tenant_demo`, созданный миграцией `0010`. Утечку между арендаторами
 * невозможно увидеть глазами там, где второго арендатора не существует.
 *
 * Второй арендатор заводится отдельным скриптом, а не миграцией: миграции применяются и в
 * проде, а демонстрационные данные там не нужны.
 */

describe('ФТ-I3 · сид второго арендатора для стенда', () => {
  it('арендатор отличается от демонстрационного и по идентификатору, и по коду', () => {
    expect(STAGING_TENANT.id).not.toBe('tenant_demo');
    expect(STAGING_TENANT.code).not.toBe('demo');
    // Название человеку видно в шапке — на стенде должно быть сразу понятно, где ты.
    expect(STAGING_TENANT.name).toMatch(/[А-Яа-яЁё]/);
  });

  it('каждая строка привязана к своему арендатору — чужого tenant_id в сиде нет', () => {
    const statements = stagingSeedStatements();
    const foreign = statements.filter((sql) => sql.includes('tenant_demo'));

    expect(foreign, `сид ссылается на чужого арендатора:\n${foreign.join('\n')}`).toEqual([]);
  });

  it('сид идемпотентен: повторный запуск ничего не ломает', () => {
    // Скрипт запускают на стенде руками и обычно не по одному разу.
    for (const sql of stagingSeedStatements()) {
      expect(sql.toLowerCase(), `не идемпотентно: ${sql}`).toContain('on conflict');
    }
  });

  it('у арендатора есть свой администратор — иначе в него нельзя войти', () => {
    const statements = stagingSeedStatements();
    const userInserts = statements.filter((sql) => sql.includes('iam.users'));

    expect(userInserts.length).toBeGreaterThan(0);
    expect(userInserts.join('\n')).toContain(STAGING_TENANT.id);
  });

  it('есть на что посмотреть: слушатель, группа и курс своего арендатора', () => {
    const sql = stagingSeedStatements().join('\n');

    expect(sql).toContain('learning.courses');
    expect(sql).toContain('learning.groups');
    expect(sql).toContain('learning.learners');
  });

  it('пароль стенда не пустой и задан хэшем, а не открытым текстом', () => {
    const sql = stagingSeedStatements().join('\n');

    expect(sql).not.toContain('Password123!');
    expect(sql).toMatch(/password_hash/);
  });
});
