'use client';

import { SectionCard } from './state-wrappers';
import { useAuth } from '../features/auth/context';
import { getPrimaryRoleBlueprint } from '../features/navigation/role-blueprints';

// Инициалы из ФИО: первые буквы первых двух слов (Фамилия Имя → «ФИ»).
const initialsOf = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || '—';

export const ProfileCard = () => {
  const { session } = useAuth();
  const user = session?.user;
  const roleLabel =
    getPrimaryRoleBlueprint(session)?.displayName ?? session?.roles?.join(', ') ?? '—';
  const displayName = user?.displayName ?? user?.login ?? 'Пользователь';

  return (
    <SectionCard title="Профиль">
      <div className="profile-head">
        <span className="profile-avatar" aria-hidden>
          {initialsOf(displayName)}
        </span>
        <div>
          <p className="profile-name">{displayName}</p>
          <p className="profile-role">{roleLabel}</p>
        </div>
      </div>
      <dl className="kv-list">
        <div className="kv-list__row">
          <dt>Логин</dt>
          <dd>{user?.login ?? '—'}</dd>
        </div>
        {user?.email ? (
          <div className="kv-list__row">
            <dt>Почта</dt>
            <dd>{user.email}</dd>
          </div>
        ) : null}
        <div className="kv-list__row">
          <dt>Роль</dt>
          <dd>{roleLabel}</dd>
        </div>
        <div className="kv-list__row">
          <dt>Организация</dt>
          <dd>{user?.tenantId ?? '—'}</dd>
        </div>
      </dl>
    </SectionCard>
  );
};
