'use client';

import { FilterBar, ListPage, LoadingState, StatusChip } from '@trudskill/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import {
  PageContainer,
  PageHeader,
  RecordNotFound,
  SectionCard,
  SectionError
} from '../../components/state-wrappers';
import { hasPermission } from '../../lib/rbac/permissions';
import { useAuth } from '../auth/context';
import { useTenantBranding } from '../branding/context';
import { resolveWordmark } from '../branding/theme';
import {
  useDomainMutations,
  useRoles,
  useUser,
  useUserRoles,
  useUserSessions,
  useUsersList
} from '../mvp/hooks';
import { formatDate, readApiMessage } from '../mvp/screen-helpers';
import { useObjectCrumb } from '../navigation/use-object-crumb';

import type { ReactElement } from 'react';

const PAGE_SIZE = 20;

interface UserRow {
  id: string;
  nameView: ReactElement;
  login: string;
  statusView: ReactElement;
}

/** Состояния учётной записи словами: общий отбор монолита печатал коды. */
const USER_STATUS_OPTIONS = [
  { value: 'active', label: 'Работает' },
  { value: 'blocked', label: 'Заблокирован' },
  { value: 'archived', label: 'В архиве' }
];

/*
 * TPL-001 (Фаза 4, срез 17, волна 4). Что изменилось:
 *
 * 1. **Каждый пользователь выводился ДВАЖДЫ**: строкой таблицы и ниже — ссылкой
 *    «Открыть карточку Иванов И.» с бейджем состояния. Список из двадцати человек
 *    занимал сорок строк, а карточка открывалась только из нижнего дубля.
 * 2. Пометка «Только просмотр» повторялась у КАЖДОЙ строки — сообщение о правах,
 *    размноженное по числу пользователей.
 * 3. Отбор по состоянию показывал коды (`active`, `blocked`, …).
 */
