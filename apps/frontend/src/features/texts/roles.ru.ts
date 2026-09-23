/**
 * Словарь ролей на русском (ТЗ «Стабилизация, UX и развитие», 4.1 / Я1, решение Р1).
 *
 * **Как было.** Одна роль звалась тремя способами: «Manager» в выпадающем списке (имя из
 * посева базы), «Менеджер» в шапке (чертёж роли на фронте), «руководитель» в документации.
 * В одном списке стояли «Представитель заказчика», «Учащийся», «Manager», «Methodist»,
 * «Platform admin», «Преподаватель», «Tenant admin». У представителя заказчика имени на
 * фронте не было вовсе — профиль печатал код `counterparty_rep`.
 *
 * **Что закреплено.** Технический код → одно русское название, в именительном падеже, с
 * заглавной только в начале. Это ЕДИНСТВЕННОЕ место, где роль называется: шапка, профиль,
 * список пользователей и фильтр берут имя отсюда по коду и НЕ доверяют полю `name` из базы
 * (посев выровнен миграцией 0096, но стенд мог его ещё не получить).
 *
 * Коды — из живой базы (`iam.roles`), а не из текста ТЗ: ТЗ называет представителя заказчика
 * `customer`, в базе он `counterparty_rep` (правило CLAUDE.md: права и коды — из живой базы).
 *
 * Это первый файл-ресурс по 16.4 («тексты как ресурс»): следующие словари кладутся рядом.
 */

import { normalizeRoleCode } from '../navigation/role-code';

export const ROLE_NAMES_RU = {
  platform_admin: 'Администратор платформы',
  tenant_admin: 'Администратор центра',
  manager: 'Руководитель',
  curator: 'Куратор обучения',
  methodist: 'Методист',
  teacher: 'Преподаватель',
  learner: 'Слушатель',
  counterparty_rep: 'Представитель заказчика'
} as const satisfies Record<string, string>;

export type RoleCode = keyof typeof ROLE_NAMES_RU;

const isKnownRole = (code: string): code is RoleCode => code in ROLE_NAMES_RU;

/**
 * Имя роли по коду. Синонимы из старых сессий (`admin`, `student`, `methodologist`)
 * приводятся к каноническому коду тем же правилом, что и в маршрутах.
 *
 * Неизвестный код возвращается как есть: это честнее, чем прятать новую роль за «—», и
 * сторож `roles-speak-russian` не даст такому коду дожить до экрана — словарь сверяется
 * на равенство с живым набором ролей.
 */
export const roleNameRu = (code: string): string => {
  const canonical = normalizeRoleCode(code);
  return isKnownRole(canonical) ? ROLE_NAMES_RU[canonical] : code;
};

/** Имена ролей сессии без повторов и в порядке словаря — для шапки и профиля. */
export const roleNamesRu = (codes: readonly string[]): string[] => {
  const canonical = new Set(codes.map(normalizeRoleCode));
  const known = (Object.keys(ROLE_NAMES_RU) as RoleCode[])
    .filter((code) => canonical.has(code))
    .map((code) => ROLE_NAMES_RU[code]);
  const unknown = [...canonical].filter((code) => !isKnownRole(code));
  return [...known, ...unknown];
};
