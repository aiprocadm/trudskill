import { verifyPassword } from '../crypto.util.js';

/**
 * Ревизия 2026-08-27 (порция 39, журнал 290) — поиск учёток с публично известным паролем.
 *
 * До порции 31 создание сотрудника БЕЗ пароля подставляло `Password123!` — он лежит в
 * документации стенда, в демо-миграции и в самом репозитории. Источник закрыт, но записи,
 * заведённые раньше, остались: в них может войти любой, кто читал наши же документы, а
 * ручек смены и сброса пароля в продукте нет.
 *
 * Автоматикой при запуске это чинить НЕЛЬЗЯ, и не по лени: демо-пользователи стенда носят
 * этот пароль НАМЕРЕННО (так написано в руководстве по стенду), а перебор scrypt-хэшей по
 * всем учёткам — минуты работы при большом центре. Поэтому разовая команда, которую
 * запускает человек, по умолчанию только показывает список и требует явного согласия
 * на запись.
 */

/** Пароли, которые считаем публично известными: они напечатаны в наших же документах. */
export const PUBLICLY_KNOWN_PASSWORDS = ['Password123!'] as const;

export interface AuditUserRow {
  id: string;
  tenantId: string;
  login: string;
  passwordHash: string;
}

export interface KnownPasswordFinding {
  id: string;
  tenantId: string;
  login: string;
}

export interface FindKnownPasswordsInput {
  users: AuditUserRow[];
  /** Арендаторы, которые оставляем как есть (демо-стенд живёт с этим паролем намеренно). */
  keepTenantIds?: string[];
}

/**
 * Учётки, в которые можно войти публично известным паролем.
 *
 * Проверка идёт `verifyPassword`, а не сравнением хэшей: хэш scrypt содержит случайную соль,
 * поэтому у каждой такой учётки он СВОЙ — сравнение с эталоном (как в нейтрализации утёкшего
 * демо-хэша) их не находит вовсе. Это и была слепая зона записи 269.
 */
export function findUsersWithKnownPassword(input: FindKnownPasswordsInput): KnownPasswordFinding[] {
  const keep = new Set(input.keepTenantIds ?? []);
  const found: KnownPasswordFinding[] = [];
  for (const user of input.users) {
    if (keep.has(user.tenantId)) continue;
    const guessable = PUBLICLY_KNOWN_PASSWORDS.some((password) =>
      verifyPassword(password, user.passwordHash)
    );
    if (guessable) found.push({ id: user.id, tenantId: user.tenantId, login: user.login });
  }
  return found;
}
