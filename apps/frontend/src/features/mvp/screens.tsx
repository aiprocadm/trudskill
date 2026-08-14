'use client';

import { AsyncSection, DataTable, FilterBar, LoadingState, StatusChip } from '@trudskill/ui';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import {
  type EnrollmentCertsBundle,
  useDirectionsList,
  useDomainMutations,
  useEnrollmentCertificatesForCompleted,
  useRoles,
  useUser,
  useUserRoles,
  useUserSessions,
  useUsersList
} from './hooks';
import { PaginationControls, STATUS_OPTIONS, readApiMessage, toTableRows } from './screen-helpers';
import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../components/state-wrappers';
import { completeMetricTimer, startMetricTimer } from '../../lib/analytics/ux-metrics';
import { frontendEnv } from '../../lib/config/env';
import { hasPermission } from '../../lib/rbac/permissions';
import { useAuth } from '../auth/context';
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

const UsersFilterBar = ({
  q,
  setQ,
  status,
  setStatus,
  role,
  setRole,
  roles
}: {
  q: string;
  setQ: (v: string) => void;
  status: string;
  setStatus: (v: string) => void;
  role: string;
  setRole: (v: string) => void;
  roles: { id: string; code: string; name: string }[] | null | undefined;
}) => (
  <div className="ui-toolbar">
    <FilterBar>
      <input
        placeholder="Поиск"
        value={q}
        onChange={(event) => setQ(event.target.value)}
        aria-label="Поиск"
      />
      <select
        value={status}
        onChange={(event) => setStatus(event.target.value)}
        aria-label="Статус"
      >
        <option value="">Все статусы</option>
        {STATUS_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <select value={role} onChange={(event) => setRole(event.target.value)} aria-label="Роль">
        <option value="">Все роли</option>
        {roles?.map((item) => (
          <option key={item.id} value={item.code}>
            {item.name}
          </option>
        ))}
      </select>
    </FilterBar>
  </div>
);

const ListSkeleton = ({ lines = 4 }: { lines?: number }) => (
  <div className="ui-skeleton-block" aria-hidden>
    {Array.from({ length: lines }, (_, i) => (
      <div key={i} className="ui-skeleton-line" style={{ width: `${70 + (i % 3) * 10}%` }} />
    ))}
  </div>
);

export const UsersPageScreen = () => {
  const { session } = useAuth();
  const canManage = hasPermission(session?.permissions ?? [], 'iam.manage_roles');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const { data, loading, error } = useUsersList({
    q,
    status,
    page,
    page_size: 20,
    sort: role ? `role:${role}` : undefined
  });
  const { data: roles } = useRoles();

  return (
    <PageContainer>
      <PageHeader title="Пользователи" />
      <SectionCard title="Реестр пользователей">
        <UsersFilterBar
          q={q}
          setQ={setQ}
          status={status}
          setStatus={setStatus}
          role={role}
          setRole={setRole}
          roles={roles}
        />
        <AsyncSection
          isLoading={loading}
          error={error ? new Error(error) : undefined}
          isEmpty={!data?.items.length}
          loadingMessage="Загрузка списка пользователей…"
          emptyMessage="Нет пользователей"
        >
          <DataTable
            stickyFirstColumn
            columns={[
              { key: 'displayName', title: 'ФИО' },
              { key: 'login', title: 'Логин' },
              { key: 'status', title: 'Статус' }
            ]}
            rows={toTableRows(data?.items ?? [])}
          />
          <div className="ui-stack" style={{ gap: 8 }}>
            {(data?.items ?? []).map((user) => (
              <div key={user.id} className="ui-inline">
                <Link href={`/users/${user.id}`}>Открыть карточку {user.displayName}</Link>
                <StatusChip status={user.status} />
                {!canManage ? <small>Только просмотр</small> : null}
              </div>
            ))}
          </div>
        </AsyncSection>
        <PaginationControls page={page} setPage={setPage} total={data?.total} pageSize={20} />
      </SectionCard>
    </PageContainer>
  );
};

export const UserDetailsScreen = ({ id }: { id: string }) => {
  const { session } = useAuth();
  const canManageRoles = hasPermission(session?.permissions ?? [], 'iam.manage_roles');
  const { data: user, loading, error, refetch } = useUser(id);
  const { data: userRoles } = useUserRoles(id);
  const { data: allRoles } = useRoles();
  const { data: sessions } = useUserSessions(id);
  const { setUserRoles, revokeSession } = useDomainMutations();
  const [selected, setSelected] = useState<string[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setSelected(userRoles?.map((role) => role.code) ?? []);
  }, [userRoles]);

  const onSaveRoles = async () => {
    try {
      setSaveError(null);
      await setUserRoles(id, selected);
      await refetch();
    } catch (saveActionError) {
      setSaveError(readApiMessage(saveActionError));
    }
  };

  return (
    <PageContainer>
      <PageHeader title="Карточка пользователя" />
      {loading ? <LoadingState message="Загрузка…" /> : null}
      {error ? <SectionError message={error} onRetry={() => void refetch()} /> : null}
      {user ? (
        <>
          <SectionCard title="Основные данные">
            <div className="ui-inline" style={{ justifyContent: 'space-between' }}>
              <p className="profile-name">{user.displayName}</p>
              <StatusChip status={user.status} />
            </div>
            <dl className="kv-list">
              <div className="kv-list__row">
                <dt>Логин</dt>
                <dd>{user.login}</dd>
              </div>
              <div className="kv-list__row">
                <dt>Организация</dt>
                <dd>{user.tenantId}</dd>
              </div>
            </dl>
          </SectionCard>
          <SectionCard title="Роли и права">
            <p>Текущие роли: {userRoles?.map((roleItem) => roleItem.code).join(', ') || '—'}</p>
            <div className="ui-stack" style={{ gap: 8 }}>
              {allRoles?.map((roleItem) => (
                <label key={roleItem.id}>
                  <input
                    disabled={!canManageRoles}
                    type="checkbox"
                    checked={selected.includes(roleItem.code)}
                    onChange={(event) =>
                      setSelected((current) =>
                        event.target.checked
                          ? [...new Set([...current, roleItem.code])]
                          : current.filter((item) => item !== roleItem.code)
                      )
                    }
                  />{' '}
                  {roleItem.name}
                </label>
              ))}
            </div>
            <button
              type="button"
              className="ui-button ui-button--primary"
              disabled={!canManageRoles}
              onClick={() => void onSaveRoles()}
            >
              Сохранить роли
            </button>
            {saveError ? <SectionError message={saveError} /> : null}
          </SectionCard>
          <SectionCard title="Сессии">
            {sessions?.length ? (
              <DataTable
                columns={[
                  { key: 'id', title: 'Session ID' },
                  { key: 'expiresAt', title: 'Истекает' },
                  { key: 'revokedAt', title: 'Отозвана' }
                ]}
                rows={sessions}
              />
            ) : (
              <SectionEmpty message="Активные сессии не найдены" />
            )}
            {canManageRoles ? (
              <div className="ui-inline">
                {sessions
                  ?.filter((row) => !row.revokedAt)
                  .map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      className="ui-button ui-button--ghost"
                      aria-label={`Отозвать сессию ${row.id}`}
                      onClick={() => void revokeSession(row.id)}
                    >
                      Отозвать
                    </button>
                  ))}
              </div>
            ) : null}
          </SectionCard>
        </>
      ) : null}
    </PageContainer>
  );
};

