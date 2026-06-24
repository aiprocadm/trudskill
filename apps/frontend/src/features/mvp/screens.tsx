'use client';

import { DataTable, FilterBar, LoadingState, StatusChip } from '@cdoprof/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, type ReactElement, useEffect, useMemo, useRef, useState } from 'react';

import { showActAsLearnerAction, showOpenLearnerRegistryAction } from './assessment-permissions';
import {
  type EnrollmentCertsBundle,
  useAssignmentReviews,
  useAssignmentSubmissions,
  useAssignments,
  useAttempts,
  useCommission,
  useCommissions,
  useCounterpartiesList,
  useCounterparty,
  useCourse,
  useCourseDocumentSet,
  useCourseVersions,
  useCoursesList,
  useDirectionsList,
  useDocumentTemplates,
  useDomainMutations,
  useEnrollmentCertificatesForCompleted,
  useEnrollments,
  useExamResults,
  useGroup,
  useGroupCourses,
  useGroupsList,
  useLearner,
  useLearnerCourseProgress,
  useLearnerCourses,
  useMaterials,
  useModules,
  useQuestionBanks,
  useRegulatoryActs,
  useRoles,
  useTests,
  useUser,
  useUserRoles,
  useUserSessions,
  useUsersList
} from './hooks';
import { FieldError, FormErrorSummary, useFocusFirstError } from '../../components/form-feedback';
import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../components/state-wrappers';
import {
  completeMetricTimer,
  recordMetric,
  startMetricTimer
} from '../../lib/analytics/ux-metrics';
import { ApiClientError } from '../../lib/api/client';
import { frontendEnv } from '../../lib/config/env';
import { hasPermission } from '../../lib/rbac/permissions';
import { useAuth } from '../auth/context';
import { CourseViewerScreen } from '../course-viewer/course-viewer-screen';
import { useOtTrainingPrograms } from '../gov-export/hooks';
import { IssueOrderModal } from '../group-orders/issue-order-modal';
import { useLearnerHomeData } from '../learner-home/use-learner-home-data';
import { LearnerPdfCardSections } from '../learner-pdf-card/learner-pdf-card-sections';
import { proctoringApi } from '../proctoring/api';
import { scormApi } from '../scorm/api';

import type {
  AssignmentSubmission,
  Attempt,
  Commission,
  CommissionMember,
  CommissionMemberRole,
  CommissionStatus,
  CourseDocumentSetEntryDraft,
  CourseVersion,
  EnrollmentCertificateRow,
  ExamResult,
  FinalAssessmentForm,
  LearnerCategory,
  ProgramMetaPatch,
  StudyForm,
  TrainingType
} from './types';
import type { ScormPackageDto } from '../scorm/types';
import type { Column } from '@cdoprof/ui';

const resolveCertificateDownloadHref = (downloadPath: string): string => {
  try {
    const apiRoot = new URL(frontendEnv.NEXT_PUBLIC_API_BASE_URL);
    return `${apiRoot.origin}${downloadPath}`;
  } catch {
    return downloadPath;
  }
};

const STATUS_OPTIONS = [
  'active',
  'blocked',
  'draft',
  'archived',
  'published',
  'pending',
  'suspended',
  'completed',
  'cancelled'
] as const;

