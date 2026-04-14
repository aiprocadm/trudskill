'use client';

import { DataTable, FilterBar, LoadingState, StatusChip } from '@cdoprof/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useMemo, useState } from 'react';

import {
  useAssignments,
  useCounterpartiesList,
  useCounterparty,
  useCourse,
  useCourseVersions,
  useCoursesList,
  useDirectionsList,
  useDomainMutations,
  useEnrollments,
  useGroup,
  useGroupCourses,
  useGroupsList,
  useLearnerCourseProgress,
  useLearnerCourses,
  useMaterials,
  useModules,
  useQuestionBanks,
  useRoles,
  useTests,
  useUser,
  useUserRoles,
  useUserSessions,
  useUsersList
} from './hooks';
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
import { hasPermission } from '../../lib/rbac/permissions';
import { useAuth } from '../auth/context';

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
  const [title, setTitle] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [directionId, setDirectionId] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      setSaveError(null);
      const trimmedCode = code.trim();
      const trimmedTitle = title.trim();
      if (trimmedCode.length < 2) {
        setSaveError('Код курса: минимум 2 символа');
        recordMetric('form_error_rate', 1, { form: 'course_create', field: 'code' });
        return;
      }
      if (trimmedTitle.length < 3) {
        setSaveError('Название: минимум 3 символа');
        recordMetric('form_error_rate', 1, { form: 'course_create', field: 'title' });
        return;
      }
      const payload = directionId
        ? { code: trimmedCode, title: trimmedTitle, description, directionId }
        : { code: trimmedCode, title: trimmedTitle, description };
      const created = await saveCourse(null, payload);
      router.push(`/courses/${created.id}`);
    } catch (createError) {
      setSaveError(readApiMessage(createError));
    }
  };

  return (
    <PageContainer>
      <PageHeader title="Создание курса" />
      <SectionCard title="Мастер создания">
        <form
          onSubmit={(event) => void onSubmit(event)}
          style={{ display: 'grid', gap: 8, maxWidth: 480 }}
        >
          <input
            required
            placeholder="Код"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
          <input
            required
            placeholder="Название"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <textarea
            placeholder="Описание"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <select value={directionId} onChange={(event) => setDirectionId(event.target.value)}>
            <option value="">Выберите направление</option>
            {directions?.items.map((direction) => (
              <option key={direction.id} value={direction.id}>
                {direction.name}
              </option>
            ))}
          </select>
          <button type="submit">Создать и открыть карточку</button>
          {saveError ? <SectionError message={saveError} /> : null}
        </form>
      </SectionCard>
    </PageContainer>
  );
};

export const CourseDetailsScreen = ({ id }: { id: string }) => {
  const { session } = useAuth();
  const { data: course, refetch } = useCourse(id);
  const { data: versions, refetch: refetchVersions } = useCourseVersions(id);
  const latestVersionId = versions?.items[versions.items.length - 1]?.id;
  const { data: modules, refetch: refetchModules } = useModules(latestVersionId);
  const [selectedModuleId, setSelectedModuleId] = useState<string>('');
  const { data: materials, refetch: refetchMaterials } = useMaterials(selectedModuleId);
  const { publishCourse, archiveCourse, createCourseVersion, saveModule, saveMaterial } =
    useDomainMutations();
  const [moduleTitle, setModuleTitle] = useState('');
  const [materialTitle, setMaterialTitle] = useState('');
  const [materialType, setMaterialType] = useState<'text' | 'video' | 'file' | 'external_url'>(
    'text'
  );
  const [saveError, setSaveError] = useState<string | null>(null);

  const canPublish = hasPermission(session?.permissions ?? [], 'courses.publish');
  const canArchive = hasPermission(session?.permissions ?? [], 'courses.archive');

  useEffect(() => {
    if (modules?.items?.length && !selectedModuleId) {
      setSelectedModuleId(modules.items[0]?.id ?? '');
    }
  }, [modules, selectedModuleId]);

  return (
    <PageContainer>
      <PageHeader title={course?.title ?? 'Карточка курса'} />
      <SectionCard title="Общие данные">
        <p>Код: {course?.code}</p>
        <StatusChip status={course?.status ?? 'draft'} />
        <div style={{ display: 'flex', gap: 8 }}>
          {canPublish ? (
            <button
              onClick={() =>
                void publishCourse(id)
                  .then(refetch)
                  .catch((publishError) => setSaveError(readApiMessage(publishError)))
              }
            >
              Publish
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
              Archive
            </button>
          ) : null}
        </div>
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
              minViewSeconds: 60,
              isRequired: true
            })
              .then(() => {
                setMaterialTitle('');
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
            onChange={(event) => setMaterialType(event.target.value as typeof materialType)}
          >
            <option value="text">text</option>
            <option value="video">video</option>
            <option value="file">file</option>
            <option value="external_url">external_url</option>
          </select>
          <button type="submit" disabled={!selectedModuleId}>
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

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const created = await saveGroup(null, { code, name, status: 'draft' });
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
        >
          <input
            required
            placeholder="Код"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
          <input
            required
            placeholder="Название"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <button type="submit">Создать</button>
          {saveError ? <SectionError message={saveError} /> : null}
        </form>
      </SectionCard>
    </PageContainer>
  );
};