export const UsersPageScreen = () => {
  const { session } = useAuth();
  const canManage = hasPermission(session?.permissions ?? [], 'iam.manage_roles');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const { data, loading, error, refetch } = useUsersList({
    q,
    status,
    page,
    page_size: PAGE_SIZE,
    // Порция 29 (журнал 278): роль уходит СВОИМ параметром. Раньше её клали в `sort`,
    // которого сервер не читает: список приходил целиком, а фильтр выглядел применённым.
    ...(role ? { role } : {})
  });
  const { data: roles } = useRoles();

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  const rows: UserRow[] = (data?.items ?? []).map((user) => ({
    id: user.id,
    nameView: (
      <Link className="ui-link" href={`/users/${user.id}`}>
        {user.displayName}
      </Link>
    ),
    login: user.login,
    statusView: <StatusChip status={user.status} />
  }));

  return (
    <PageContainer>
      <PageHeader
        title="Люди и доступ"
        subtitle="Сотрудники учебного центра: кто заходит в систему и что может делать"
        {...(canManage
          ? {}
          : {
              /* Пометка о правах — не действие: живёт в служебном слоте (CMP-020). */
              toolsSlot: (
                <span className="ui-text-muted">Права на изменение нет — только просмотр</span>
              )
            })}
      />

      <FilterBar
        activeCount={[q, status, role].filter(Boolean).length}
        onReset={() => {
          setQ('');
          setStatus('');
          setRole('');
          setPage(1);
        }}
        primary={
          <>
            <label className="ui-field">
              <span className="ui-field-label">Поиск по имени или логину</span>
              <input
                value={q}
                onChange={(event) => {
                  setQ(event.target.value);
                  setPage(1);
                }}
              />
            </label>
            <label className="ui-field">
              <span className="ui-field-label">Роль</span>
              <select
                value={role}
                onChange={(event) => {
                  setRole(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">Любая</option>
                {(roles ?? []).map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.name || item.code}
                  </option>
                ))}
              </select>
            </label>
            <label className="ui-field">
              <span className="ui-field-label">Статус</span>
              <select
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">Любое</option>
                {USER_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        }
      />

      <ListPage<UserRow>
        columns={[
          { key: 'nameView', title: 'Сотрудник', render: (row) => row.nameView },
          { key: 'login', title: 'Логин' },
          { key: 'statusView', title: 'Статус', render: (row) => row.statusView }
        ]}
        rows={rows}
        isLoading={loading}
        error={error ? new Error(error) : undefined}
        onRetry={() => void refetch()}
        rowKey={(row) => row.id}
        emptyMessage="Здесь появятся сотрудники центра"
        emptyHint="Это люди, которые заходят в систему и работают с обучением: методисты, менеджеры, администраторы. Слушатели живут в своём разделе."
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
      />
    </PageContainer>
  );
};

/** Строка таблицы сеансов: к полям сессии добавлены готовые к показу значения. */
interface SessionRow {
  id: string;
  expiresAt: string;
  revokedAt?: string;
  validUntil: string;
  stateView: string;
}

export const UserDetailsScreen = ({ id }: { id: string }) => {
  const { session } = useAuth();
  const canManageRoles = hasPermission(session?.permissions ?? [], 'iam.manage_roles');
  const { data: user, loading, error, notFound, refetch } = useUser(id);
  useObjectCrumb(user?.displayName, { notFound, failed: Boolean(error) });
  const branding = useTenantBranding();
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

  /*
   * Записи нет — говорим это прямо. Прежде открывалась карточка-призрак: заголовок на месте,
   * разделы пустые, кнопки действий рабочие, а под ними строка ошибки, которую человек
   * принимает за временный сбой.
   */
  if (notFound) {
    return (
      <RecordNotFound what="Пользователь" backHref="/users" backLabel="К списку пользователей" />
    );
  }

  return (
    <PageContainer>
      {/* TPL-002: заголовок карточки — имя объекта, как и последняя крошка (ТЗ 3.5/4.3). */}
      <PageHeader title={user?.displayName ?? 'Пользователь'} />
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
              {/*
                Здесь стоял идентификатор арендатора («3f7a-…») под подписью «Организация».
                Сотрудник всегда работает в своём центре, поэтому показываем его название —
                то же, что стоит в шапке кабинета.
              */}
              <div className="kv-list__row">
                <dt>Учебный центр</dt>
                <dd>{resolveWordmark(branding)}</dd>
              </div>
            </dl>
          </SectionCard>
          <SectionCard title="Роли и права">
            {/*
              Здесь печатались коды ролей латиницей («tenant_admin, teacher») — при том что
              в списке ниже те же роли подписаны по-русски. Название роли у нас есть, надо
              было просто его взять.
            */}
            <p>Текущие роли: {userRoles?.map((roleItem) => roleItem.name).join(', ') || '—'}</p>
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
            {/*
              GOAL-4 + CMP-001. Было три беды сразу: колонка «Сеанс» печатала машинный
              идентификатор, даты показывались как есть, а кнопки «Отозвать» лежали
              ОТДЕЛЬНЫМ списком под таблицей — какая кнопка какому сеансу, человек понимал
              лишь по порядку. Действие переехало в строку, идентификатор убран: человеку
              важно, до какого времени действует вход и завершён ли он.
            */}
            <ListPage<SessionRow>
              isLoading={false}
              rows={(sessions ?? []).map((row) => ({
                ...row,
                validUntil: formatDate(row.expiresAt),
                stateView: row.revokedAt ? `Завершён ${formatDate(row.revokedAt)}` : 'Действует'
              }))}
              rowKey={(row) => row.id}
              emptyMessage="Активные сессии не найдены"
              emptyHint="Сеанс появляется, когда человек входит в систему. Здесь его можно завершить принудительно."
              columns={[
                { key: 'validUntil', title: 'Действует до' },
                { key: 'stateView', title: 'Статус' }
              ]}
              rowActions={(row) =>
                canManageRoles && !row.revokedAt
                  ? [
                      {
                        label: 'Завершить сеанс',
                        /*
                         * Отказ обязан быть виден. Без этого «Завершить сеанс» на упавшем
                         * запросе не делал НИЧЕГО: сеанс остаётся жив, а человек уверен, что
                         * выгнал чужое устройство. Ошибка показывается той же строкой, что и
                         * отказ сохранения ролей, — она уже есть на экране.
                         */
                        onSelect: () =>
                          void revokeSession(row.id).catch((revokeError) =>
                            setSaveError(readApiMessage(revokeError))
                          )
                      }
                    ]
                  : []
              }
            />
          </SectionCard>
        </>
      ) : null}
    </PageContainer>
  );
};

// LearnerDetailsScreen переехал в features/learners/learner-detail-screen.tsx (Фаза 4 срез 2, SCR-001).