const RegistryControls = ({
  q,
  setQ,
  status,
  setStatus
}: {
  q: string;
  setQ: (v: string) => void;
  status: string;
  setStatus: (v: string) => void;
}) => (
  <FilterBar>
    <input
      placeholder="Поиск"
      value={q}
      onChange={(event) => setQ(event.target.value)}
      aria-label="Поиск"
    />
    <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Статус">
      <option value="">Все статусы</option>
      {STATUS_OPTIONS.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  </FilterBar>
);

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

const PaginationControls = ({
  page,
  setPage,
  total,
  pageSize
}: {
  page: number;
  setPage: (page: number) => void;
  total: number | undefined;
  pageSize: number;
}) => {
  const canPrev = page > 1;
  const canNext = total ? page * pageSize < total : true;
  return (
    <div className="ui-inline">
      <button type="button" disabled={!canPrev} onClick={() => setPage(page - 1)}>
        Назад
      </button>
      <span>Страница {page}</span>
      <button type="button" disabled={!canNext} onClick={() => setPage(page + 1)}>
        Далее
      </button>
    </div>
  );
};

const readApiMessage = (error: unknown) => {
  if (error instanceof ApiClientError) return error.normalized.message;
  if (error instanceof Error) return error.message;
  return 'Не удалось выполнить действие';
};

const ProgressBar = ({ value }: { value: number }) => (
  <div className="ui-stack" style={{ gap: 4 }}>
    <progress max={100} value={value} />
    <small className="ui-text-muted">{value}%</small>
  </div>
);

const ListSkeleton = ({ lines = 4 }: { lines?: number }) => (
  <div className="ui-skeleton-block" aria-hidden>
    {Array.from({ length: lines }, (_, i) => (
      <div key={i} className="ui-skeleton-line" style={{ width: `${70 + (i % 3) * 10}%` }} />
    ))}
  </div>
);

const MutationError = ({ message }: { message: string | null }) =>
  message ? <SectionError message={message} /> : null;

const toTableRows = <T extends object>(rows: T[]): Record<string, unknown>[] =>
  rows as unknown as Record<string, unknown>[];

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
        {loading ? <LoadingState message="Загрузка списка пользователей…" /> : null}
        {error ? <SectionError message={error} /> : null}
        {data?.items.length ? (
          <DataTable
            stickyFirstColumn
            columns={[
              { key: 'displayName', title: 'ФИО' },
              { key: 'login', title: 'Логин' },
              { key: 'status', title: 'Статус' }
            ]}
            rows={toTableRows(data.items)}
          />
        ) : null}
        {!loading && !error && !data?.items.length ? (
          <SectionEmpty message="Нет пользователей" />
        ) : null}
        <div className="ui-stack" style={{ gap: 8 }}>
          {data?.items.map((user) => (
            <div key={user.id} className="ui-inline">
              <Link href={`/users/${user.id}`}>Открыть карточку {user.displayName}</Link>
              <StatusChip status={user.status} />
              {!canManage ? <small>Только просмотр</small> : null}
            </div>
          ))}
        </div>
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
            <p>
              {user.displayName} ({user.login})
            </p>
            <p>Tenant: {user.tenantId}</p>
            <StatusChip status={user.status} />
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
            <button disabled={!canManageRoles} onClick={() => void onSaveRoles()}>
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
                    <button key={row.id} type="button" onClick={() => void revokeSession(row.id)}>
                      Revoke {row.id}
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

export const LearnerDetailsScreen = ({ id }: { id: string }) => {
  const { data: learner, loading, error, refetch } = useLearner(id);
  const { data: enrollmentPage, loading: enrollmentsLoading } = useLearnerCourses(id);
  const enrollments = enrollmentPage?.items ?? [];

  return (
    <PageContainer>
      <PageHeader
        title="Карточка слушателя"
        actions={<Link href="/learners">← Реестр слушателей</Link>}
      />
      {loading ? <LoadingState message="Загрузка…" /> : null}
      {error ? <SectionError message={error} onRetry={() => void refetch()} /> : null}
      {learner ? (
        <>
          <SectionCard title="Основные данные">
            <div className="ui-inline" style={{ justifyContent: 'space-between' }}>
              <div>
                <p className="profile-name">{`${learner.lastName} ${learner.firstName}`.trim()}</p>
                <p className="ui-text-muted" style={{ margin: '2px 0 0', fontSize: 13 }}>
                  ID: {learner.id}
                </p>
              </div>
              <StatusChip status={learner.status} />
            </div>
            <dl className="kv-list">
              <div className="kv-list__row">
                <dt>Код (learnerNo)</dt>
                <dd>{learner.learnerNo ?? '—'}</dd>
              </div>
              <div className="kv-list__row">
                <dt>Email</dt>
                <dd>{learner.email ?? '—'}</dd>
              </div>
              <div className="kv-list__row">
                <dt>Подразделение</dt>
                <dd>{learner.organizationUnitId ?? '—'}</dd>
              </div>
              <div className="kv-list__row">
                <dt>Связанный IAM user</dt>
                <dd>{learner.linkedIamUserId ?? '—'}</dd>
              </div>
            </dl>
          </SectionCard>
          <SectionCard title="Зачисления">
            {enrollmentsLoading ? <LoadingState message="Загрузка зачислений…" /> : null}
            {!enrollmentsLoading && enrollments.length === 0 ? (
              <SectionEmpty message="Нет зачислений для этого слушателя" />
            ) : null}
            {!enrollmentsLoading && enrollments.length > 0 ? (
              <DataTable
                columns={[
                  { key: 'courseId', title: 'Курс (id)' },
                  { key: 'groupId', title: 'Группа' },
                  { key: 'status', title: 'Статус' },
                  { key: 'enrolledAt', title: 'Зачислен' }
                ]}
                rows={enrollments.map((e) => ({
                  courseId: e.courseId ?? '—',
                  groupId: e.groupId,
                  status: e.status,
                  enrolledAt: e.enrolledAt
                }))}
              />
            ) : null}
          </SectionCard>
          {/* Pillar A Plan C §5.11 — личное дело: учебная история + документы + PDF stub */}
          <LearnerPdfCardSections learnerId={id} />
        </>
      ) : null}
    </PageContainer>
  );
};

export const CounterpartiesPageScreen = () => {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const { data, loading, error } = useCounterpartiesList({
    q,
    status,
    page,
    page_size: 20,
    sort: 'name:asc'
  });

  return (
    <PageContainer>
      <PageHeader title="Контрагенты" />
      <SectionCard title="Реестр контрагентов">
        <RegistryControls q={q} setQ={setQ} status={status} setStatus={setStatus} />
        {loading ? <LoadingState message="Загрузка…" /> : null}
        {error ? <SectionError message={error} /> : null}
        <div style={{ display: 'grid', gap: 8 }}>
          {data?.items.map((item) => (
            <Link key={item.id} href={`/counterparties/${item.id}`}>
              {item.name} ({item.code})
            </Link>
          ))}
        </div>
        {!loading && !error && !data?.items.length ? (
          <SectionEmpty message="Нет контрагентов" />
        ) : null}
        <PaginationControls page={page} setPage={setPage} total={data?.total} pageSize={20} />
      </SectionCard>
    </PageContainer>
  );
};

export const CounterpartyDetailsScreen = ({ id }: { id: string }) => {
  const { data, loading, error } = useCounterparty(id);
  return (
    <PageContainer>
      <PageHeader title="Карточка контрагента" />
      {loading ? <LoadingState message="Загрузка…" /> : null}
      {error ? <SectionError message={error} /> : null}
      {data ? (
        <>
          <SectionCard title="Общие данные">
            <p>{data.name}</p>
            <p>Код: {data.code}</p>
            <StatusChip status={data.status} />
          </SectionCard>
          <SectionCard title="Контакты">
            <SectionEmpty message="Контактные данные будут отображаться при расширении API." />
          </SectionCard>
        </>
      ) : null}
    </PageContainer>
  );
};

export const DirectionsPageScreen = () => {
  const { data, loading, error } = useDirectionsList({ page: 1, page_size: 20, sort: 'name:asc' });
  return (
    <PageContainer>
      <PageHeader title="Направления" />
      <SectionCard title="Реестр направлений">
        {loading ? <LoadingState message="Загрузка…" /> : null}
        {error ? <SectionError message={error} /> : null}
        <ul>
          {data?.items.map((item) => (
            <li key={item.id}>{item.name}</li>
          ))}
        </ul>
      </SectionCard>
    </PageContainer>
  );
};

export const CoursesPageScreen = () => {
  const { session } = useAuth();
  const canCreateCourse = hasPermission(session?.permissions ?? [], 'courses.write');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [directionId, setDirectionId] = useState('');
  const [page, setPage] = useState(1);
  const { data, loading, error } = useCoursesList({
    q,
    status,
    page,
    page_size: 20,
    direction_id: directionId || undefined
  });
  const { data: directions } = useDirectionsList({ page: 1, page_size: 100 });

  return (
    <PageContainer>
      <PageHeader
        title="Курсы"
        actions={
          canCreateCourse ? (
            <Link href="/courses/new">Создать курс</Link>
          ) : (
            <small>Недостаточно прав для создания курса</small>
          )
        }
      />
      <SectionCard title="Реестр курсов">
        <RegistryControls q={q} setQ={setQ} status={status} setStatus={setStatus} />
        <FilterBar>
          <select value={directionId} onChange={(event) => setDirectionId(event.target.value)}>
            <option value="">Все направления</option>
            {directions?.items.map((direction) => (
              <option key={direction.id} value={direction.id}>
                {direction.name}
              </option>
            ))}
          </select>
        </FilterBar>
        {loading ? <LoadingState message="Загрузка…" /> : null}
        {error ? <SectionError message={error} /> : null}
        <ul>
          {data?.items.map((course) => (
            <li key={course.id}>
              <Link href={`/courses/${course.id}`}>{course.title}</Link>{' '}
              <StatusChip status={course.status} />
            </li>
          ))}
        </ul>
        {!loading && !error && !data?.items.length ? <SectionEmpty message="Нет курсов" /> : null}
        <PaginationControls page={page} setPage={setPage} total={data?.total} pageSize={20} />
      </SectionCard>
    </PageContainer>
  );
};

export const CourseCreateScreen = () => {
  const router = useRouter();
  const { data: directions } = useDirectionsList({ page: 1, page_size: 100 });
  const { saveCourse } = useDomainMutations();
  const DRAFT_KEY = 'lms.course.create.draft.v1';
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [directionId, setDirectionId] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ code?: string; title?: string }>({});
  const codeRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const formErrors = useMemo(
    () =>
      Object.entries(fieldErrors).map(([field, message]) => ({
        field,
        message: message ?? ''
      })),
    [fieldErrors]
  );

  useFocusFirstError(formErrors, {
    code: codeRef.current,
    title: titleRef.current
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        title?: string;
        code?: string;
        description?: string;
        directionId?: string;
      };
      if (parsed.title) setTitle(parsed.title);
      if (parsed.code) setCode(parsed.code);
      if (parsed.description) setDescription(parsed.description);
      if (parsed.directionId) setDirectionId(parsed.directionId);
    } catch {
      // ignore invalid draft
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ title, code, description, directionId, savedAt: Date.now() })
      );
    } catch {
      // ignore storage errors
    }
  }, [title, code, description, directionId]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      setSaveError(null);
      const trimmedCode = code.trim();
      const trimmedTitle = title.trim();
      if (trimmedCode.length < 2) {
        setFieldErrors({ code: 'Код курса: минимум 2 символа' });
        setSaveError('Код курса: минимум 2 символа');
        recordMetric('form_error_rate', 1, { form: 'course_create', field: 'code' });
        return;
      }
      if (trimmedTitle.length < 3) {
        setFieldErrors({ title: 'Название: минимум 3 символа' });
        setSaveError('Название: минимум 3 символа');
        recordMetric('form_error_rate', 1, { form: 'course_create', field: 'title' });
        return;
      }
      setFieldErrors({});
      const payload = directionId
        ? { code: trimmedCode, title: trimmedTitle, description, directionId }
        : { code: trimmedCode, title: trimmedTitle, description };
      const created = await saveCourse(null, payload);
      localStorage.removeItem(DRAFT_KEY);
      router.push(`/courses/${created.id}`);
    } catch (createError) {
      setSaveError(readApiMessage(createError));
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Создание курса"
        subtitle="Шаги: карточка курса -> описание и направление -> проверка -> создание"
      />
      <SectionCard title="Мастер создания">
        <ul className="ui-stepper" aria-label="Этапы создания курса">
          <li className={`ui-step ${step >= 1 ? 'ui-step--active' : ''}`}>Карточка</li>
          <li className={`ui-step ${step >= 2 ? 'ui-step--active' : ''}`}>Описание</li>
          <li className={`ui-step ${step >= 3 ? 'ui-step--active' : ''}`}>Проверка</li>
        </ul>
        <form
          onSubmit={(event) => void onSubmit(event)}
          style={{ display: 'grid', gap: 8, maxWidth: 480 }}
          noValidate
        >
          <FormErrorSummary id="course-create-summary" errors={formErrors} />
          <label htmlFor="course-code" className="ui-field">
            <span className="ui-field-label">Код</span>
            <input
              id="course-code"
              ref={codeRef}
              required
              placeholder="Код"
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
                setStep((curr) => Math.max(curr, 1));
              }}
              aria-invalid={Boolean(fieldErrors.code)}
              aria-describedby={fieldErrors.code ? 'course-code-error' : undefined}
            />
            <FieldError id="course-code-error" message={fieldErrors.code} />
          </label>
          <label htmlFor="course-title" className="ui-field">
            <span className="ui-field-label">Название</span>
            <input
              id="course-title"
              ref={titleRef}
              required
              placeholder="Название"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                setStep((curr) => Math.max(curr, 1));
              }}
              aria-invalid={Boolean(fieldErrors.title)}
              aria-describedby={fieldErrors.title ? 'course-title-error' : undefined}
            />
            <FieldError id="course-title-error" message={fieldErrors.title} />
          </label>
          <textarea
            placeholder="Описание"
            value={description}
            onChange={(event) => {
              setDescription(event.target.value);
              setStep((curr) => Math.max(curr, 2));
            }}
          />
          <select
            value={directionId}
            onChange={(event) => {
              setDirectionId(event.target.value);
              setStep((curr) => Math.max(curr, 2));
            }}
          >
            <option value="">Выберите направление</option>
            {directions?.items.map((direction) => (
              <option key={direction.id} value={direction.id}>
                {direction.name}
              </option>
            ))}
          </select>
          <small className="ui-text-muted">Черновик сохраняется автоматически.</small>
          <button
            type="button"
            className="ui-button ui-button--secondary"
            disabled={!title.trim() || !code.trim()}
            onClick={() => setStep(3)}
          >
            Проверить полноту
          </button>
          {step >= 3 ? (
            <div className="ui-empty">
              Проверка: {title.trim() ? 'название ок' : 'нет названия'},{' '}
              {code.trim() ? 'код ок' : 'нет кода'}
              {directionId ? ', направление выбрано' : ', направление не выбрано'}
            </div>
          ) : null}
          <button type="submit">Создать и открыть карточку</button>
          {saveError ? <SectionError message={saveError} /> : null}
        </form>
      </SectionCard>
    </PageContainer>
  );
};

