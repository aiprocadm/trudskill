'use client';

import Link from 'next/link';
import { useEffect, useMemo } from 'react';

import { PageContainer, PageHeader, SectionCard } from '../src/components/state-wrappers';
import { useAuth } from '../src/features/auth/context';
import { getPrimaryRoleBlueprint } from '../src/features/navigation/role-blueprints';
import { getMetricBaseline, startMetricTimer } from '../src/lib/analytics/ux-metrics';
import { ProtectedPage } from '../src/widgets/shell/protected-page';

const roleCards = {
  default: [
    {
      title: 'Ближайшие дедлайны',
      note: 'Соберите задачи со сроком до 7 дней',
      href: '/assessment'
    },
    {
      title: 'Прогресс по курсам',
      note: 'Показывайте прогресс по активным потокам',
      href: '/courses'
    },
    { title: 'Новые сообщения', note: 'Непрочитанные уведомления и чат', href: '/notifications' },
    { title: 'Продолжить работу', note: 'Откройте последний активный сценарий', href: '/workspace' }
  ],
  learner: [
    {
      title: 'Ближайшие дедлайны',
      note: 'Проверить задания и тесты на этой неделе',
      href: '/assessment'
    },
    {
      title: 'Прогресс по курсам',
      note: 'Следите за прогрессом обучения',
      href: '/learner/courses'
    },
    {
      title: 'Новые сообщения',
      note: 'Сообщения от куратора и преподавателей',
      href: '/notifications'
    },
    {
      title: 'Продолжить обучение',
      note: 'Вернуться к последнему материалу',
      href: '/learner/courses'
    }
  ],
  teacher: [
    {
      title: 'Работы на проверке',
      note: 'Проверить новые задания и дать обратную связь',
      href: '/assessment'
    },
    { title: 'Прогресс групп', note: 'Проблемные места по активным группам', href: '/groups' },
    { title: 'Сообщения студентов', note: 'Ответить на новые вопросы', href: '/notifications' },
    { title: 'Опубликовать материалы', note: 'Обновить учебный контент', href: '/courses' }
  ],
  methodist: [
    { title: 'План публикаций', note: 'Курсы, готовые к релизу', href: '/courses' },
    { title: 'Состояние контента', note: 'Материалы, требующие обновления', href: '/materials' },
    { title: 'Проверка заданий', note: 'Соответствие программы и оценивания', href: '/assessment' },
    { title: 'Следующий шаг', note: 'Отправить курс на публикацию', href: '/reports' }
  ],
  tenant_admin: [
    { title: 'Новые пользователи', note: 'Назначить роли и доступы', href: '/users' },
    { title: 'Системные риски', note: 'Проверить аудит и критичные события', href: '/audit' },
    { title: 'Операционная сводка', note: 'Блокеры и зоны просадки', href: '/workspace' },
    { title: 'Следующее действие', note: 'Обновить настройки и права', href: '/settings' }
  ]
} as const;

export default function DashboardPage() {
  const { session } = useAuth();
  const role = getPrimaryRoleBlueprint(session);

  useEffect(() => {
    startMetricTimer('time_to_start_learning');
  }, []);

  const cards = useMemo(() => {
    const key = role?.role as keyof typeof roleCards | undefined;
    if (key && roleCards[key]) return roleCards[key];
    return roleCards.default;
  }, [role]);

  const baselineCount = getMetricBaseline().length;

  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader
          title="Панель LMS"
          subtitle="4 ключевых блока для быстрого старта: дедлайны, прогресс, сообщения и следующее действие"
        />
        <SectionCard title="Приоритеты на сегодня">
          <div className="ui-dashboard-grid">
            {cards.map((item) => (
              <Link key={item.title} href={item.href} className="ui-dashboard-tile">
                <div className="ui-dashboard-tile-title">{item.title}</div>
                <div className="ui-dashboard-tile-note">{item.note}</div>
              </Link>
            ))}
          </div>
        </SectionCard>
        <SectionCard title="Текущий фокус роли">
          <p className="ui-prose-muted">
            {role ? `Роль: ${role.displayName}.` : 'Роль не определена.'}{' '}
            {role ? `Ключевые задачи: ${role.topJobs.join('; ')}.` : 'Назначьте роль пользователю.'}
          </p>
        </SectionCard>
        <SectionCard title="Baseline метрик UX">
          <p className="ui-prose-muted">
            Зафиксировано событий для baseline: {baselineCount}. Метрики используются для оценки
            времени до старта, завершения отправки и ошибок форм.
          </p>
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
