import { hasPermission } from '../../lib/rbac/permissions';
import { navigationModel } from '../navigation/model';

import type { UserSession } from '../../entities/session/model';

export interface SettingsSection {
  /** Совпадает с якорем на экране, если раздел встроен. */
  id: string;
  title: string;
  hint: string;
  /** Задан — раздел живёт своим маршрутом и открывается ссылкой; иначе это якорь. */
  href?: string;
}

/**
 * Оглавление настроек (IA-018, таблица ТЗ §4.7).
 *
 * Порядок — от того, что настраивают чаще, к разовому. Разделы со ссылкой остаются
 * отдельными экранами: сливать их в один файл ТЗ прямо запрещает.
 */
export const SETTINGS_LINK_SECTIONS: SettingsSection[] = [
  {
    id: 'academy',
    title: 'Учебный центр',
    hint: 'Название, реквизиты, комиссия',
    href: '/academy'
  },
  { id: 'users', title: 'Люди и доступ', hint: 'Сотрудники центра и их роли', href: '/users' },
  { id: 'payments', title: 'Оплата', hint: 'Платёжный провайдер центра' },
  { id: 'notifications', title: 'Уведомления', hint: 'Кому дублировать письма' },
  { id: 'webinars', title: 'Вебинары', hint: 'Площадка для занятий' },
  { id: 'sms', title: 'Оповещения по СМС', hint: 'Дублировать письма сообщениями' },
  { id: 'video', title: 'Видео в курсах', hint: 'Где хранятся учебные видео' },
  {
    id: 'integrations',
    title: 'Интеграции',
    hint: 'Обмен данными с внешними системами',
    href: '/integrations'
  },
  { id: 'sync-logs', title: 'Журнал обмена', hint: 'Что и когда уходило', href: '/sync-logs' },
  { id: 'telephony', title: 'Телефония', hint: 'Звонки и записи разговоров', href: '/telephony' },
  {
    id: 'licenses',
    title: 'Лицензии',
    hint: 'Образовательная лицензия и аккредитации',
    href: '/admin/licenses'
  },
  {
    id: 'usage',
    title: 'Потребление',
    hint: 'Слушатели, место, лимиты тарифа',
    href: '/admin/usage'
  },
  {
    id: 'operations',
    title: 'Эксплуатация',
    hint: 'Очереди, сбои выпуска, письма',
    href: '/admin/operations'
  },
  {
    id: 'platform',
    title: 'Платформа',
    hint: 'Учебные центры и тарифы',
    href: '/platform/tenants'
  },
  { id: 'branding', title: 'Оформление', hint: 'Логотип и цвета центра' },
  { id: 'profile', title: 'Профиль и вход', hint: 'Ваши данные, вход и тема' }
];

/**
 * Права разделов берутся из карты навигации, а не выписываются здесь заново.
 *
 * Иначе получилось бы два независимых списка прав на одни и те же маршруты — и они
 * разошлись бы при первой правке RBAC. Раздел без прав не показывается: ссылка,
 * ведущая на «нет доступа», — это не оглавление, а ловушка.
 *
 * Встроенные разделы (без `href`) видны всем, кто попал на экран настроек: их
 * содержимое само решает, что показывать (например, оформление скрывается без права).
 */
export const visibleSettingsSections = (session: UserSession | null): SettingsSection[] => {
  if (!session) return [];
  const requiredByHref = new Map(
    navigationModel.map((item) => [item.href, item.requiredPermissions ?? []])
  );

  return SETTINGS_LINK_SECTIONS.filter((section) => {
    if (!section.href) return true;
    const required = requiredByHref.get(section.href);
    // Маршрута нет в карте навигации — показываем: скрыть по незнанию хуже, чем показать.
    if (!required) return true;
    return hasPermission(session.permissions, required);
  });
};
