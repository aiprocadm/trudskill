import { describe, expect, it } from 'vitest';

import { hashPassword, unusablePasswordHash } from './crypto.util.js';
import { findUsersWithKnownPassword } from './services/known-password-audit.js';

const user = (over: Partial<Parameters<typeof findUsersWithKnownPassword>[0]['users'][0]>) => ({
  id: 'u_1',
  tenantId: 't1',
  login: 'ivanov',
  passwordHash: hashPassword('Password123!'),
  ...over
});

/*
 * Ревизия 2026-08-27 (порция 39, журнал 290): учётки, заведённые ДО порции 31 без пароля,
 * получили публично известный `Password123!` из нашей же документации. Источник закрыт,
 * а записи остались — и найти их сравнением хэшей нельзя: у scrypt случайная соль, поэтому
 * у каждой такой учётки хэш свой. Это и была слепая зона записи 269.
 */
describe('поиск учёток с публично известным паролем (порция 39)', () => {
  it('находит учётку, в которую можно войти известным паролем', () => {
    expect(findUsersWithKnownPassword({ users: [user({})] })).toEqual([
      { id: 'u_1', tenantId: 't1', login: 'ivanov' }
    ]);
  });

  it('у каждой такой учётки СВОЙ хэш — находит обе', () => {
    const first = user({ id: 'u_1' });
    const second = user({ id: 'u_2', login: 'petrov' });
    expect(first.passwordHash).not.toBe(second.passwordHash);
    expect(findUsersWithKnownPassword({ users: [first, second] })).toHaveLength(2);
  });

  it('учётку с собственным паролем не трогает', () => {
    const own = user({ passwordHash: hashPassword('Svoj-Slozhnyj-Parol-9') });
    expect(findUsersWithKnownPassword({ users: [own] })).toEqual([]);
  });

  it('учётку без возможности входа паролем не трогает', () => {
    const noLogin = user({ passwordHash: unusablePasswordHash() });
    expect(findUsersWithKnownPassword({ users: [noLogin] })).toEqual([]);
  });

  it('демо-арендатор исключается: там этот пароль стоит намеренно', () => {
    const demo = user({ tenantId: 'tenant_demo' });
    expect(findUsersWithKnownPassword({ users: [demo], keepTenantIds: ['tenant_demo'] })).toEqual(
      []
    );
  });

  it('исключение действует только на свой центр', () => {
    const demo = user({ id: 'u_demo', tenantId: 'tenant_demo' });
    const real = user({ id: 'u_real', tenantId: 'tenant_real' });
    const found = findUsersWithKnownPassword({
      users: [demo, real],
      keepTenantIds: ['tenant_demo']
    });
    expect(found.map((item) => item.id)).toEqual(['u_real']);
  });
});
