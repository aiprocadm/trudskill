'use client';

import Link from 'next/link';
import { useMemo, useState, type FormEvent } from 'react';
import { DataTable, FilterBar, StatusChip } from '@cdoprof/ui';
import { useAuth } from '../auth/context';
import { hasPermission } from '../../lib/rbac/permissions';
import { ApiClientError } from '../../lib/api/client';
import { PageContainer, PageHeader, SectionCard, SectionEmpty, SectionError } from '../../components/state-wrappers';
import {
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
  useRoles,
  useUser,
  useUserRoles,
  useUsersList
} from './hooks';

const STATUS_OPTIONS = ['active', 'blocked', 'draft', 'archived', 'published', 'pending', 'suspended', 'completed', 'cancelled'] as const;

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
    <input placeholder="Поиск" value={q} onChange={(event) => setQ(event.target.value)} />
    <select value={status} onChange={(event) => setStatus(event.target.value)}>
      <option value="">Все статусы</option>
      {STATUS_OPTIONS.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  </FilterBar>
);

const PaginationControls = ({
  page,
  setPage,
  total,
  pageSize
}: {
  page: number;
  setPage: (page: number) => void;
  total?: number;
  pageSize: number;
}) => {
  const canPrev = page > 1;
  const canNext = total ? page * pageSize < total : true;
  return (
    <div style={{ display: 'flex', gap: 8 }}>
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
  <div style={{ display: 'grid', gap: 4 }}>
    <progress max={100} value={value} />
    <small>{value}%</small>
  </div>
);

export const UsersPageScreen = () => {
  const { session } = useAuth();
  const canManage = hasPermission(session?.permissions ?? [], 'iam.manage_roles');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const { data, loading, error } = useUsersList({ q, status, page, page_size: 20, sort: role ? `role:${role}` : undefined });
  const { data: roles } = useRoles();

  return (
    <PageContainer>
      <PageHeader title="Пользователи" />
      <SectionCard title="Реестр пользователей">
        <RegistryControls q={q} setQ={setQ} status={status} setStatus={setStatus} />
        <FilterBar>
          <select value={role} onChange={(event) => setRole(event.target.value)}>
            <option value="">Все роли</option>
            {roles?.map((item) => (
              <option key={item.id} value={item.code}>
                {item.name}
              </option>
            ))}
          </select>
        </FilterBar>
        {loading ? <p>Загрузка...</p> : null}
        {error ? <SectionError message={error} /> : null}
        {data?.items.length ? (
          <DataTable
            columns={[
              { key: 'displayName', title: 'ФИО' },
              { key: 'login', title: 'Логин' },
              { key: 'status', title: 'Статус' }
            ]}
            rows={data.items}
          />
        ) : null}
        {!loading && !error && !data?.items.length ? <SectionEmpty message="Нет пользователей" /> : null}
        <div style={{ display: 'grid', gap: 8 }}>
          {data?.items.map((user) => (
            <div key={user.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
  const { setUserRoles } = useDomainMutations();
  const [selected, setSelected] = useState<string[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);

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
      {loading ? <p>Загрузка...</p> : null}
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
            <div style={{ display: 'grid', gap: 8 }}>
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
            <SectionEmpty message="История сессий будет добавлена после расширения endpoint auth/sessions." />
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
  const { data, loading, error } = useCounterpartiesList({ q, status, page, page_size: 20, sort: 'name:asc' });

  return (
    <PageContainer>
      <PageHeader title="Контрагенты" />
      <SectionCard title="Реестр контрагентов">
        <RegistryControls q={q} setQ={setQ} status={status} setStatus={setStatus} />
        {loading ? <p>Загрузка...</p> : null}
        {error ? <SectionError message={error} /> : null}
        <div style={{ display: 'grid', gap: 8 }}>
          {data?.items.map((item) => (
            <Link key={item.id} href={`/counterparties/${item.id}`}>
              {item.name} ({item.code})
            </Link>
          ))}
        </div>
        {!loading && !error && !data?.items.length ? <SectionEmpty message="Нет контрагентов" /> : null}
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
      {loading ? <p>Загрузка...</p> : null}
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
        {loading ? <p>Загрузка...</p> : null}
        {error ? <SectionError message={error} /> : null}
        <ul>{data?.items.map((item) => <li key={item.id}>{item.name}</li>)}</ul>
      </SectionCard>
    </PageContainer>
  );
};

export const CoursesPageScreen = () => {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [directionId, setDirectionId] = useState('');
  const [page, setPage] = useState(1);
  const { data } = useCoursesList({ q, status, page, page_size: 20, course_id: directionId || undefined });
  const { data: directions } = useDirectionsList({ page: 1, page_size: 100 });

  return (
    <PageContainer>
      <PageHeader title="Курсы" actions={<Link href="/courses/new">Создать курс</Link>} />
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
        <ul>
          {data?.items.map((course) => (
            <li key={course.id}>
              <Link href={`/courses/${course.id}`}>{course.title}</Link> <StatusChip status={course.status} />
            </li>
          ))}
        </ul>
        {!data?.items.length ? <SectionEmpty message="Нет курсов" /> : null}
        <PaginationControls page={page} setPage={setPage} total={data?.total} pageSize={20} />
      </SectionCard>
    </PageContainer>
  );
};

export const CourseCreateScreen = () => {
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
      const created = await saveCourse(null, { code, title, description, directionId: directionId || undefined });
      window.location.assign(`/courses/${created.id}`);
    } catch (createError) {
      setSaveError(readApiMessage(createError));
    }
  };

  return (
    <PageContainer>
      <PageHeader title="Создание курса" />
      <SectionCard title="Мастер создания">
        <form onSubmit={(event) => void onSubmit(event)} style={{ display: 'grid', gap: 8, maxWidth: 480 }}>
          <input required placeholder="Код" value={code} onChange={(event) => setCode(event.target.value)} />
          <input required placeholder="Название" value={title} onChange={(event) => setTitle(event.target.value)} />
          <textarea placeholder="Описание" value={description} onChange={(event) => setDescription(event.target.value)} />
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
  const selectedModuleId = modules?.items?.[0]?.id;
  const { data: materials, refetch: refetchMaterials } = useMaterials(selectedModuleId);
  const { publishCourse, archiveCourse, createCourseVersion, saveModule, saveMaterial } = useDomainMutations();

  const canPublish = hasPermission(session?.permissions ?? [], 'courses.publish');
  const canArchive = hasPermission(session?.permissions ?? [], 'courses.archive');

  return (
    <PageContainer>
      <PageHeader title={course?.title ?? 'Карточка курса'} />
      <SectionCard title="Общие данные">
        <p>Код: {course?.code}</p>
        <StatusChip status={course?.status ?? 'draft'} />
        <div style={{ display: 'flex', gap: 8 }}>
          {canPublish ? <button onClick={() => void publishCourse(id).then(refetch)}>Publish</button> : null}
          {canArchive ? <button onClick={() => void archiveCourse(id).then(refetch)}>Archive</button> : null}
        </div>
      </SectionCard>
      <SectionCard title="Версии курса">
        <button onClick={() => void createCourseVersion(id).then(refetchVersions)}>Добавить версию</button>
        <ul>{versions?.items.map((item) => <li key={item.id}>v{item.versionNo} ({item.status})</li>)}</ul>
      </SectionCard>
      <SectionCard title="Модули">
        <button
          onClick={() =>
            latestVersionId
              ? void saveModule(null, { courseVersionId: latestVersionId, title: `Новый модуль ${Date.now()}`, minViewSeconds: 0, isRequired: true }).then(refetchModules)
              : undefined
          }
        >
          Добавить модуль
        </button>
        <ul>{modules?.items.map((item) => <li key={item.id}>{item.sortOrder + 1}. {item.title} ({item.minViewSeconds}s)</li>)}</ul>
      </SectionCard>
      <SectionCard title="Материалы модуля">
        <button
          onClick={() =>
            selectedModuleId
              ? void saveMaterial(null, { moduleId: selectedModuleId, title: `Материал ${Date.now()}`, materialType: 'text', minViewSeconds: 60, isRequired: true }).then(refetchMaterials)
              : undefined
          }
        >
          Добавить материал
        </button>
        <ul>{materials?.items.map((item) => <li key={item.id}>{item.sortOrder + 1}. {item.title} [{item.materialType}] min_view_seconds={item.minViewSeconds}</li>)}</ul>
      </SectionCard>
    </PageContainer>
  );
};

export const GroupsPageScreen = () => {
  const [page, setPage] = useState(1);
  const { data } = useGroupsList({ page, page_size: 20 });
  return (
    <PageContainer>
      <PageHeader title="Группы" actions={<Link href="/groups/new">Создать группу</Link>} />
      <SectionCard title="Реестр групп">
        <ul>{data?.items.map((group) => <li key={group.id}><Link href={`/groups/${group.id}`}>{group.name}</Link></li>)}</ul>
        {!data?.items.length ? <SectionEmpty message="Нет групп" /> : null}
        <PaginationControls page={page} setPage={setPage} total={data?.total} pageSize={20} />
      </SectionCard>
    </PageContainer>
  );
};

export const GroupCreateScreen = () => {
  const { saveGroup } = useDomainMutations();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const created = await saveGroup(null, { code, name, status: 'draft' });
      window.location.assign(`/groups/${created.id}`);
    } catch (createError) {
      setSaveError(readApiMessage(createError));
    }
  };

  return (
    <PageContainer>
      <PageHeader title="Мастер создания группы" />
      <SectionCard title="Основные атрибуты">
        <form onSubmit={(event) => void onSubmit(event)} style={{ display: 'grid', gap: 8, maxWidth: 480 }}>
          <input required placeholder="Код" value={code} onChange={(event) => setCode(event.target.value)} />
          <input required placeholder="Название" value={name} onChange={(event) => setName(event.target.value)} />
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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {courses?.items.map((course) => (
            <button key={course.id} onClick={() => void createGroupCourse({ groupId: id, courseId: course.id }).then(refetchCourses)}>
              Назначить {course.title}
            </button>
          ))}
        </div>
        <ul>{groupCourses?.items.map((item) => <li key={item.id}>{item.courseId}</li>)}</ul>
      </SectionCard>
      <SectionCard title="Зачисления и прогресс">
        <button onClick={() => void createEnrollment({ groupId: id, learnerId: 'learner-demo' }).then(refetchEnrollments)}>
          Добавить тестовое зачисление
        </button>
        <ul>{enrollments?.items.map((item) => <li key={item.id}>{item.learnerId} — {item.status}</li>)}</ul>
        <ProgressBar value={averageProgress} />
      </SectionCard>
    </PageContainer>
  );
};

export const LearnerCoursesScreen = () => {
  const { session } = useAuth();
  const learnerId = session?.user.id ?? '';
  const { data } = useLearnerCourses(learnerId);

  return (
    <PageContainer>
      <PageHeader title="Мои курсы" />
      <SectionCard title="Назначенные курсы">
        <ul>
          {data?.items.map((enrollment) => (
            <li key={enrollment.id}>
              <Link href={`/learner/courses/${enrollment.id}`}>Курс {enrollment.id}</Link> — {enrollment.status}
            </li>
          ))}
        </ul>
        {!data?.items.length ? <SectionEmpty message="Нет назначенных курсов" /> : null}
      </SectionCard>
    </PageContainer>
  );
};

export const LearnerCourseDetailsScreen = ({ id }: { id: string }) => {
  const { data: progress } = useLearnerCourseProgress(id);
  const percent = useMemo(() => {
    if (!progress?.items.length) return 0;
    const sum = progress.items.reduce((acc, item) => acc + item.progressPercent, 0);
    return Math.round(sum / progress.items.length);
  }, [progress]);

  const nextStep = useMemo(() => progress?.items.find((item) => item.status === 'in_progress') ?? progress?.items[0], [progress]);

  return (
    <PageContainer>
      <PageHeader title={`Курс слушателя ${id}`} />
      <SectionCard title="Прогресс">
        <ProgressBar value={percent} />
      </SectionCard>
      <SectionCard title="Что продолжить">
        {nextStep ? <p>Продолжите материал {nextStep.materialId} в модуле {nextStep.moduleId}.</p> : <SectionEmpty message="Материалы для продолжения пока не найдены" />}
      </SectionCard>
    </PageContainer>
  );
};
