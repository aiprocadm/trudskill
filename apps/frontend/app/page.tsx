'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';

import { PageContainer, PageHeader, SectionCard } from '../src/components/state-wrappers';
import { useAuth } from '../src/features/auth/context';
import { getPrimaryRoleBlueprint } from '../src/features/navigation/role-blueprints';
import { getJourneyByRole } from '../src/features/navigation/role-journeys';
import {
  getMetricBaseline,
  recordJourneyStep,
  startMetricTimer
} from '../src/lib/analytics/ux-metrics';
import { ProtectedPage } from '../src/widgets/shell/protected-page';

type RoleCode = 'learner' | 'teacher' | 'tenant_admin' | 'platform_admin';

const normalizeRole = (role: string): string => {
  const lowered = role.toLowerCase();
  if (lowered === 'student') return 'learner';
  if (lowered === 'admin') return 'tenant_admin';
  return lowered;
};

const widgetCatalog: Array<{
  title: string;
  note: string;
  href: string;
  roles: RoleCode[];
}> = [
  {
    title: 'Continue',
    note: 'Вернуться к последнему модулю обучения',
    href: '/learner/courses',
    roles: ['learner']
  },
  {
    title: 'Deadlines',
    note: 'Проверить задания и тесты на неделе',
    href: '/assessment',
    roles: ['learner']
  },
  {
    title: 'Attempts',
    note: 'История попыток и результаты',
    href: '/assessment',
    roles: ['learner']
  },
  {
    title: 'Docs',
    note: 'Учебные документы и регламенты',
    href: '/documents',
    roles: ['learner']
  },
  {
    title: 'Notifications',
    note: 'Непрочитанные сообщения и объявления',
    href: '/notifications',
    roles: ['learner']
  },
  {
    title: 'Webinar',
    note: 'Предстоящие вебинары и эфиры',
    href: '/webinars',
    roles: ['learner']
  },
  {
    title: 'Teacher grading center',
    note: 'Проверка работ, rubric и обратная связь',
    href: '/teacher/grading-center',
    roles: ['teacher']
  },
  {
    title: 'Admin cockpit',
    note: 'Sessions, queue, integrations, audit health',
    href: '/admin/cockpit',
    roles: ['tenant_admin', 'platform_admin']
  }
];

export default function DashboardPage() {
  const { session, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    startMetricTimer('time_to_start_learning');
  }, []);

  useEffect(() => {
    if (loading || !session) return;
    const roles = new Set((session.roles ?? []).map(normalizeRole));
    if (roles.has('learner')) {
      router.replace('/learner');
    }
  }, [loading, router, session]);

  const role = useMemo(() => getPrimaryRoleBlueprint(session ?? null), [session]);

  const visibleCards = useMemo(() => {
    const roles = new Set((session?.roles ?? []).map(normalizeRole));
    return widgetCatalog.filter((widget) => widget.roles.some((r) => roles.has(r)));
  }, [session?.roles]);

  const journey = useMemo(() => getJourneyByRole(role?.role), [role]);

  const baselineCount = getMetricBaseline().length;

  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader
          title="Панель LMS"
          subtitle="RBAC-видимость: student dashboard, teacher grading center и admin cockpit"
        />
        <SectionCard title="Приоритеты на сегодня">
          <div className="ui-dashboard-grid">
            {visibleCards.map((item) => (
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
        {journey ? (
          <SectionCard title={journey.title}>
            <p className="ui-prose-muted ui-prose-muted--tight">{journey.description}</p>
            <ol className="ui-ordered-list">
              {journey.steps.map((step) => (
                <li key={step.id}>
                  <Link
                    href={step.href}
                    onClick={() =>
                      recordJourneyStep(
                        role?.role ?? 'learner',
                        'primary_flow',
                        step.metricStep,
                        'success'
                      )
                    }
                  >
                    {step.label}
                  </Link>
                </li>
              ))}
            </ol>
          </SectionCard>
        ) : null}
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