const TRAINING_TYPE_OPTIONS: Array<{ value: TrainingType; label: string }> = [
  { value: 'primary', label: 'Первичная' },
  { value: 'repeat', label: 'Повторная' },
  { value: 'target', label: 'Целевая' },
  { value: 'extraordinary', label: 'Внеочередная' }
];
const LEARNER_CATEGORY_OPTIONS: Array<{ value: LearnerCategory; label: string }> = [
  { value: 'worker', label: 'Рабочие' },
  { value: 'specialist', label: 'Специалисты' },
  { value: 'manager', label: 'Руководители' },
  { value: 'mixed', label: 'Смешанная' }
];
const STUDY_FORM_OPTIONS: Array<{ value: StudyForm; label: string }> = [
  { value: 'in_person', label: 'Очная' },
  { value: 'distance', label: 'Дистанционная' },
  { value: 'blended', label: 'Смешанная' }
];
const FINAL_ASSESSMENT_OPTIONS: Array<{ value: FinalAssessmentForm; label: string }> = [
  { value: 'test', label: 'Тест' },
  { value: 'exam', label: 'Экзамен' },
  { value: 'defense', label: 'Защита' },
  { value: 'interview', label: 'Собеседование' }
];

const ProgramMetaSection = ({
  courseVersion,
  onUpdated
}: {
  courseVersion: CourseVersion;
  onUpdated: () => void | Promise<void>;
}) => {
  const { data: acts } = useRegulatoryActs();
  const { data: otPrograms } = useOtTrainingPrograms();
  const { data: commissions } = useCommissions('active');
  const { updateCourseVersionProgramMeta, publishCourseVersion } = useDomainMutations();
  const readOnly = courseVersion.status !== 'draft';

  const [academicHours, setAcademicHours] = useState<string>(
    courseVersion.academicHours != null ? String(courseVersion.academicHours) : ''
  );
  const [trainingType, setTrainingType] = useState<TrainingType | ''>(
    courseVersion.trainingType ?? ''
  );
  const [learnerCategory, setLearnerCategory] = useState<LearnerCategory | ''>(
    courseVersion.learnerCategory ?? ''
  );
  const [studyForm, setStudyForm] = useState<StudyForm | ''>(courseVersion.studyForm ?? '');
  const [finalAssessmentForm, setFinalAssessmentForm] = useState<FinalAssessmentForm | ''>(
    courseVersion.finalAssessmentForm ?? ''
  );
  const [regulatoryBasisCodes, setRegulatoryBasisCodes] = useState<string[]>(
    courseVersion.regulatoryBasisCodes ?? []
  );
  const [commissionId, setCommissionId] = useState<string>(courseVersion.commissionId ?? '');
  const [otProgramCodes, setOtProgramCodes] = useState<string[]>(
    courseVersion.otProgramCodes ?? []
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setAcademicHours(
      courseVersion.academicHours != null ? String(courseVersion.academicHours) : ''
    );
    setTrainingType(courseVersion.trainingType ?? '');
    setLearnerCategory(courseVersion.learnerCategory ?? '');
    setStudyForm(courseVersion.studyForm ?? '');
    setFinalAssessmentForm(courseVersion.finalAssessmentForm ?? '');
    setRegulatoryBasisCodes(courseVersion.regulatoryBasisCodes ?? []);
    setCommissionId(courseVersion.commissionId ?? '');
    setOtProgramCodes(courseVersion.otProgramCodes ?? []);
  }, [courseVersion]);

  const buildPayload = (): ProgramMetaPatch => {
    const payload: ProgramMetaPatch = {};
    const hoursNum = Number(academicHours);
    if (academicHours && Number.isFinite(hoursNum) && hoursNum > 0) {
      payload.academicHours = hoursNum;
    }
    if (trainingType) payload.trainingType = trainingType;
    if (learnerCategory) payload.learnerCategory = learnerCategory;
    if (studyForm) payload.studyForm = studyForm;
    if (finalAssessmentForm) payload.finalAssessmentForm = finalAssessmentForm;
    if (regulatoryBasisCodes.length > 0) payload.regulatoryBasisCodes = regulatoryBasisCodes;
    if (commissionId) payload.commissionId = commissionId;
    return { ...payload, ...(otProgramCodes.length > 0 ? { otProgramCodes } : {}) };
  };

  const onSave = async () => {
    setBusy(true);
    setError(null);
    try {
      await updateCourseVersionProgramMeta(courseVersion.id, buildPayload());
      await onUpdated();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось сохранить параметры');
    } finally {
      setBusy(false);
    }
  };

  const onPublish = async () => {
    setBusy(true);
    setError(null);
    try {
      await updateCourseVersionProgramMeta(courseVersion.id, buildPayload());
      await publishCourseVersion(courseVersion.id);
      await onUpdated();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось опубликовать');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard title="Нормативные параметры программы (Pillar A)">
      {readOnly ? (
        <p className="ui-text-muted">
          Версия опубликована — параметры доступны только для просмотра.
        </p>
      ) : null}
      <div className="ui-stack" style={{ gap: 12 }}>
        <label>
          Часы (академические)
          <input
            type="number"
            min={1}
            value={academicHours}
            onChange={(e) => setAcademicHours(e.target.value)}
            disabled={readOnly}
          />
        </label>
        <label>
          Вид подготовки
          <select
            value={trainingType}
            onChange={(e) => setTrainingType(e.target.value as TrainingType | '')}
            disabled={readOnly}
          >
            <option value="">— выберите —</option>
            {TRAINING_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Категория обучаемых
          <select
            value={learnerCategory}
            onChange={(e) => setLearnerCategory(e.target.value as LearnerCategory | '')}
            disabled={readOnly}
          >
            <option value="">— выберите —</option>
            {LEARNER_CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Форма обучения
          <select
            value={studyForm}
            onChange={(e) => setStudyForm(e.target.value as StudyForm | '')}
            disabled={readOnly}
          >
            <option value="">— выберите —</option>
            {STUDY_FORM_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Форма аттестации
          <select
            value={finalAssessmentForm}
            onChange={(e) => setFinalAssessmentForm(e.target.value as FinalAssessmentForm | '')}
            disabled={readOnly}
          >
            <option value="">— выберите —</option>
            {FINAL_ASSESSMENT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Нормативные акты (множественный выбор)
          <select
            multiple
            value={regulatoryBasisCodes}
            onChange={(e) =>
              setRegulatoryBasisCodes(Array.from(e.target.selectedOptions, (o) => o.value))
            }
            disabled={readOnly}
            size={6}
          >
            {acts?.items.map((a) => (
              <option key={a.code} value={a.code}>
                {a.shortName} — {a.fullName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Программы реестра ОТ (Минтруд)
          <select
            multiple
            value={otProgramCodes}
            onChange={(e) =>
              setOtProgramCodes(Array.from(e.target.selectedOptions, (o) => o.value))
            }
            disabled={readOnly}
            size={6}
          >
            {otPrograms?.map((p) => (
              <option key={p.code} value={p.code}>
                {p.registryId}. {p.exactName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Аттестационная комиссия
          <select
            value={commissionId}
            onChange={(e) => setCommissionId(e.target.value)}
            disabled={readOnly}
          >
            <option value="">— выберите комиссию —</option>
            {commissions?.items.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>
        </label>
        {error ? <FieldError id="program-meta-error" message={error} /> : null}
        {!readOnly ? (
          <div className="ui-inline" style={{ gap: 8 }}>
            <button
              type="button"
              className="ui-button"
              disabled={busy}
              onClick={() => void onSave()}
            >
              Сохранить черновик
            </button>
            <button
              type="button"
              className="ui-button"
              disabled={busy}
              onClick={() => void onPublish()}
            >
              Опубликовать версию
            </button>
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
};

const DocumentSetSection = ({
  courseVersion,
  onUpdated
}: {
  courseVersion: CourseVersion;
  onUpdated: () => void | Promise<void>;
}) => {
  const { data: existing, refetch: refetchSet } = useCourseDocumentSet(courseVersion.id);
  const { data: templates } = useDocumentTemplates();
  const { setCourseDocumentSet } = useDomainMutations();

  const [draft, setDraft] = useState<CourseDocumentSetEntryDraft[]>([]);
  const [nextTemplate, setNextTemplate] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (existing) {
      setDraft(
        existing.items
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((e) => ({
            templateId: e.templateId,
            position: e.position,
            isRequired: e.isRequired,
            autoIssueOnCompletion: e.autoIssueOnCompletion
          }))
      );
    }
  }, [existing]);

  const renumber = (arr: CourseDocumentSetEntryDraft[]): CourseDocumentSetEntryDraft[] =>
    arr.map((e, i) => ({ ...e, position: i }));

  const addEntry = (templateId: string) => {
    if (!templateId) return;
    setDraft((prev) =>
      renumber([
        ...prev,
        {
          templateId,
          position: prev.length,
          isRequired: true,
          autoIssueOnCompletion: true
        }
      ])
    );
  };

  const move = (idx: number, delta: number) => {
    setDraft((prev) => {
      const newIdx = idx + delta;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const arr = [...prev];
      const cur = arr[idx];
      const target = arr[newIdx];
      if (!cur || !target) return prev;
      arr[idx] = target;
      arr[newIdx] = cur;
      return renumber(arr);
    });
  };

  const removeEntry = (idx: number) => {
    setDraft((prev) => renumber(prev.filter((_, i) => i !== idx)));
  };

  const toggleField = (idx: number, field: 'isRequired' | 'autoIssueOnCompletion') => {
    setDraft((prev) => prev.map((e, i) => (i === idx ? { ...e, [field]: !e[field] } : e)));
  };

  const onSave = async () => {
    setBusy(true);
    setError(null);
    try {
      await setCourseDocumentSet(courseVersion.id, draft);
      await refetchSet();
      await onUpdated();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось сохранить пакет');
    } finally {
      setBusy(false);
    }
  };

  const templateNameById: Record<string, { name: string; templateType: string }> = {};
  templates?.items.forEach((t) => {
    templateNameById[t.id] = { name: t.name, templateType: t.templateType };
  });

  return (
    <SectionCard title="Выходные документы курса (пакет, Pillar A)">
      <p className="ui-text-muted" style={{ marginBottom: 8 }}>
        Документы выпускаются по порядку при завершении зачисления. Шаблоны привязаны к tenant.
      </p>
      {draft.length === 0 ? <SectionEmpty message="Пакет ещё не настроен" /> : null}
      {draft.map((entry, idx) => {
        const info = templateNameById[entry.templateId];
        return (
          <div
            key={`${entry.templateId}_${idx}`}
            className="ui-inline"
            style={{ gap: 8, padding: '6px 0', borderBottom: '1px solid var(--ui-border, #eee)' }}
          >
            <strong>{idx + 1}.</strong>
            <span>{info?.name ?? `(${entry.templateId} — не найден)`}</span>
            <span className="ui-text-muted">{info?.templateType}</span>
            <label>
              <input
                type="checkbox"
                checked={entry.isRequired}
                onChange={() => toggleField(idx, 'isRequired')}
              />{' '}
              Обязательный
            </label>
            <label>
              <input
                type="checkbox"
                checked={entry.autoIssueOnCompletion}
                onChange={() => toggleField(idx, 'autoIssueOnCompletion')}
              />{' '}
              Авто-выпуск
            </label>
            <button
              type="button"
              className="ui-button-link"
              onClick={() => move(idx, -1)}
              disabled={idx === 0}
            >
              ↑
            </button>
            <button
              type="button"
              className="ui-button-link"
              onClick={() => move(idx, 1)}
              disabled={idx === draft.length - 1}
            >
              ↓
            </button>
            <button type="button" className="ui-button-link" onClick={() => removeEntry(idx)}>
              Удалить
            </button>
          </div>
        );
      })}

      <div className="ui-inline" style={{ gap: 8, marginTop: 8 }}>
        <select value={nextTemplate} onChange={(e) => setNextTemplate(e.target.value)}>
          <option value="">— выберите шаблон —</option>
          {templates?.items.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.templateType})
            </option>
          ))}
        </select>
        <button
          type="button"
          className="ui-button"
          onClick={() => {
            if (nextTemplate) {
              addEntry(nextTemplate);
              setNextTemplate('');
            }
          }}
          disabled={!nextTemplate}
        >
          Добавить в пакет
        </button>
      </div>

      {error ? <FieldError id="document-set-error" message={error} /> : null}
      <div className="ui-inline" style={{ gap: 8, marginTop: 12 }}>
        <button type="button" className="ui-button" disabled={busy} onClick={() => void onSave()}>
          Сохранить пакет
        </button>
      </div>
    </SectionCard>
  );
};

export const CourseDetailsScreen = ({ id }: { id: string }) => {
  const { session } = useAuth();
  const { data: course, refetch } = useCourse(id);
  const { data: versions, refetch: refetchVersions } = useCourseVersions(id);
  const latestVersionId = versions?.items[versions.items.length - 1]?.id;
  const latestVersion = versions?.items[versions.items.length - 1];
  const { data: modules, refetch: refetchModules } = useModules(latestVersionId);
  const [selectedModuleId, setSelectedModuleId] = useState<string>('');
  const { data: materials, refetch: refetchMaterials } = useMaterials(selectedModuleId);
  const { publishCourse, archiveCourse, createCourseVersion, saveModule, saveMaterial } =
    useDomainMutations();
  const [moduleTitle, setModuleTitle] = useState('');
  const [materialTitle, setMaterialTitle] = useState('');
  const [materialType, setMaterialType] = useState<
    'text' | 'video' | 'file' | 'external_url' | 'scorm'
  >('text');
  const [scormPackageId, setScormPackageId] = useState<string>('');
  const [scormPackages, setScormPackages] = useState<ScormPackageDto[]>([]);
  const [scormPackagesLoaded, setScormPackagesLoaded] = useState(false);
  const [scormPackagesError, setScormPackagesError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const canPublish = hasPermission(session?.permissions ?? [], 'courses.publish');
  const canArchive = hasPermission(session?.permissions ?? [], 'courses.archive');

  useEffect(() => {
    if (modules?.items?.length && !selectedModuleId) {
      setSelectedModuleId(modules.items[0]?.id ?? '');
    }
  }, [modules, selectedModuleId]);

  // Lazy-load ready SCORM packages when the scorm material type is first selected
  useEffect(() => {
    if (materialType !== 'scorm' || scormPackagesLoaded || !session) return;
    scormApi
      .list(session)
      .then((resp) => {
        setScormPackages(resp.items.filter((p) => p.packageStatus === 'ready'));
        setScormPackagesLoaded(true);
        setScormPackagesError(null);
      })
      .catch(() => {
        setScormPackagesLoaded(true);
        setScormPackagesError('Не удалось загрузить SCORM-пакеты');
      });
  }, [materialType, scormPackagesLoaded, session]);

  return (
    <PageContainer>
      <PageHeader title={course?.title ?? 'Карточка курса'} />
      <SectionCard title="Общие данные">
        <p>Код: {course?.code}</p>
        <StatusChip status={course?.status ?? 'draft'} />
        <div style={{ display: 'flex', gap: 8 }}>
          {canPublish ? (
            <button
              disabled={!latestVersionId || !modules?.items?.length || !materials?.items?.length}
              onClick={() =>
                void publishCourse(id)
                  .then(refetch)
                  .catch((publishError) => setSaveError(readApiMessage(publishError)))
              }
            >
              Опубликовать
            </button>
          ) : null}
          {canArchive ? (
            <button
              onClick={() =>
                void archiveCourse(id)
                  .then(refetch)
                  .catch((archiveError) => setSaveError(readApiMessage(archiveError)))
              }
            >
              Архивировать
            </button>
          ) : null}
        </div>
        {!latestVersionId || !modules?.items?.length || !materials?.items?.length ? (
          <p className="ui-text-muted">
            Для публикации курса требуется минимум 1 версия, 1 модуль и 1 материал.
          </p>
        ) : null}
        <MutationError message={saveError} />
      </SectionCard>
      <SectionCard title="Версии курса">
        <button onClick={() => void createCourseVersion(id).then(refetchVersions)}>
          Добавить версию
        </button>
        <ul>
          {versions?.items.map((item) => (
            <li key={item.id}>
              v{item.versionNo} ({item.status})
            </li>
          ))}
        </ul>
      </SectionCard>
      {latestVersion ? (
        <>
          <ProgramMetaSection
            courseVersion={latestVersion}
            onUpdated={async () => {
              await refetchVersions();
            }}
          />
          <DocumentSetSection
            courseVersion={latestVersion}
            onUpdated={async () => {
              await refetchVersions();
            }}
          />
        </>
      ) : null}
      <SectionCard title="Модули">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!latestVersionId || !moduleTitle.trim()) return;
            void saveModule(null, {
              courseVersionId: latestVersionId,
              title: moduleTitle.trim(),
              minViewSeconds: 0,
              isRequired: true
            })
              .then(() => {
                setModuleTitle('');
                return refetchModules();
              })
              .catch((moduleError) => setSaveError(readApiMessage(moduleError)));
          }}
          style={{ display: 'flex', gap: 8, marginBottom: 8 }}
        >
          <input
            value={moduleTitle}
            onChange={(event) => setModuleTitle(event.target.value)}
            placeholder="Название модуля"
          />
          <button type="submit" disabled={!latestVersionId}>
            Добавить модуль
          </button>
        </form>
        <ul>
          {modules?.items.map((item) => (
            <li key={item.id}>
              {item.sortOrder + 1}. {item.title} ({item.minViewSeconds}s)
            </li>
          ))}
        </ul>
      </SectionCard>
      <SectionCard title="Материалы модуля">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!selectedModuleId || !materialTitle.trim()) return;
            void saveMaterial(null, {
              moduleId: selectedModuleId,
              title: materialTitle.trim(),
              materialType,
              minViewSeconds: materialType === 'scorm' ? 0 : 60,
              isRequired: true,
              ...(materialType === 'scorm' && scormPackageId ? { scormPackageId } : {})
            })
              .then(() => {
                setMaterialTitle('');
                setScormPackageId('');
                return refetchMaterials();
              })
              .catch((materialError) => setSaveError(readApiMessage(materialError)));
          }}
          style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}
        >
          <select
            value={selectedModuleId}
            onChange={(event) => setSelectedModuleId(event.target.value)}
          >
            <option value="">Выберите модуль</option>
            {modules?.items.map((module) => (
              <option key={module.id} value={module.id}>
                {module.title}
              </option>
            ))}
          </select>
          <input
            value={materialTitle}
            onChange={(event) => setMaterialTitle(event.target.value)}
            placeholder="Название материала"
          />
          <select
            value={materialType}
            onChange={(event) => {
              setMaterialType(event.target.value as typeof materialType);
              setScormPackageId('');
            }}
          >
            <option value="text">text</option>
            <option value="video">video</option>
            <option value="file">file</option>
            <option value="external_url">external_url</option>
            <option value="scorm">scorm</option>
          </select>
          {materialType === 'scorm' ? (
            <>
              {scormPackagesError ? (
                <SectionError message={scormPackagesError} />
              ) : (
                <select
                  value={scormPackageId}
                  onChange={(event) => setScormPackageId(event.target.value)}
                >
                  <option value="">— выберите SCORM-пакет —</option>
                  {scormPackages.map((pkg) => (
                    <option key={pkg.id} value={pkg.id}>
                      {pkg.title}
                    </option>
                  ))}
                </select>
              )}
            </>
          ) : null}
          <button
            type="submit"
            disabled={!selectedModuleId || (materialType === 'scorm' && !scormPackageId)}
          >
            Добавить материал
          </button>
        </form>
        <ul>
          {materials?.items.map((item) => (
            <li key={item.id}>
              {item.sortOrder + 1}. {item.title} [{item.materialType}] min_view_seconds=
              {item.minViewSeconds}
            </li>
          ))}
        </ul>
      </SectionCard>
    </PageContainer>
  );
};

export const GroupsPageScreen = () => {
  const { session } = useAuth();
  const canCreateGroup = hasPermission(session?.permissions ?? [], 'groups.write');
  const [page, setPage] = useState(1);
  const { data, loading, error } = useGroupsList({ page, page_size: 20 });
  return (
    <PageContainer>
      <PageHeader
        title="Группы"
        actions={
          canCreateGroup ? (
            <Link href="/groups/new">Создать группу</Link>
          ) : (
            <small>Недостаточно прав для создания группы</small>
          )
        }
      />
      <SectionCard title="Реестр групп">
        {loading ? <LoadingState message="Загрузка…" /> : null}
        {error ? <SectionError message={error} /> : null}
        <ul>
          {data?.items.map((group) => (
            <li key={group.id}>
              <Link href={`/groups/${group.id}`}>{group.name}</Link>
            </li>
          ))}
        </ul>
        {!loading && !error && !data?.items.length ? <SectionEmpty message="Нет групп" /> : null}
        <PaginationControls page={page} setPage={setPage} total={data?.total} pageSize={20} />
      </SectionCard>
    </PageContainer>
  );
};

export const GroupCreateScreen = () => {
  const router = useRouter();
  const { saveGroup } = useDomainMutations();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ code?: string; name?: string }>({});
  const codeRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const formErrors = useMemo(
    () =>
      Object.entries(fieldErrors).map(([field, message]) => ({
        field,
        message: message ?? ''
      })),
    [fieldErrors]
  );

  useFocusFirstError(formErrors, {
    code: codeRef.current,
    name: nameRef.current
  });

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const nextFieldErrors: typeof fieldErrors = {};
    if (code.trim().length < 2) nextFieldErrors.code = 'Код группы: минимум 2 символа.';
    if (name.trim().length < 3) nextFieldErrors.name = 'Название: минимум 3 символа.';
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length) return;

    try {
      const created = await saveGroup(null, {
        code: code.trim(),
        name: name.trim(),
        status: 'draft'
      });
      router.push(`/groups/${created.id}`);
    } catch (createError) {
      setSaveError(readApiMessage(createError));
    }
  };

  return (
    <PageContainer>
      <PageHeader title="Мастер создания группы" />
      <SectionCard title="Основные атрибуты">
        <form
          onSubmit={(event) => void onSubmit(event)}
          style={{ display: 'grid', gap: 8, maxWidth: 480 }}
          noValidate
        >
          <FormErrorSummary id="group-create-summary" errors={formErrors} />
          <label htmlFor="group-code" className="ui-field">
            <span className="ui-field-label">Код</span>
            <input
              id="group-code"
              ref={codeRef}
              required
              placeholder="Код"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              aria-invalid={Boolean(fieldErrors.code)}
              aria-describedby={fieldErrors.code ? 'group-code-error' : undefined}
            />
            <FieldError id="group-code-error" message={fieldErrors.code} />
          </label>
          <label htmlFor="group-name" className="ui-field">
            <span className="ui-field-label">Название</span>
            <input
              id="group-name"
              ref={nameRef}
              required
              placeholder="Название"
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-invalid={Boolean(fieldErrors.name)}
              aria-describedby={fieldErrors.name ? 'group-name-error' : undefined}
            />
            <FieldError id="group-name-error" message={fieldErrors.name} />
          </label>
          <button type="submit">Создать</button>
          {saveError ? <SectionError message={saveError} /> : null}
        </form>
      </SectionCard>
    </PageContainer>
  );
};

export const GroupDetailsScreen = ({ id }: { id: string }) => {
  const { session } = useAuth();
  const { data: group } = useGroup(id);
  const { data: courses } = useCoursesList({ page: 1, page_size: 20 });
  const { data: groupCourses, refetch: refetchCourses } = useGroupCourses(id);
  const { data: enrollments, refetch: refetchEnrollments } = useEnrollments({ group_id: id });
  const { data: progress } = useLearnerCourseProgress(groupCourses?.items[0]?.courseId);
  const { createGroupCourse, createEnrollment } = useDomainMutations();
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [learnerId, setLearnerId] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [issueOrderOpen, setIssueOrderOpen] = useState(false);

  // Pillar A Plan B §5.7: caller отвечает за фильтрацию только completed-enrollment'ов.
  const completedEnrollmentIds = useMemo(
    () => (enrollments?.items ?? []).filter((e) => e.status === 'completed').map((e) => e.id),
    [enrollments]
  );

  const averageProgress = useMemo(() => {
    if (!progress?.items.length) return 0;
    const total = progress.items.reduce((sum, item) => sum + item.progressPercent, 0);
    return Math.round(total / progress.items.length);
  }, [progress]);

  // Карта id→название курса для читаемого списка курсов группы (вместо сырых id).
  const courseTitleById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const course of courses?.items ?? []) map[course.id] = course.title;
    return map;
  }, [courses]);

  return (
    <PageContainer>
      <PageHeader
        title={group?.name ?? 'Карточка группы'}
        actions={
          <button type="button" className="ui-button" onClick={() => setIssueOrderOpen(true)}>
            Сгенерировать приказ
          </button>
        }
      />
      <SectionCard title="Общая информация">
        <dl className="kv-list">
          <div className="kv-list__row">
            <dt>Код</dt>
            <dd>{group?.code ?? '—'}</dd>
          </div>
          <div className="kv-list__row">
            <dt>Статус</dt>
            <dd>
              <StatusChip status={group?.status ?? 'draft'} />
            </dd>
          </div>
        </dl>
      </SectionCard>
      <SectionCard title="Курсы группы">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!selectedCourseId) return;
            void createGroupCourse({ groupId: id, courseId: selectedCourseId })
              .then(() => {
                setSelectedCourseId('');
                return refetchCourses();
              })
              .catch((groupCourseError) => setSaveError(readApiMessage(groupCourseError)));
          }}
          style={{ display: 'flex', gap: 8, marginBottom: 8 }}
        >
          <select
            value={selectedCourseId}
            onChange={(event) => setSelectedCourseId(event.target.value)}
          >
            <option value="">Выберите курс для назначения</option>
            {courses?.items.map((course) => (
              <option key={course.id} value={course.id}>
                {course.title}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="ui-button ui-button--primary"
            disabled={!selectedCourseId}
          >
            Назначить курс
          </button>
        </form>
        <ul className="ui-stack" style={{ gap: 0, listStyle: 'none', padding: 0, margin: 0 }}>
          {groupCourses?.items.map((item) => (
            <li key={item.id} className="ui-list-row">
              {courseTitleById[item.courseId] ?? item.courseId}
            </li>
          ))}
        </ul>
      </SectionCard>
      <SectionCard title="Зачисления и прогресс">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!learnerId.trim()) return;
            void createEnrollment({ groupId: id, learnerId: learnerId.trim() })
              .then(() => {
                setLearnerId('');
                return refetchEnrollments();
              })
              .catch((enrollmentError) => setSaveError(readApiMessage(enrollmentError)));
          }}
          style={{ display: 'flex', gap: 8, marginBottom: 8 }}
        >
          <input
            value={learnerId}
            onChange={(event) => setLearnerId(event.target.value)}
            placeholder="ID слушателя"
          />
          <button
            type="submit"
            className="ui-button ui-button--primary"
            disabled={!learnerId.trim()}
          >
            Зачислить слушателя
          </button>
        </form>
        <ul>
          {enrollments?.items.map((item) => (
            <li key={item.id} className="ui-inline" style={{ gap: 8, flexWrap: 'wrap' }}>
              <span>
                {item.learnerId} — {item.status}
              </span>
              {/* Phase 4 Plan B: per-student proctoring override (PATCH needs learners.write). */}
              {session && hasPermission(session.permissions, 'learners.write') ? (
                <label className="ui-inline" style={{ gap: 4 }}>
                  <span>Прокторинг:</span>
                  <select
                    value={item.proctoringOverride ?? ''}
                    aria-label={`Прокторинг для слушателя ${item.learnerId}`}
                    onChange={(event) => {
                      const value = event.target.value;
                      void proctoringApi
                        .setOverride(session, item.id, {
                          override: value === 'require' || value === 'exempt' ? value : null
                        })
                        .then(() => refetchEnrollments())
                        .catch((overrideError) => setSaveError(readApiMessage(overrideError)));
                    }}
                  >
                    <option value="">наследуется</option>
                    <option value="require">требуется</option>
                    <option value="exempt">освобождён</option>
                  </select>
                </label>
              ) : null}
            </li>
          ))}
        </ul>
        <ProgressBar value={averageProgress} />
        <MutationError message={saveError} />
      </SectionCard>
      <IssueOrderModal
        open={issueOrderOpen}
        groupId={id}
        enrollmentIds={completedEnrollmentIds}
        onClose={() => setIssueOrderOpen(false)}
      />
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
    title="Student dashboard"
    subtitle="Continue / deadlines / attempts / docs / notifications / webinar"
  />
);

