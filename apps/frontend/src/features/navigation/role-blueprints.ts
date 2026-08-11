import type { UserSession } from '../../entities/session/model';

export interface RoleBlueprint {
  role: string;
  displayName: string;
  topJobs: string[];
  primaryNav: string[];
}

/*
 * Фаза 1 ТЗ редизайна (IA-013, IA-002): главное меню роли — ≤7 пунктов, порядок = частота.
 * Прежние списки начинались с `/` и не вели ни в один рабочий раздел: у администратора
 * было `['/', '/users', '/reports', '/audit', '/settings']` — четыре из семи его сценариев
 * (зачислить, закрыть группу, найти слушателя, поправить курс) не покрывались вовсе.
 * Формулировки topJobs — проверяемые сценарии JOB-*, а не обобщения вроде «поддерживать структуру».
 */
const roleBlueprints: RoleBlueprint[] = [
  {
    role: 'learner',
    displayName: 'Слушатель',
    topJobs: [
      'Продолжить обучение с последнего места',
      'Сдать задание или пройти тест',
      'Посмотреть свои документы',
      'Проверить сроки и уведомления'
    ],
    primaryNav: [
      '/learner',
      '/learner/courses',
      '/learner/tests',
      '/learner/documents',
      '/notifications',
      '/chat'
    ]
  },
  {
    role: 'methodist',
    displayName: 'Методист',
    topJobs: [
      'Собрать программу и структуру курса',
      'Обновить материалы и версии',
      'Собрать тест и назначить его группе',
      'Передать курс на публикацию'
    ],
    primaryNav: ['/methodist', '/courses', '/materials', '/assessment', '/groups', '/reports']
  },
  {
    role: 'teacher',
    displayName: 'Преподаватель',
    topJobs: [
      'Проверить задания и выставить оценку',
      'Посмотреть прогресс группы',
      'Ответить слушателю',
      'Спланировать занятия по срокам'
    ],
    primaryNav: [
      '/groups',
      '/teacher/review',
      '/teacher/grading-center',
      '/learning/calendar',
      '/courses',
      '/notifications'
    ]
  },
  {
    role: 'manager',
    displayName: 'Менеджер',
    topJobs: [
      'Зачислить слушателя в группу',
      'Найти слушателя и ответить на вопрос',
      'Вести заказчика и его сотрудников',
      'Проверить выданные документы'
    ],
    primaryNav: ['/groups', '/learners', '/counterparties', '/documents', '/reports']
  },
  {
    role: 'tenant_admin',
    displayName: 'Администратор',
    topJobs: [
      'Увидеть, что горит, сразу после входа',
      'Зачислить слушателя в группу',
      'Закрыть группу и выдать документы',
      'Выгрузить реестр в надзор',
      'Найти слушателя и увидеть всё по нему',
      'Поправить курс и тест, не теряя связей',
      'Найти нужную настройку центра'
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
    role: 'platform_admin',
    displayName: 'Администратор платформы',
    topJobs: [
      'Следить за состоянием учебных центров',
      'Завести центр и назначить тариф',
      'Разобрать сбой в очередях и выгрузках',
      'Проверить журнал действий'
    ],
    primaryNav: [
      '/workspace',
      '/platform/tenants',
      '/admin/licenses',
      '/audit',
      '/admin/operations',
      '/settings'
    ]
  }
];

const roleAliases: Record<string, string> = {
  admin: 'tenant_admin',
  administrator: 'tenant_admin',
  teacher: 'teacher',
  tutor: 'teacher',
  methodologist: 'methodist'
};

/** Полный список для сторожевых тестов — без привязки к сессии. */
export const getRoleBlueprints = (): RoleBlueprint[] => roleBlueprints;

const normalizeRole = (role: string) => roleAliases[role] ?? role;

export const getSessionRoleBlueprints = (session: UserSession | null): RoleBlueprint[] => {
  if (!session) return [];
  const set = new Set(session.roles.map((role) => normalizeRole(role.toLowerCase())));
  return roleBlueprints.filter((blueprint) => set.has(blueprint.role));
};

export const getPrimaryRoleBlueprint = (session: UserSession | null): RoleBlueprint | null =>
  getSessionRoleBlueprints(session)[0] ?? null;
