'use client';

import { LoadingState, StatusChip } from '@trudskill/ui';
import Link from 'next/link';
import { useEffect, useMemo } from 'react';

import { type EnrollmentCertsBundle, useEnrollmentCertificatesForCompleted } from './hooks';
import { ListSkeleton } from './screen-helpers';
import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../components/state-wrappers';
import { completeMetricTimer, startMetricTimer } from '../../lib/analytics/ux-metrics';
import { frontendEnv } from '../../lib/config/env';
import { CourseViewerScreen } from '../course-viewer/course-viewer-screen';
import { useLearnerHomeData } from '../learner-home/use-learner-home-data';

import type { EnrollmentCertificateRow } from './types';

const resolveCertificateDownloadHref = (downloadPath: string): string => {
  try {
    const apiRoot = new URL(frontendEnv.NEXT_PUBLIC_API_BASE_URL);
    return `${apiRoot.origin}${downloadPath}`;
  } catch {
    return downloadPath;
  }
};

export const LearnerCoursesScreen = () => {
  const { data, isLoading, error } = useLearnerHomeData();

  const completedEnrollmentIds = useMemo(
    () => data.filter((e) => e.enrollment.status === 'completed').map((e) => e.enrollment.id),
    [data]
  );

  const certsQuery = useEnrollmentCertificatesForCompleted(completedEnrollmentIds);
  const certLoading = certsQuery.isLoading;

  return (
    <PageContainer>
      <PageHeader
        title="Мои курсы"
        subtitle="Ваши назначения — открывайте курс и продолжайте обучение"
      />
      <SectionCard title="Назначенные курсы">
        {error ? <SectionError message={error} /> : null}
        {isLoading ? <ListSkeleton lines={5} /> : null}
        {!isLoading && !error && data.length ? (
          <ul className="course-grid">
            {data.map((entry) => {
              const courseId = entry.enrollment.courseId;
              const title = entry.course?.title ?? `Курс ${courseId ?? entry.enrollment.id}`;
              const percent =
                entry.progress.length === 0
                  ? 0
                  : Math.round(
                      entry.progress.reduce((acc, p) => acc + p.progressPercent, 0) /
                        entry.progress.length
                    );
              const href = `/learner/courses/${courseId ?? entry.enrollment.id}`;
              const ctaLabel =
                entry.enrollment.status === 'completed'
                  ? 'Открыть курс'
                  : percent > 0
                    ? 'Продолжить'
                    : 'Начать';
              return (
                <li key={entry.enrollment.id} className="course-card">
                  <span className="course-card__banner" aria-hidden />
                  <div className="course-card__head">
                    <h3 className="course-card__title">{title}</h3>
                    <StatusChip status={entry.enrollment.status} />
                  </div>
                  <div className="course-card__body">
                    <progress max={100} value={percent} aria-label={`Прогресс по курсу ${title}`} />
                    <div className="course-card__meta">
                      <span>Прогресс курса</span>
                      <span className="course-card__percent">{percent}%</span>
                    </div>
                    <Link href={href} className="ui-button ui-button--primary course-card__cta">
                      {ctaLabel}
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
        {!isLoading && !error && !data.length ? (
          <SectionEmpty
            message="Нет назначенных курсов"
            hint="Если вы ожидаете обучение, обратитесь к куратору или администратору учебного центра — вас ещё не зачислили в группу или курс."
          />
        ) : null}
      </SectionCard>
      <SectionCard title="Сертификаты по завершённым программам">
        {!completedEnrollmentIds.length ? (
          <SectionEmpty message="Завершите обучение, чтобы получить выпуск документа" />
        ) : null}
        {certLoading ? <LoadingState message="Загрузка списка документов…" /> : null}
        {!certLoading && completedEnrollmentIds.length ? (
          <ul className="ui-stack">
            {(certsQuery.data ?? []).map((row: EnrollmentCertsBundle) =>
              row.items.length ? (
                <li key={row.enrollmentId}>
                  <span className="ui-text-muted">Назначение {row.enrollmentId}</span>
                  <ul>
                    {row.items.map((doc: EnrollmentCertificateRow) => (
                      <li key={doc.id}>
                        <a
                          href={resolveCertificateDownloadHref(doc.downloadUrl)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {doc.name}
                        </a>{' '}
                        ({doc.documentType})
                      </li>
                    ))}
                  </ul>
                </li>
              ) : (
                <li key={row.enrollmentId}>
                  Назначение {row.enrollmentId}: документов пока нет (проверьте привязку шаблона в
                  разделе «Документы»).
                </li>
              )
            )}
          </ul>
        ) : null}
      </SectionCard>
    </PageContainer>
  );
};

export const LearnerCourseDetailsScreen = ({ id }: { id: string }) => {
  useEffect(() => {
    startMetricTimer('time_to_start_learning');
    completeMetricTimer('time_to_start_learning', {
      source: 'learner_course_viewer',
      courseId: id
    });
  }, [id]);

  return <CourseViewerScreen courseId={id} />;
};

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