// LearnerDetailsScreen переехал в features/learners/learner-detail-screen.tsx (Фаза 4 срез 2, SCR-001).

export const DirectionsPageScreen = () => {
  const { data, loading, error } = useDirectionsList({ page: 1, page_size: 20, sort: 'name:asc' });
  return (
    <PageContainer>
      <PageHeader title="Направления" />
      <SectionCard title="Реестр направлений">
        <AsyncSection
          isLoading={loading}
          error={error ? new Error(error) : undefined}
          loadingMessage="Загрузка…"
        >
          <ul>
            {(data?.items ?? []).map((item) => (
              <li key={item.id}>{item.name}</li>
            ))}
          </ul>
        </AsyncSection>
      </SectionCard>
    </PageContainer>
  );
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
    title: 'Continue learning',
    note: 'Вернуться к последнему модулю и материалу.',
    href: '/learner/courses',
    allowedRoles: ['learner']
  },
  {
    title: 'Deadlines',
    note: 'Проверить задания и тесты на ближайшие 7 дней.',
    href: '/assessment',
    allowedRoles: ['learner']
  },
  {
    title: 'Attempts',
    note: 'История попыток и результаты оценивания.',
    href: '/assessment',
    allowedRoles: ['learner']
  },
  {
    title: 'Docs',
    note: 'Быстрый доступ к учебным и правовым документам.',
    href: '/documents',
    allowedRoles: ['learner']
  },
  {
    title: 'Notifications',
    note: 'Новые сообщения, объявления и напоминания.',
    href: '/notifications',
    allowedRoles: ['learner']
  },
  {
    title: 'Webinar',
    note: 'Запланированные онлайн-занятия и ссылки на эфир.',
    href: '/learner/webinars',
    allowedRoles: ['learner']
  },
  {
    title: 'Submission queue',
    note: 'Очередь работ студентов, требующих проверки.',
    href: '/assessment',
    allowedRoles: ['teacher']
  },
  {
    title: 'Rubrics',
    note: 'Критерии оценивания и шаблоны комментариев.',
    href: '/assessment',
    allowedRoles: ['teacher']
  },
  {
    title: 'At risk learners',
    note: 'Студенты с низким прогрессом и просрочками.',
    href: '/groups',
    allowedRoles: ['teacher']
  },
  {
    title: 'Sessions',
    note: 'Активные сессии пользователей и подозрительные входы.',
    href: '/users',
    allowedRoles: ['tenant_admin', 'platform_admin']
  },
  {
    title: 'Queue',
    note: 'Очереди задач и интеграционных джобов.',
    href: '/exports',
    allowedRoles: ['tenant_admin', 'platform_admin']
  },
  {
    title: 'Integrations',
    note: 'Статус коннекторов и диагностика синхронизаций.',
    href: '/integrations',
    allowedRoles: ['tenant_admin', 'platform_admin']
  },
  {
    title: 'Audit health',
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
