import { getSessionRoleBlueprints } from './role-blueprints';

import type { UserSession } from '../../entities/session/model';

/**
 * Меню человека в шапке (ТЗ «Стабилизация, UX и развитие», 7.1 / В1).
 *
 * **Как было.** Самым заметным элементом шапки была кнопка «Выйти» — единственная обведённая
 * кнопка на всей странице. То есть интерфейс каждым экраном предлагал уйти. «Уведомления»
 * стояли ссылкой, неотличимой от подписи; переключатель темы занимал место на КАЖДОЙ странице,
 * хотя тему меняют раз в жизни; имя и роль были серым мёртвым текстом (журнал 558).
 *
 * **Что стало.** Справа — человек: инициалы и имя, за ними меню «Профиль», «Оформление»,
 * «Выйти». Выход остался, но перестал быть главным предложением экрана.
 */

/**
 * Инициалы для кружка.
 *
 * Берутся две первые буквы слов: «Иванов Пётр» → «ИП». Одно слово даёт одну букву — выдумывать
 * вторую неоткуда. Пусто — кружок не рисуется вовсе, а не показывает знак вопроса.
 */
export const initialsOf = (displayName: string | undefined): string => {
  const words = (displayName ?? '')
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);
  return words
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join('');
};

/**
 * Куда ведёт «Профиль».
 *
 * У слушателя свой кабинет (`/learner/profile`), у сотрудника профиль живёт в настройках
 * вкладкой — там же вход и оформление. Один пункт меню на всех, адрес выбирается по роли:
 * иначе сотрудник попадал бы в кабинет слушателя, а слушатель — в настройки центра, куда его
 * не пустят права.
 */
export const profileHref = (session: UserSession | null): string => {
  const blueprints = getSessionRoleBlueprints(session);
  const learnerOnly = blueprints.length > 0 && blueprints.every((item) => item.role === 'learner');
  return learnerOnly ? '/learner/profile' : '/settings?tab=profile';
};

export interface UserMenuItem {
  id: 'profile' | 'appearance' | 'logout';
  label: string;
  /** Пункт-ссылка; у «Оформления» и «Выйти» адреса нет — они делают что-то на месте. */
  href?: string;
  danger?: boolean;
}

/**
 * Состав меню (ТЗ 7.1 дословно: «Профиль», «Оформление», «Выйти»).
 *
 * Порядок значим: сначала то, за чем приходят чаще, в конце — выход. Выход помечен опасным не
 * потому, что он необратим, а потому, что случайное нажатие стоит человеку работы: он теряет
 * несохранённое и вводит пароль заново.
 */
export const userMenuItems = (session: UserSession | null): UserMenuItem[] => [
  { id: 'profile', label: 'Профиль', href: profileHref(session) },
  { id: 'appearance', label: 'Оформление' },
  { id: 'logout', label: 'Выйти', danger: true }
];

/**
 * Подпись колокольчика уведомлений.
 *
 * Число рядом со значком само по себе ничего не говорит человеку, который слушает экран:
 * «три» — три чего? Поэтому подпись полная, а на экране видно только число.
 */
export const unreadLabel = (total: number | undefined): string => {
  const count = total ?? 0;
  if (count === 0) return 'Уведомления: непрочитанных нет';
  return `Уведомления: непрочитанных ${count}`;
};

/** Сколько показать на значке: больше 99 не помещается и не нужно — это уже «много». */
export const unreadBadge = (total: number | undefined): string | null => {
  const count = total ?? 0;
  if (count <= 0) return null;
  return count > 99 ? '99+' : String(count);
};