export const TeacherGradingCenterScreen = () => (
  <RoleWidgetGrid
    roles={['teacher']}
    title="Teacher grading center"
    subtitle="Очередь проверок, рубрики и контроль отстающих студентов"
  />
);

export const AdminCockpitScreen = () => (
  <RoleWidgetGrid
    roles={['tenant_admin', 'platform_admin']}
    title="Панель администратора"
    subtitle="Сессии · очередь · интеграции · состояние аудита"
  />
);

export const AssessmentDashboardScreen = () => {
  const { session } = useAuth();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [groupId, setGroupId] = useState('');
  const [selectedTestId, setSelectedTestId] = useState('');
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState('');
  const [attemptResult, setAttemptResult] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { startAttempt, getAttemptResult, completeAssignmentReview, updateAssignmentReview } =
    useDomainMutations();
  const {
    data: banks,
    loading: banksLoading,
    error: banksError
  } = useQuestionBanks({
    page: 1,
    page_size: 20,
    q,
    status
  });
  const {
    data: tests,
    loading: testsLoading,
    error: testsError
  } = useTests({
    page: 1,
    page_size: 20,
    q,
    status
  });
  const {
    data: assignments,
    loading: assignmentsLoading,
    error: assignmentsError
  } = useAssignments({
    page: 1,
    page_size: 20,
    group_id: groupId || undefined
  });
  const { data: enrollments } = useEnrollments({
    group_id: groupId || undefined,
    page: 1,
    page_size: 20
  });
  const { data: submissions } = useAssignmentSubmissions({
    page: 1,
    page_size: 50,
    status: 'submitted'
  });
  const {
    data: attempts,
    loading: attemptsLoading,
    error: attemptsError
  } = useAttempts({ page: 1, page_size: 20 });
  const {
    data: examResults,
    loading: examResultsLoading,
    error: examResultsError
  } = useExamResults({ page: 1, page_size: 20 });
  const { data: reviews } = useAssignmentReviews({ page: 1, page_size: 50 });
  const canCrossLearner = showOpenLearnerRegistryAction(session?.permissions);
  const canActAsLearner = showActAsLearnerAction(session?.permissions);

  const submissionColumns: Column<AssignmentSubmission>[] = [
    { key: 'id', title: 'Submission ID' },
    { key: 'assignmentId', title: 'Задание' },
    {
      key: 'learnerId',
      title: 'Слушатель и доступ',
      render: (row) => (
        <span className="ui-stack" style={{ gap: 4 }}>
          <code>{row.learnerId}</code>
          {canCrossLearner ? (
            <Link
              href="/learners"
              data-testid={`assessment-open-learner-sub-${row.id}`}
              title={`ID слушателя: ${row.learnerId}`}
            >
              Реестр слушателя
            </Link>
          ) : null}
          {canActAsLearner ? (
            <span className="ui-text-muted" data-testid={`assessment-act-as-learner-sub-${row.id}`}>
              Отметить за слушателя: запуск попытки / субмиты с learnerId этого зачисления (IAM:
              learners.act_as).
            </span>
          ) : null}
        </span>
      )
    },
    { key: 'status', title: 'Статус' },
    { key: 'submittedAt', title: 'Отправлено' }
  ];

  const attemptsColumns: Column<Attempt>[] = [
    { key: 'id', title: 'Попытка' },
    { key: 'testId', title: 'Тест' },
    { key: 'enrollmentId', title: 'Зачисление' },
    {
      key: 'learnerId',
      title: 'Слушатель и доступ',
      render: (row) => (
        <span className="ui-stack" style={{ gap: 4 }}>
          <code>{row.learnerId}</code>
          {canCrossLearner ? (
            <Link
              href="/learners"
              data-testid={`assessment-open-learner-att-${row.id}`}
              title={`ID слушателя: ${row.learnerId}`}
            >
              Реестр слушателя
            </Link>
          ) : null}
          {canActAsLearner ? (
            <span className="ui-text-muted" data-testid={`assessment-act-as-learner-att-${row.id}`}>
              Сценарий сдачи: выберите зачисление с этим learnerId.
            </span>
          ) : null}
        </span>
      )
    },
    { key: 'status', title: 'Статус' },
    { key: 'startedAt', title: 'Начато' }
  ];

  const examResultColumns: Column<ExamResult>[] = [
    { key: 'id', title: 'Результат' },
    { key: 'testId', title: 'Тест' },
    {
      key: 'learnerId',
      title: 'Слушатель и доступ',
      render: (row) => (
        <span className="ui-stack" style={{ gap: 4 }}>
          <code>{row.learnerId}</code>
          {canCrossLearner ? (
            <Link
              href="/learners"
              data-testid={`assessment-open-learner-exam-${row.id}`}
              title={`ID слушателя: ${row.learnerId}`}
            >
              Реестр слушателя
            </Link>
          ) : null}
          {canActAsLearner ? (
            <span
              className="ui-text-muted"
              data-testid={`assessment-act-as-learner-exam-${row.id}`}
            >
              Результат по строке; делегируйте мутации через актуальное зачисление слушателя.
            </span>
          ) : null}
        </span>
      )
    },
    { key: 'finalScore', title: 'Балл' },
    { key: 'passed', title: 'Зачёт' }
  ];

  const onStartAttempt = async () => {
    if (!selectedTestId || !selectedEnrollmentId || !session) {
      setSaveError('Выберите тест и зачисление');
      return;
    }
    const enrollmentRecord = enrollments?.items.find((e) => e.id === selectedEnrollmentId);
    if (!enrollmentRecord) {
      setSaveError('Не найдено выбранное зачисление (проверьте фильтр group_id)');
      return;
    }
    setSaveError(null);
    setAttemptResult(null);
    startMetricTimer('time_to_submit_assignment');
    try {
      const attempt = await startAttempt({
        testId: selectedTestId,
        enrollmentId: selectedEnrollmentId,
        learnerId: enrollmentRecord.learnerId
      });
      const result = await getAttemptResult(attempt.id);
      setAttemptResult(
        `Попытка ${attempt.id}: score=${result.finalScore}/${result.maxScore}, passed=${result.passed ? 'да' : 'нет'}`
      );
      completeMetricTimer('time_to_submit_assignment', { flow: 'assessment_attempt' });
    } catch (error) {
      setSaveError(readApiMessage(error));
      recordMetric('assignment_submit_dropoff', 1, { flow: 'assessment_attempt' });
    }
  };

  const flowStep = !selectedTestId ? 1 : !selectedEnrollmentId ? 2 : !attemptResult ? 3 : 4;

  return (
    <PageContainer>
      <PageHeader title="Оценивание и контроль знаний" />
      <SectionCard title="Фильтры">
        <FilterBar>
          <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Поиск" />
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Все статусы</option>
            {STATUS_OPTIONS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <input
            value={groupId}
            onChange={(event) => setGroupId(event.target.value)}
            placeholder="Фильтр по group_id"
          />
        </FilterBar>
      </SectionCard>
      <SectionCard title="Банки вопросов">
        {banksLoading ? <LoadingState message="Загрузка банков вопросов..." /> : null}
        {banksError ? <SectionError message={banksError} /> : null}
        <p>Всего: {banks?.total ?? 0}</p>
        {banks?.items.length ? (
          <DataTable
            columns={[
              { key: 'code', title: 'Код' },
              { key: 'title', title: 'Название' }
            ]}
            rows={toTableRows(banks.items)}
          />
        ) : null}
      </SectionCard>
      <SectionCard title="Тесты">
        {testsLoading ? <LoadingState message="Загрузка тестов..." /> : null}
        {testsError ? <SectionError message={testsError} /> : null}
        <p>Всего: {tests?.total ?? 0}</p>
        {tests?.items.length ? (
          <>
            <DataTable
              columns={[
                { key: 'code', title: 'Код' },
                { key: 'title', title: 'Название' },
                { key: 'status', title: 'Статус' }
              ]}
              rows={toTableRows(tests.items)}
            />
            <FilterBar>
              <select
                value={selectedTestId}
                onChange={(event) => setSelectedTestId(event.target.value)}
                aria-label="Выберите тест"
              >
                <option value="">Выберите тест для запуска попытки</option>
                {tests.items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </FilterBar>
          </>
        ) : null}
      </SectionCard>
      <SectionCard title="Назначенные задания">
        {assignmentsLoading ? <LoadingState message="Загрузка назначений..." /> : null}
        {assignmentsError ? <SectionError message={assignmentsError} /> : null}
        <p>Всего: {assignments?.total ?? 0}</p>
        {assignments?.items.length ? (
          <DataTable
            columns={[
              { key: 'id', title: 'ID' },
              { key: 'testId', title: 'Тест' },
              { key: 'groupId', title: 'Группа' },
              { key: 'status', title: 'Статус' }
            ]}
            rows={toTableRows(assignments.items)}
          />
        ) : null}
      </SectionCard>
      <SectionCard title="Сценарий сдачи задания">
        <ol className="ui-stepper">
          <li className={`ui-step ${flowStep > 1 ? 'ui-step--done' : 'ui-step--active'}`}>
            1. Открыть задание
          </li>
          <li
            className={`ui-step ${
              flowStep > 2 ? 'ui-step--done' : flowStep === 2 ? 'ui-step--active' : ''
            }`}
          >
            2. Проверить данные
          </li>
          <li
            className={`ui-step ${
              flowStep > 3 ? 'ui-step--done' : flowStep === 3 ? 'ui-step--active' : ''
            }`}
          >
            3. Отправить
          </li>
          <li className={`ui-step ${flowStep === 4 ? 'ui-step--active' : ''}`}>4. Подтверждение</li>
        </ol>
        <FilterBar>
          <select
            value={selectedEnrollmentId}
            onChange={(event) => setSelectedEnrollmentId(event.target.value)}
            aria-label="Выберите зачисление"
          >
            <option value="">Выберите зачисление</option>
            {enrollments?.items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.id} ({item.status})
              </option>
            ))}
          </select>
          <button type="button" onClick={() => void onStartAttempt()}>
            Запустить попытку и получить результат
          </button>
        </FilterBar>
        <MutationError message={saveError} />
        {attemptResult ? <p>{attemptResult}</p> : null}
        {attemptResult ? (
          <div className="ui-inline">
            <span className="ui-text-muted">Оцените удобство отправки:</span>
            <button
              type="button"
              className="ui-button ui-button--secondary"
              onClick={() =>
                recordMetric('csat_after_submission', 5, { flow: 'assessment_attempt' })
              }
            >
              Хорошо
            </button>
            <button
              type="button"
              className="ui-button"
              onClick={() =>
                recordMetric('csat_after_submission', 2, { flow: 'assessment_attempt' })
              }
            >
              Нужно улучшить
            </button>
          </div>
        ) : null}
      </SectionCard>
      <SectionCard title="Попытки">
        {attemptsLoading ? <LoadingState message="Загрузка попыток…" /> : null}
        {attemptsError ? <SectionError message={attemptsError} /> : null}
        {!attemptsLoading && !attempts?.items?.length ? (
          <SectionEmpty message="Нет попыток в выборке" />
        ) : null}
        {attempts?.items.length ? (
          <DataTable<Attempt> columns={attemptsColumns} rows={attempts.items} />
        ) : null}
      </SectionCard>
      <SectionCard title="Результаты экзаменов">
        {examResultsLoading ? <LoadingState message="Загрузка результатов…" /> : null}
        {examResultsError ? <SectionError message={examResultsError} /> : null}
        {!examResultsLoading && !examResults?.items?.length ? (
          <SectionEmpty message="Нет результатов в выборке" />
        ) : null}
        {examResults?.items.length ? (
          <DataTable<ExamResult> columns={examResultColumns} rows={examResults.items} />
        ) : null}
      </SectionCard>
      <SectionCard title="Очередь проверок преподавателя">
        <p className="ui-text-muted">
          SLA проверки: 48 часов. Заявок в очереди: {submissions?.items.length ?? 0}
        </p>
        {submissions?.items.length ? (
          <DataTable<AssignmentSubmission> columns={submissionColumns} rows={submissions.items} />
        ) : (
          <SectionEmpty message="Новых submissions на проверку нет" />
        )}
      </SectionCard>
      <SectionCard title="Завершение проверок и SLA">
        {reviews?.items.length ? (
          <div className="ui-stack">
            {reviews.items.slice(0, 10).map((review) => (
              <div key={review.id} className="ui-inline">
                <StatusChip status={review.status} />
                <span>{review.id}</span>
                <button
                  type="button"
                  onClick={() =>
                    void completeAssignmentReview(review.id, {
                      score: review.score ?? 80,
                      comment: review.comment ?? 'Проверка завершена в рамках SLA'
                    }).catch((error) => setSaveError(readApiMessage(error)))
                  }
                  disabled={review.status === 'completed'}
                >
                  Завершить
                </button>
                <button
                  type="button"
                  className="ui-button ui-button--secondary"
                  onClick={() =>
                    void updateAssignmentReview(review.id, {
                      reviewStatus: 'in_review',
                      comment: `Апелляция зарегистрирована: ${new Date().toISOString()}`
                    }).catch((error) => setSaveError(readApiMessage(error)))
                  }
                >
                  Зарегистрировать апелляцию
                </button>
              </div>
            ))}
          </div>
        ) : (
          <SectionEmpty message="Проверки отсутствуют" />
        )}
      </SectionCard>
      <SectionCard title="История изменений оценивания">
        {reviews?.items.length ? (
          <DataTable
            columns={[
              { key: 'id', title: 'Review ID' },
              { key: 'status', title: 'Статус' },
              { key: 'score', title: 'Балл' },
              { key: 'comment', title: 'Комментарий' },
              { key: 'updatedAt', title: 'Обновлено' }
            ]}
            rows={toTableRows(reviews.items)}
          />
        ) : (
          <SectionEmpty message="История проверок пока пуста" />
        )}
      </SectionCard>
    </PageContainer>
  );
};

