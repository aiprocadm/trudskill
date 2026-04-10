'use client';

import { DataTable, FilterBar, StatusChip } from '@cdoprof/ui';
import Link from 'next/link';
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
  useUsersList
} from './hooks';
import { PageContainer, PageHeader, SectionCard, SectionEmpty, SectionError } from '../../components/state-wrappers';
import { ApiClientError } from '../../lib/api/client';
import { hasPermission } from '../../lib/rbac/permissions';
import { useAuth } from '../auth/context';

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
  total: number | undefined;
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

const MutationError = ({ message }: { message: string | null }) => (message ? <SectionError message={message} /> : null);

const toTableRows = <T extends object>(rows: T[]): Record<string, unknown>[] => rows as unknown as Record<string, unknown>[];

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
            rows={toTableRows(data.items)}
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
  const { session } = useAuth();
  const canCreateCourse = hasPermission(session?.permissions ?? [], 'courses.write');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [directionId, setDirectionId] = useState('');
  const [page, setPage] = useState(1);
  const { data, loading, error } = useCoursesList({ q, status, page, page_size: 20, direction_id: directionId || undefined });
  const { data: directions } = useDirectionsList({ page: 1, page_size: 100 });

  return (
    <PageContainer>
      <PageHeader
        title="Курсы"
        actions={
          canCreateCourse ? <Link href="/courses/new">Создать курс</Link> : <small>Недостаточно прав для создания курса</small>
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
        {loading ? <p>Загрузка...</p> : null}
        {error ? <SectionError message={error} /> : null}
        <ul>
          {data?.items.map((course) => (
            <li key={course.id}>
              <Link href={`/courses/${course.id}`}>{course.title}</Link> <StatusChip status={course.status} />
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
      const payload = directionId ? { code, title, description, directionId } : { code, title, description };
      const created = await saveCourse(null, payload);
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
  const [selectedModuleId, setSelectedModuleId] = useState<string>('');
  const { data: materials, refetch: refetchMaterials } = useMaterials(selectedModuleId);
  const { publishCourse, archiveCourse, createCourseVersion, saveModule, saveMaterial } = useDomainMutations();
  const [moduleTitle, setModuleTitle] = useState('');
  const [materialTitle, setMaterialTitle] = useState('');
  const [materialType, setMaterialType] = useState<'text' | 'video' | 'file' | 'external_url'>('text');
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
        <button onClick={() => void createCourseVersion(id).then(refetchVersions)}>Добавить версию</button>
        <ul>{versions?.items.map((item) => <li key={item.id}>v{item.versionNo} ({item.status})</li>)}</ul>
      </SectionCard>
      <SectionCard title="Модули">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!latestVersionId || !moduleTitle.trim()) return;
            void saveModule(null, { courseVersionId: latestVersionId, title: moduleTitle.trim(), minViewSeconds: 0, isRequired: true })
              .then(() => {
                setModuleTitle('');
                return refetchModules();
              })
              .catch((moduleError) => setSaveError(readApiMessage(moduleError)));
          }}
          style={{ display: 'flex', gap: 8, marginBottom: 8 }}
        >
          <input value={moduleTitle} onChange={(event) => setModuleTitle(event.target.value)} placeholder="Название модуля" />
          <button type="submit" disabled={!latestVersionId}>
            Добавить модуль
          </button>
        </form>
        <ul>{modules?.items.map((item) => <li key={item.id}>{item.sortOrder + 1}. {item.title} ({item.minViewSeconds}s)</li>)}</ul>
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
          <select value={selectedModuleId} onChange={(event) => setSelectedModuleId(event.target.value)}>
            <option value="">Выберите модуль</option>
            {modules?.items.map((module) => (
              <option key={module.id} value={module.id}>
                {module.title}
              </option>
            ))}
          </select>
          <input value={materialTitle} onChange={(event) => setMaterialTitle(event.target.value)} placeholder="Название материала" />
          <select value={materialType} onChange={(event) => setMaterialType(event.target.value as typeof materialType)}>
            <option value="text">text</option>
            <option value="video">video</option>
            <option value="file">file</option>
            <option value="external_url">external_url</option>
          </select>
          <button type="submit" disabled={!selectedModuleId}>
            Добавить материал
          </button>
        </form>
        <ul>{materials?.items.map((item) => <li key={item.id}>{item.sortOrder + 1}. {item.title} [{item.materialType}] min_view_seconds={item.minViewSeconds}</li>)}</ul>
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
        actions={canCreateGroup ? <Link href="/groups/new">Создать группу</Link> : <small>Недостаточно прав для создания группы</small>}
      />
      <SectionCard title="Реестр групп">
        {loading ? <p>Загрузка...</p> : null}
        {error ? <SectionError message={error} /> : null}
        <ul>{data?.items.map((group) => <li key={group.id}><Link href={`/groups/${group.id}`}>{group.name}</Link></li>)}</ul>
        {!loading && !error && !data?.items.length ? <SectionEmpty message="Нет групп" /> : null}
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
          <select value={selectedCourseId} onChange={(event) => setSelectedCourseId(event.target.value)}>
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
        <ul>{groupCourses?.items.map((item) => <li key={item.id}>{item.courseId}</li>)}</ul>
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
          <input value={learnerId} onChange={(event) => setLearnerId(event.target.value)} placeholder="ID слушателя" />
          <button type="submit" disabled={!learnerId.trim()}>
            Зачислить слушателя
          </button>
        </form>
        <ul>{enrollments?.items.map((item) => <li key={item.id}>{item.learnerId} — {item.status}</li>)}</ul>
        <ProgressBar value={averageProgress} />
        <MutationError message={saveError} />
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
              <Link href={`/learner/courses/${enrollment.courseId ?? enrollment.id}`}>Курс {enrollment.courseId ?? enrollment.id}</Link> — {enrollment.status}
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

export const AssessmentDashboardScreen = () => {
  const { data: banks } = useQuestionBanks({ page: 1, page_size: 10 });
  const { data: tests } = useTests({ page: 1, page_size: 10 });
  const { data: assignments } = useAssignments({ page: 1, page_size: 10 });
  return (
    <PageContainer>
      <PageHeader title="Assessment" />
      <SectionCard title="Question banks">
        <p>Всего: {banks?.total ?? 0}</p>
      </SectionCard>
      <SectionCard title="Tests">
        <p>Всего: {tests?.total ?? 0}</p>
      </SectionCard>
      <SectionCard title="Assignments">
        <p>Всего: {assignments?.total ?? 0}</p>
      </SectionCard>
    </PageContainer>
  );
};
