/**
 * Канонический код роли — лист без импортов.
 *
 * ТЗ 4.1 (Я1): словарь имён ролей (`features/texts/roles.ru.ts`) обязан приводить синонимы к
 * каноническому коду тем же правилом, что маршруты и чертежи. Раньше таблиц синонимов было ДВЕ
 * и они разошлись: `role-home.ts` знал `student`, `role-blueprints.ts` — `tutor` и
 * `sales_manager`, и только одна из них знала `administrator`. Здесь одна таблица на всех.
 *
 * Модуль намеренно ничего не импортирует: он нужен и словарю, и чертежам, и маршрутам, а те
 * импортируют друг друга по кругу (`role-home → helpers → role-blueprints`). Лист разрывает круг.
 */

/** Синонимы кодов, встречающиеся в сессиях старых стендов, → код из живой базы. */
export const ROLE_ALIASES: Readonly<Record<string, string>> = {
  student: 'learner',
  admin: 'tenant_admin',
  administrator: 'tenant_admin',
  methodologist: 'methodist',
  tutor: 'teacher',
  sales_manager: 'manager'
};

export const normalizeRoleCode = (role: string): string => {
  const lowered = role.toLowerCase();
  return ROLE_ALIASES[lowered] ?? lowered;
};
