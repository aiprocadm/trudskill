import type { UserSession } from '../../entities/session/model';

export interface RoleBlueprint {
  role: string;
  displayName: string;
  topJobs: string[];
  primaryNav: string[];
}

const roleBlueprints: RoleBlueprint[] = [
  {
    role: 'learner',
    displayName: 'Студент',
    topJobs: [
      'Продолжить обучение с последнего места',
      'Сдать задание или пройти тест',
      'Проверить дедлайны и уведомления',
      'Отследить прогресс и результаты',
      'Связаться с преподавателем'
    ],
    primaryNav: ['/', '/learner/courses', '/assessment', '/notifications', '/chat']
  },
  {
    role: 'methodist',
    displayName: 'Методист',
    topJobs: [
      'Подготовить программу и структуру курса',
      'Управлять контентом и версиями',
      'Собирать тесты и назначения',
      'Передавать курс на публикацию',
      'Контролировать качество материалов'
    ],
    primaryNav: ['/', '/courses', '/learning/calendar', '/materials', '/assessment', '/reports']
  },
  {
    role: 'teacher',
    displayName: 'Преподаватель',
    topJobs: [
      'Проверить задания и выставить оценку',
      'Отслеживать прогресс группы',
      'Публиковать материалы и задания',
      'Отвечать на сообщения студентов',
      'Планировать обучение по дедлайнам'
    ],
    primaryNav: ['/', '/groups', '/learning/calendar', '/assessment', '/courses', '/notifications']
  },
  {
    role: 'tenant_admin',
    displayName: 'Администратор',
    topJobs: [
      'Управлять пользователями и ролями',
      'Контролировать доступы и безопасность',
      'Поддерживать структуру LMS',
      'Отслеживать проблемные точки',
      'Собирать отчеты по активности'
    ],
    primaryNav: ['/', '/users', '/reports', '/audit', '/settings']
  },
  {
    role: 'platform_admin',
    displayName: 'Администратор платформы',
    topJobs: [
      'Контролировать системную доступность',
      'Настраивать роли и уровни доступа',
      'Аудировать действия и сессии',
      'Вести интеграции и выгрузки',
      'Устранять инциденты по данным'
    ],
    primaryNav: ['/', '/users', '/audit', '/integrations', '/reports']
  }
];

const roleAliases: Record<string, string> = {
  admin: 'tenant_admin',
  administrator: 'tenant_admin',
  teacher: 'teacher',
  tutor: 'teacher',
  methodologist: 'methodist'
};

const normalizeRole = (role: string) => roleAliases[role] ?? role;

export const getSessionRoleBlueprints = (session: UserSession | null): RoleBlueprint[] => {
  if (!session) return [];
  const set = new Set(session.roles.map((role) => normalizeRole(role.toLowerCase())));
  return roleBlueprints.filter((blueprint) => set.has(blueprint.role));
};

export const getPrimaryRoleBlueprint = (session: UserSession | null): RoleBlueprint | null =>
  getSessionRoleBlueprints(session)[0] ?? null;
