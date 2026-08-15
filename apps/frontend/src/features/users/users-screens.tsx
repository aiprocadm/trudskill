'use client';

import { AsyncSection, DataTable, FilterBar, LoadingState, StatusChip } from '@trudskill/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../components/state-wrappers';
import { hasPermission } from '../../lib/rbac/permissions';
import { useAuth } from '../auth/context';
import {
  useDomainMutations,
  useRoles,
  useUser,
  useUserRoles,
  useUserSessions,
  useUsersList
} from '../mvp/hooks';
import {
  PaginationControls,
  STATUS_OPTIONS,
  readApiMessage,
  toTableRows
} from '../mvp/screen-helpers';

/*
 * Перенесены «как есть» из features/mvp/screens.tsx (§8.3, порядок 8; правило SCR-001).
 * Редизайн — следующим коммитом.
 */

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
