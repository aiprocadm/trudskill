export type LmsRole = 'learner' | 'teacher' | 'methodist' | 'tenant_admin';

export interface RoleJourneyStep {
  id: string;
  label: string;
  href: string;
  metricStep: string;
}

export interface RoleJourney {
  role: LmsRole;
  title: string;
  description: string;
  steps: RoleJourneyStep[];
}

export const roleJourneys: RoleJourney[] = [
  {
    role: 'learner',
    title: 'Траектория слушателя',
    description: 'От входа в систему до завершения учебного шага и проверки результата.',
    steps: [
      { id: 'open_courses', label: 'Открыть мои курсы', href: '/learner/courses', metricStep: 'open_courses' },
      { id: 'resume_course', label: 'Продолжить курс', href: '/learner/courses', metricStep: 'resume_course' },
      { id: 'submit_task', label: 'Сдать задание/тест', href: '/assessment', metricStep: 'submit_task' },
      { id: 'view_result', label: 'Проверить результат', href: '/assessment', metricStep: 'view_result' }
    ]
  },
  {
    role: 'teacher',
    title: 'Траектория преподавателя',
    description: 'Быстрый цикл проверки работ и обратной связи.',
    steps: [
      { id: 'open_queue', label: 'Открыть очередь проверок', href: '/assessment', metricStep: 'open_queue' },
      { id: 'review_work', label: 'Проверить работу', href: '/assessment', metricStep: 'review_work' },
      { id: 'send_feedback', label: 'Отправить обратную связь', href: '/notifications', metricStep: 'send_feedback' },
      { id: 'track_group', label: 'Проверить прогресс группы', href: '/groups', metricStep: 'track_group' }
    ]
  },
  {
    role: 'methodist',
    title: 'Траектория методиста',
    description: 'Подготовка, контроль качества и публикация учебного контента.',
    steps: [
      { id: 'prepare_course', label: 'Подготовить курс', href: '/courses', metricStep: 'prepare_course' },
      { id: 'update_materials', label: 'Обновить материалы', href: '/materials', metricStep: 'update_materials' },
      { id: 'validate_assessment', label: 'Проверить оценочные материалы', href: '/assessment', metricStep: 'validate_assessment' },
      { id: 'publish', label: 'Передать на публикацию', href: '/reports', metricStep: 'publish' }
    ]
  },
  {
    role: 'tenant_admin',
    title: 'Траектория администратора',
    description: 'Контроль доступов, рисков и операционного состояния LMS.',
    steps: [
      { id: 'check_users', label: 'Проверить пользователей и роли', href: '/users', metricStep: 'check_users' },
      { id: 'check_audit', label: 'Проверить аудит и инциденты', href: '/audit', metricStep: 'check_audit' },
      { id: 'check_workspace', label: 'Оценить блокеры в оперативной панели', href: '/workspace', metricStep: 'check_workspace' },
      { id: 'apply_fix', label: 'Выполнить корректирующее действие', href: '/settings', metricStep: 'apply_fix' }
    ]
  }
];

export const getJourneyByRole = (role: string | undefined): RoleJourney | null => {
  if (!role) return null;
  return roleJourneys.find((item) => item.role === role) ?? null;
};
