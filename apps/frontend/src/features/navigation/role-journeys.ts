export type LmsRole = 'learner' | 'teacher' | 'methodist' | 'tenant_admin';

export interface RoleJourneyStep {
  id: string;
  label: string;
  href: string;
  metricStep: string;
}

/**
 * Первые шаги роли — блок «С чего начать» на стартовом экране (ТЗ 4.4 / Я4).
 *
 * Раньше блок назывался «Сценарий роли: Траектория администратора», а описание звучало как
 * «Контроль доступов, рисков и операционного состояния LMS» — так никто не говорит. Заголовок
 * блока теперь один на все роли, а описание отвечает на вопрос «что мне сделать».
 */
export interface RoleJourney {
  role: LmsRole;
  description: string;
  steps: RoleJourneyStep[];
}

export const roleJourneys: RoleJourney[] = [
  {
    role: 'learner',
    description: 'Откройте свои курсы, пройдите материалы, сдайте тест и посмотрите результат.',
    steps: [
      {
        id: 'open_courses',
        label: 'Открыть мои курсы',
        href: '/learner/courses',
        metricStep: 'open_courses'
      },
      {
        id: 'resume_course',
        label: 'Продолжить курс',
        href: '/learner/courses',
        metricStep: 'resume_course'
      },
      {
        id: 'submit_task',
        label: 'Сдать тест или задание',
        href: '/assessment',
        metricStep: 'submit_task'
      },
      {
        id: 'view_result',
        label: 'Проверить результат',
        href: '/assessment',
        metricStep: 'view_result'
      }
    ]
  },
  {
    role: 'teacher',
    description: 'Проверьте работы, напишите отзыв и посмотрите, как идёт группа.',
    steps: [
      {
        id: 'open_queue',
        label: 'Открыть очередь проверок',
        href: '/assessment',
        metricStep: 'open_queue'
      },
      {
        id: 'review_work',
        label: 'Проверить работу',
        href: '/assessment',
        metricStep: 'review_work'
      },
      {
        id: 'send_feedback',
        label: 'Написать отзыв на работу',
        href: '/notifications',
        metricStep: 'send_feedback'
      },
      {
        id: 'track_group',
        label: 'Проверить прогресс группы',
        href: '/groups',
        metricStep: 'track_group'
      }
    ]
  },
  {
    role: 'methodist',
    description: 'Подготовьте курс, обновите материалы и проверьте тесты перед публикацией.',
    steps: [
      {
        id: 'prepare_course',
        label: 'Подготовить курс',
        href: '/courses',
        metricStep: 'prepare_course'
      },
      {
        id: 'update_materials',
        label: 'Обновить материалы',
        href: '/materials',
        metricStep: 'update_materials'
      },
      {
        id: 'validate_assessment',
        label: 'Проверить тесты и задания',
        href: '/assessment',
        metricStep: 'validate_assessment'
      },
      { id: 'publish', label: 'Передать на публикацию', href: '/reports', metricStep: 'publish' }
    ]
  },
  {
    role: 'tenant_admin',
    description:
      'Проверьте людей и права, загляните в журнал действий и разберите, что горит на панели.',
    steps: [
      {
        id: 'check_users',
        label: 'Проверить пользователей и роли',
        href: '/users',
        metricStep: 'check_users'
      },
      {
        id: 'check_audit',
        label: 'Проверить аудит и инциденты',
        href: '/audit',
        metricStep: 'check_audit'
      },
      {
        id: 'check_workspace',
        label: 'Разобрать, что горит на панели',
        href: '/workspace',
        metricStep: 'check_workspace'
      },
      {
        id: 'apply_fix',
        label: 'Исправить найденное в настройках',
        href: '/settings',
        metricStep: 'apply_fix'
      }
    ]
  }
];

export const getJourneyByRole = (role: string | undefined): RoleJourney | null => {
  if (!role) return null;
  return roleJourneys.find((item) => item.role === role) ?? null;
};
