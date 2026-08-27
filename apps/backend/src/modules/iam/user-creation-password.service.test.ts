import { describe, expect, it } from 'vitest';

import { verifyPassword } from './crypto.util.js';
import { AuditService } from '../audit/audit.service.js';
import { IamService } from './services/iam.service.js';

const T = 'tenant_demo';

const makeIam = (): IamService => new IamService(new AuditService());

/*
 * Ревизия 2026-08-27 (порция 31, журнал 269).
 *
 * `POST /users` разрешает не передавать пароль — и учётка создавалась с публично
 * известным `Password123!` (он лежит в документации стенда и в миграции демо-данных).
 * То есть администратор заводил сотрудника, а получал учётную запись, в которую может
 * войти кто угодно, кто читал наши же документы. Исправить её потом было нечем: ручек
 * смены и сброса пароля в продукте нет.
 *
 * Решение (принято агентом 27.08, владелец передал решения): без пароля учётка
 * создаётся БЕЗ возможности входа по паролю. Вход у такого человека один — по ссылке
 * на почту, и он работает с порции 23. Поэтому же почта в этом случае обязательна:
 * иначе человек не войдёт вовсе.
 */
describe('создание учётки без пароля (порция 31)', () => {
  it('в учётку без пароля нельзя войти публично известным паролем', async () => {
    const iam = makeIam();
    const user = await iam.createUser(T, {
      login: 'new_staff',
      email: 'new_staff@example.ru',
      displayName: 'Новый сотрудник'
    });

    expect(verifyPassword('Password123!', user.passwordHash)).toBe(false);
  });

  it('в неё вообще нельзя войти паролем — любым', async () => {
    const iam = makeIam();
    const user = await iam.createUser(T, {
      login: 'no_password',
      email: 'no_password@example.ru',
      displayName: 'Без пароля'
    });

    for (const guess of ['', 'password', 'Password123!', user.passwordHash]) {
      expect(verifyPassword(guess, user.passwordHash)).toBe(false);
    }
  });

  it('заданный пароль работает как раньше', async () => {
    const iam = makeIam();
    const user = await iam.createUser(T, {
      login: 'with_password',
      displayName: 'С паролем',
      password: 'Sobstvennyj-Parol-1'
    });

    expect(verifyPassword('Sobstvennyj-Parol-1', user.passwordHash)).toBe(true);
  });

  it('без пароля и без почты учётку заводить нельзя: войти было бы нечем', async () => {
    const iam = makeIam();
    await expect(
      iam.createUser(T, { login: 'orphan', displayName: 'Ни пароля, ни почты' })
    ).rejects.toThrow();
  });
});