// === Pillar A — Plan A: commissions admin screens ===

const COMMISSION_MEMBER_ROLE_LABELS: Record<CommissionMemberRole, string> = {
  chairman: 'Председатель',
  deputy_chairman: 'Зам. председателя',
  member: 'Член',
  secretary: 'Секретарь',
  external_expert: 'Внешний эксперт'
};

export const CommissionsPageScreen = () => {
  const router = useRouter();
  const [status, setStatus] = useState<CommissionStatus | ''>('active');
  const filterStatus: CommissionStatus | undefined = status === '' ? undefined : status;
  const { data, loading, error, refetch } = useCommissions(filterStatus);
  const { createCommission } = useDomainMutations();

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) {
      setSaveError('Код и название обязательны');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const trimmedDescription = description.trim();
      const payload: { code: string; name: string; description?: string } = {
        code: code.trim(),
        name: name.trim()
      };
      if (trimmedDescription) payload.description = trimmedDescription;
      const created = await createCommission(payload);
      setCode('');
      setName('');
      setDescription('');
      router.push(`/admin/commissions/${created.id}`);
    } catch (err) {
      setSaveError(err instanceof ApiClientError ? err.message : 'Не удалось создать комиссию');
    } finally {
      setSaving(false);
    }
  };

  const commissionColumns: Column<Commission>[] = [
    { key: 'code', title: 'Код' },
    { key: 'name', title: 'Название' },
    {
      key: 'status',
      title: 'Статус',
      render: (row) => <StatusChip status={row.status} />
    },
    {
      key: 'id',
      title: '',
      render: (row) => <Link href={`/admin/commissions/${row.id}`}>Открыть</Link>
    }
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Аттестационные комиссии"
        subtitle="Составы для регулируемого ДПО — подписывают пакеты выходных документов"
      />
      <SectionCard title="Реестр комиссий">
        <div className="ui-inline" style={{ marginBottom: 12 }}>
          <label>
            Статус:&nbsp;
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as CommissionStatus | '')}
            >
              <option value="active">Активные</option>
              <option value="archived">Архивные</option>
              <option value="">Все</option>
            </select>
          </label>
          <button type="button" className="ui-button" onClick={() => void refetch()}>
            Обновить
          </button>
        </div>
        {loading ? <LoadingState message="Загрузка…" /> : null}
        {error ? <SectionError message={error} /> : null}
        {data && data.items.length > 0 ? (
          <DataTable columns={commissionColumns} rows={data.items} />
        ) : null}
        {data && data.items.length === 0 && !loading ? (
          <SectionEmpty message="Комиссии не созданы" hint="Создайте первую комиссию ниже" />
        ) : null}
      </SectionCard>

      <SectionCard title="Создать новую комиссию">
        <form onSubmit={(e) => void onCreate(e)} className="ui-stack">
          <label>
            Код
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="например, OT_2026"
              required
            />
          </label>
          <label>
            Название
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Комиссия по охране труда"
              required
            />
          </label>
          <label>
            Описание (необязательно)
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          {saveError ? <FieldError id="commission-create-error" message={saveError} /> : null}
          <button type="submit" className="ui-button" disabled={saving}>
            {saving ? 'Создаём…' : 'Создать комиссию'}
          </button>
        </form>
      </SectionCard>
    </PageContainer>
  );
};

