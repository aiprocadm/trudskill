'use client';

import Link from 'next/link';

import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty
} from '../../components/state-wrappers';

/*
 * Перенесены «как есть» из features/mvp/screens.tsx (§8.3, порядок 10 — последний;
 * правило SCR-001: перенос и редизайн не смешиваются в одном коммите).
 * Три экрана-обёртки над общей сеткой виджетов по ролям.
 */

const normalizeRoleCode = (role: string) => {
  const lowered = role.toLowerCase();
  if (lowered === 'student') return 'learner';
  if (lowered === 'admin') return 'tenant_admin';
  return lowered;
};

const hasAnyRole = (roles: string[] | undefined, allowed: string[]) => {
  if (!roles?.length) return false;
  const normalized = new Set(roles.map((role) => normalizeRoleCode(role)));
  return allowed.some((role) => normalized.has(role));
};

interface RoleWidget {
  title: string;
  note: string;
  href: string;
  allowedRoles: string[];
}

const roleWidgets: RoleWidget[] = [
  {
    title: 'Продолжить обучение',
    note: 'Вернуться к последнему модулю и материалу.',
    href: '/learner/courses',
    allowedRoles: ['learner']
  },
  {
    title: 'Ближайшие сроки',
    note: 'Проверить задания и тесты на ближайшие 7 дней.',
    href: '/assessment',
    allowedRoles: ['learner']
  },
  {
    title: 'Мои попытки',
    note: 'История попыток и результаты оценивания.',
    href: '/assessment',
    allowedRoles: ['learner']
  },
  {
    title: 'Мои документы',
    note: 'Быстрый доступ к учебным и правовым документам.',
    href: '/documents',
    allowedRoles: ['learner']
  },
  {
    title: 'Уведомления',
    note: 'Новые сообщения, объявления и напоминания.',
    href: '/notifications',
    allowedRoles: ['learner']
  },
  {
    title: 'Ближайшие вебинары',
    note: 'Запланированные онлайн-занятия и ссылки на эфир.',
    href: '/learner/webinars',
    allowedRoles: ['learner']
  },
  {
    title: 'Работы на проверку',
    note: 'Очередь работ студентов, требующих проверки.',
    href: '/assessment',
    allowedRoles: ['teacher']
  },
  {
    title: 'Критерии оценивания',
    note: 'Критерии оценивания и шаблоны комментариев.',
    href: '/assessment',
    allowedRoles: ['teacher']
  },
  {
    title: 'Кто отстаёт',
    note: 'Студенты с низким прогрессом и просрочками.',
    href: '/groups',
    allowedRoles: ['teacher']
  },
  {
    title: 'Сеансы входа',
    note: 'Активные сессии пользователей и подозрительные входы.',
    href: '/users',
    allowedRoles: ['tenant_admin', 'platform_admin']
  },
  {
    title: 'Очередь задач',
    note: 'Очереди задач и интеграционных джобов.',
    href: '/exports',
    allowedRoles: ['tenant_admin', 'platform_admin']
  },
  {
    title: 'Обмен данными',
    note: 'Статус коннекторов и диагностика синхронизаций.',
    href: '/integrations',
    allowedRoles: ['tenant_admin', 'platform_admin']
  },
  {
    title: 'Состояние журнала действий',
    note: 'Покрытие аудита, ошибки и деградация логов.',
    href: '/audit',
    allowedRoles: ['tenant_admin', 'platform_admin']
  }
];

const RoleWidgetGrid = ({
  roles,
  title,
  subtitle
}: {
  roles: string[];
  title: string;
  subtitle: string;
}) => {
  const visibleWidgets = roleWidgets.filter((widget) => hasAnyRole(roles, widget.allowedRoles));

  return (
    <PageContainer>
      <PageHeader title={title} subtitle={subtitle} />
      <SectionCard title="Виджеты по роли">
        {visibleWidgets.length ? (
          <div className="ui-dashboard-grid" data-testid="rbac-widget-grid">
            {visibleWidgets.map((widget) => (
              <Link
                key={`${widget.title}-${widget.href}`}
                href={widget.href}
                className="ui-dashboard-tile"
              >
                <div className="ui-dashboard-tile-title">{widget.title}</div>
                <div className="ui-dashboard-tile-note">{widget.note}</div>
              </Link>
            ))}
          </div>
        ) : (
          <SectionEmpty
            message="Нет видимых виджетов для текущей роли"
            hint="Проверьте назначенные пользователю роли."
          />
        )}
      </SectionCard>
    </PageContainer>
  );
};

export const StudentDashboardScreen = () => (
  <RoleWidgetGrid
    roles={['learner']}
    title="Главная учащегося"
    subtitle="Обучение, дедлайны, попытки, документы, уведомления и вебинары"
  />
);

export const TeacherGradingCenterScreen = () => (
  <RoleWidgetGrid
    roles={['teacher']}
    title="Центр проверки работ"
    subtitle="Очередь проверок, критерии оценки и контроль отстающих учащихся"
  />
);

export const AdminCockpitScreen = () => (
  <RoleWidgetGrid
    roles={['tenant_admin', 'platform_admin']}
    title="Панель администратора"
    subtitle="Сессии · очередь · интеграции · состояние аудита"
  />
);
