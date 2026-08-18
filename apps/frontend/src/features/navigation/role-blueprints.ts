import type { UserSession } from '../../entities/session/model';

export interface RoleBlueprint {
  role: string;
  displayName: string;
  topJobs: string[];
  primaryNav: string[];
}

/*
 * Экспортируется ради сторожевого теста: состав короткого меню — продуктовое
 * решение ТЗ редизайна §4.4, а не деталь реализации, и разъехаться с ТЗ он не должен.
 *
 * ПОРЯДОК ЗАПИСЕЙ ЗНАЧИМ. getSessionRoleBlueprints фильтрует этот массив и
 * сохраняет порядок объявления, а getNavigationView берёт меню у ПЕРВОЙ роли.
 * Поэтому список идёт от самой полной роли к самой узкой: администратор, которому
 * дополнительно выдали роль менеджера, должен увидеть меню администратора, а не
 * менеджера. Тот же принцип, что в таблице домашних маршрутов role-home.ts.
 */
export const roleBlueprints: RoleBlueprint[] = [
  {
    role: 'platform_admin',
    displayName: 'Администратор платформы',
    topJobs: [
      'Проверить здоровье арендаторов',
      'Завести или приостановить центр',
      'Разобрать очередь и сбои',
      'Проверить лицензии и оплату',
      'Поднять журнал действий'
    ],
    primaryNav: [
      '/workspace',
      '/platform/tenants',
      '/admin/licenses',
      '/audit',
      '/admin/operations',
      '/settings'
    ]
  },
  {
    role: 'tenant_admin',
    displayName: 'Администратор',
    // ТЗ §3.1: формулировки — результат для человека, а не обязанность роли.
    topJobs: [
      'Увидеть, что горит сегодня',
      'Зачислить слушателя в группу',
      'Закрыть группу и выдать документы',
      'Выгрузить реестр в надзор',
      'Найти слушателя и ответить по нему'
    ],
    primaryNav: [
      '/workspace',
      '/learners',
      '/groups',
      '/assessment',
      '/documents',
      '/reports',
      '/settings'
    ]
  },
  {
    role: 'manager',
    displayName: 'Менеджер',
    topJobs: [
      'Зачислить слушателя в группу',
      'Собрать группу под заказчика',
      'Выдать документы группе',
      'Ответить заказчику по прогрессу',
      'Выгрузить отчёт'
    ],
    primaryNav: ['/groups', '/learners', '/admin/clients', '/documents', '/reports']
  },
  {
    role: 'methodist',
    displayName: 'Методист',
    topJobs: [
      'Собрать программу курса',
      'Обновить материалы и версии',
      'Собрать тест и задания',
      'Передать курс на публикацию',
      'Найти пробелы в программах'
    ],
    primaryNav: ['/methodist', '/courses', '/materials', '/assessment', '/groups', '/reports']
  },
  {
    role: 'teacher',
    displayName: 'Преподаватель',
    topJobs: [
      'Проверить работы в очереди',
      'Посмотреть прогресс группы',
      'Ответить слушателям',
      'Спланировать занятия',
      'Открыть материалы курса'
    ],
    primaryNav: [
      '/groups',
      '/teacher/review',
      '/learning/calendar',
      '/courses',
      '/notifications'
    ]
  },
  {
    role: 'learner',
    displayName: 'Слушатель',
    topJobs: [
      'Продолжить обучение с последнего места',
      'Сдать тест или задание',
      'Проверить сроки',
      'Забрать документы об обучении',
      'Написать преподавателю'
    ],
    primaryNav: [
      '/learner',
      '/learner/courses',
      '/learner/tests',
      '/learner/documents',
      '/notifications',
      '/chat'
    ]
  }
];

const roleAliases: Record<string, string> = {
  admin: 'tenant_admin',
  administrator: 'tenant_admin',
  teacher: 'teacher',
  tutor: 'teacher',
  methodologist: 'methodist',
  sales_manager: 'manager'
};

const normalizeRole = (role: string) => roleAliases[role] ?? role;

export const getSessionRoleBlueprints = (session: UserSession | null): RoleBlueprint[] => {
  if (!session) return [];
  const set = new Set(session.roles.map((role) => normalizeRole(role.toLowerCase())));
  return roleBlueprints.filter((blueprint) => set.has(blueprint.role));
};

export const getPrimaryRoleBlueprint = (session: UserSession | null): RoleBlueprint | null =>
  getSessionRoleBlueprints(session)[0] ?? null;