export const CommissionDetailsScreen = ({ id }: { id: string }) => {
  const { data, loading, error, refetch } = useCommission(id);
  const { updateCommission, archiveCommission, addCommissionMember, removeCommissionMember } =
    useDomainMutations();

  const [role, setRole] = useState<CommissionMemberRole>('member');
  const [externalFullName, setExternalFullName] = useState('');
  const [externalPosition, setExternalPosition] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const [editingInfo, setEditingInfo] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const onStartEditInfo = () => {
    if (!data) return;
    setEditName(data.name);
    setEditDescription(data.description ?? '');
    setEditError(null);
    setEditingInfo(true);
  };

  const onCancelEditInfo = () => {
    setEditingInfo(false);
    setEditError(null);
  };

  const onSaveEditInfo = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedName = editName.trim();
    if (!trimmedName) {
      setEditError('Название не может быть пустым');
      return;
    }
    setSavingEdit(true);
    setEditError(null);
    try {
      const trimmedDescription = editDescription.trim();
      const payload: { name: string; description?: string } = { name: trimmedName };
      if (trimmedDescription) payload.description = trimmedDescription;
      await updateCommission(id, payload);
      await refetch();
      setEditingInfo(false);
    } catch (err) {
      setEditError(err instanceof ApiClientError ? err.message : 'Не удалось сохранить изменения');
    } finally {
      setSavingEdit(false);
    }
  };

  const onAddMember = async (e: FormEvent) => {
    e.preventDefault();
    if (!externalFullName.trim()) {
      setAddError('Введите ФИО члена комиссии');
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      const nextPosition = data?.members.length ?? 0;
      const trimmedPosition = externalPosition.trim();
      const payload: {
        role: CommissionMemberRole;
        externalFullName: string;
        externalPosition?: string;
        positionInOrder: number;
      } = {
        role,
        externalFullName: externalFullName.trim(),
        positionInOrder: nextPosition
      };
      if (trimmedPosition) payload.externalPosition = trimmedPosition;
      await addCommissionMember(id, payload);
      setExternalFullName('');
      setExternalPosition('');
      await refetch();
    } catch (err) {
      setAddError(err instanceof ApiClientError ? err.message : 'Не удалось добавить члена');
    } finally {
      setAdding(false);
    }
  };

  const onArchive = async () => {
    if (!confirm('Заархивировать комиссию? Её нельзя будет привязать к новым курсам.')) return;
    await archiveCommission(id);
    await refetch();
  };

  const onRemove = async (memberId: string) => {
    if (!confirm('Удалить члена комиссии?')) return;
    await removeCommissionMember(id, memberId);
    await refetch();
  };

  const memberColumns: Column<CommissionMember>[] = [
    { key: 'positionInOrder', title: '#' },
    {
      key: 'role',
      title: 'Роль',
      render: (row) => COMMISSION_MEMBER_ROLE_LABELS[row.role]
    },
    { key: 'externalFullName', title: 'ФИО' },
    { key: 'externalPosition', title: 'Должность' },
    {
      key: 'id',
      title: '',
      render: (row) => (
        <button type="button" className="ui-button-link" onClick={() => void onRemove(row.id)}>
          Удалить
        </button>
      )
    }
  ];

  const headerProps: { title: string; subtitle?: string; actions?: ReactElement } = {
    title: data ? data.name : 'Комиссия'
  };
  if (data) headerProps.subtitle = `Код: ${data.code}`;
  if (data && data.status === 'active') {
    headerProps.actions = (
      <button type="button" className="ui-button" onClick={() => void onArchive()}>
        Заархивировать
      </button>
    );
  }

  return (
    <PageContainer>
      <PageHeader {...headerProps} />
      {loading ? <LoadingState message="Загрузка…" /> : null}
      {error ? <SectionError message={error} /> : null}
      {data ? (
        <>
          <SectionCard title="Информация">
            {editingInfo ? (
              <form onSubmit={(e) => void onSaveEditInfo(e)} className="ui-stack">
                <label>
                  Название
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Постоянно действующая аттестационная комиссия"
                    required
                  />
                </label>
                <label>
                  Описание (необязательно)
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="Назначение, область компетенции, особенности работы"
                    rows={3}
                  />
                </label>
                {editError ? (
                  <FieldError id="commission-edit-info-error" message={editError} />
                ) : null}
                <div className="ui-stack" style={{ flexDirection: 'row', gap: '0.5rem' }}>
                  <button type="submit" className="ui-button" disabled={savingEdit}>
                    {savingEdit ? 'Сохранение…' : 'Сохранить'}
                  </button>
                  <button
                    type="button"
                    className="ui-button-link"
                    onClick={onCancelEditInfo}
                    disabled={savingEdit}
                  >
                    Отмена
                  </button>
                </div>
              </form>
            ) : (
              <div className="ui-stack">
                <div>
                  <strong>Код:</strong> {data.code}
                </div>
                <div>
                  <strong>Описание:</strong>{' '}
                  {data.description ? data.description : <em>не задано</em>}
                </div>
                {data.status === 'active' ? (
                  <div>
                    <button type="button" className="ui-button" onClick={onStartEditInfo}>
                      Изменить
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Состав комиссии">
            {data.members.length > 0 ? (
              <DataTable columns={memberColumns} rows={data.members} />
            ) : (
              <SectionEmpty message="Члены комиссии не добавлены" />
            )}
          </SectionCard>

          {data.status === 'active' ? (
            <SectionCard title="Добавить члена">
              <form onSubmit={(e) => void onAddMember(e)} className="ui-stack">
                <label>
                  Роль
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as CommissionMemberRole)}
                  >
                    {Object.entries(COMMISSION_MEMBER_ROLE_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  ФИО
                  <input
                    value={externalFullName}
                    onChange={(e) => setExternalFullName(e.target.value)}
                    placeholder="Иванов Иван Иванович"
                    required
                  />
                </label>
                <label>
                  Должность (необязательно)
                  <input
                    value={externalPosition}
                    onChange={(e) => setExternalPosition(e.target.value)}
                    placeholder="Главный специалист"
                  />
                </label>
                {addError ? (
                  <FieldError id="commission-add-member-error" message={addError} />
                ) : null}
                <button type="submit" className="ui-button" disabled={adding}>
                  {adding ? 'Добавляем…' : 'Добавить'}
                </button>
              </form>
            </SectionCard>
          ) : null}
        </>
      ) : null}
    </PageContainer>
  );
};