export const GroupDetailsScreen = ({ id }: { id: string }) => {
  const { data: group } = useGroup(id);
  const { data: courses } = useCoursesList({ page: 1, page_size: 20 });
  const { data: groupCourses, refetch: refetchCourses } = useGroupCourses(id);
  const { data: enrollments, refetch: refetchEnrollments } = useEnrollments({ group_id: id });
  const { data: progress } = useLearnerCourseProgress(groupCourses?.items[0]?.courseId);
  const { createGroupCourse, createEnrollment } = useDomainMutations();
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [learnerId, setLearnerId] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);

  const averageProgress = useMemo(() => {
    if (!progress?.items.length) return 0;
    const total = progress.items.reduce((sum, item) => sum + item.progressPercent, 0);
    return Math.round(total / progress.items.length);
  }, [progress]);

  return (
    <PageContainer>
      <PageHeader title={group?.name ?? 'Карточка группы'} />
      <SectionCard title="Общая информация">
        <p>Код: {group?.code}</p>
        <StatusChip status={group?.status ?? 'draft'} />
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
          <button type="submit" disabled={!selectedCourseId}>
            Назначить курс
          </button>
        </form>
        <ul>
          {groupCourses?.items.map((item) => (
            <li key={item.id}>{item.courseId}</li>
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
          <button type="submit" disabled={!learnerId.trim()}>
            Зачислить слушателя
          </button>
        </form>
        <ul>
          {enrollments?.items.map((item) => (
            <li key={item.id}>
              {item.learnerId} — {item.status}
            </li>
          ))}
        </ul>
        <ProgressBar value={averageProgress} />
        <MutationError message={saveError} />
      </SectionCard>
    </PageContainer>
  );
};

export const LearnerCoursesScreen = () => {
  const { session } = useAuth();
  const learnerId = session?.user.id ?? '';
  const { data, loading, error } = useLearnerCourses(learnerId);

  return (
    <PageContainer>
      <PageHeader
        title="Мои курсы"
        subtitle="Упрощённый сценарий слушателя: только ваши назначения"
      />
      <SectionCard title="Назначенные курсы">
        {error ? <SectionError message={error} /> : null}
        {loading ? <ListSkeleton lines={5} /> : null}
        {!loading && !error && data?.items.length ? (
          <ul>
            {data.items.map((enrollment) => (
              <li key={enrollment.id}>
                <Link href={`/learner/courses/${enrollment.courseId ?? enrollment.id}`}>
                  Курс {enrollment.courseId ?? enrollment.id}
                </Link>{' '}
                — {enrollment.status}
              </li>
            ))}
          </ul>
        ) : null}
        {!loading && !error && !data?.items.length ? (
          <SectionEmpty
            message="Нет назначенных курсов"
            hint="Если вы ожидаете обучение, обратитесь к куратору или администратору учебного центра — вас ещё не зачислили в группу или курс."
          />
        ) : null}
      </SectionCard>
    </PageContainer>
  );
};

export const LearnerCourseDetailsScreen = ({ id }: { id: string }) => {
  const { data: course, loading: courseLoading, error: courseError } = useCourse(id);
  const {
    data: progress,
    loading: progressLoading,
    error: progressError
  } = useLearnerCourseProgress(id);
  const percent = useMemo(() => {
    if (!progress?.items.length) return 0;
    const sum = progress.items.reduce((acc, item) => acc + item.progressPercent, 0);
    return Math.round(sum / progress.items.length);
  }, [progress]);

  const nextStep = useMemo(
    () => progress?.items.find((item) => item.status === 'in_progress') ?? progress?.items[0],
    [progress]
  );

  const orderedSteps = useMemo(() => {
    if (!progress?.items.length) return [];
    return [...progress.items].sort((a, b) => {
      const m = a.moduleId.localeCompare(b.moduleId);
      if (m !== 0) return m;
      return a.materialId.localeCompare(b.materialId);
    });
  }, [progress]);

  const loading = courseLoading || progressLoading;
  const error = courseError ?? progressError;

  useEffect(() => {
    startMetricTimer('time_to_start_learning');
  }, []);

  return (
    <PageContainer>
      <PageHeader
        title={course ? course.title : `Курс ${id}`}
        {...(course ? { subtitle: `Код: ${course.code}` } : {})}
      />
      {error ? <SectionError message={error} /> : null}
      <SectionCard title="Прогресс">
        {loading ? <LoadingState message="Загрузка курса и прогресса…" /> : null}
        {!loading ? <ProgressBar value={percent} /> : null}
        {!loading ? (
          <div className="ui-inline">
            <span className="ui-text-muted">Оцените удобство просмотра прогресса:</span>
            <button
              type="button"
              className="ui-button ui-button--secondary"
              onClick={() => recordMetric('csat_after_grade_view', 5, { courseId: id })}
            >
              Удобно
            </button>
            <button
              type="button"
              className="ui-button"
              onClick={() => recordMetric('csat_after_grade_view', 2, { courseId: id })}
            >
              Неудобно
            </button>
          </div>
        ) : null}
      </SectionCard>
      <SectionCard title="Что продолжить">
        {nextStep ? (
          <div className="ui-stack" style={{ gap: 8 }}>
            <p style={{ margin: 0 }}>
              Продолжите материал {nextStep.materialId} в модуле {nextStep.moduleId}.
            </p>
            <button
              type="button"
              className="ui-button ui-button--primary"
              onClick={() =>
                completeMetricTimer('time_to_start_learning', {
                  source: 'learner_course_details',
                  courseId: id
                })
              }
            >
              Продолжить обучение
            </button>
          </div>
        ) : (
          <SectionEmpty
            message="Материалы для продолжения пока не найдены"
            hint="Когда методист откроет доступ к модулям, здесь появится следующий шаг."
          />
        )}
      </SectionCard>
      <SectionCard title="Дорожка материалов">
        {!orderedSteps.length && !loading ? (
          <SectionEmpty
            message="Нет записей прогресса по этому курсу"
            hint="Прогресс появится после первого просмотра материалов в LMS."
          />
        ) : null}
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
          {orderedSteps.map((item) => (
            <li key={`${item.moduleId}-${item.materialId}`}>
              Модуль {item.moduleId} · материал {item.materialId}{' '}
              <StatusChip status={item.status} /> · {item.progressPercent}%
            </li>
          ))}
        </ul>
      </SectionCard>
    </PageContainer>
  );
};

export const AssessmentDashboardScreen = () => {
  const { session } = useAuth();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [groupId, setGroupId] = useState('');
  const [selectedTestId, setSelectedTestId] = useState('');
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState('');
  const [attemptResult, setAttemptResult] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { startAttempt, getAttemptResult } = useDomainMutations();
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

  const onStartAttempt = async () => {
    if (!selectedTestId || !selectedEnrollmentId || !session) {
      setSaveError('Выберите тест и зачисление');
      return;
    }
    setSaveError(null);
    setAttemptResult(null);
    startMetricTimer('time_to_submit_assignment');
    try {
      const attempt = await startAttempt({
        testId: selectedTestId,
        enrollmentId: selectedEnrollmentId,
        learnerId: session.user.id
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
      <PageHeader title="Assessment" />
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
      <SectionCard title="Question banks">
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
      <SectionCard title="Tests">
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
      <SectionCard title="Assignments">
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
    </PageContainer>
  );
};
