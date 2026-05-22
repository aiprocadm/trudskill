import type { LearnerRoleCode, RoleOption } from './types';
import type { UserSession } from '../../entities/session/model';

const ROLE_ORDER: LearnerRoleCode[] = ['learner', 'teacher', 'tenant_admin', 'platform_admin'];

const ROLE_HREF: Record<LearnerRoleCode, string> = {
  learner: '/learner',
  teacher: '/teacher/grading-center',
  tenant_admin: '/admin/cockpit',
  platform_admin: '/admin/cockpit'
};

const ROLE_LABEL: Record<LearnerRoleCode, string> = {
  learner: 'Кабинет ученика',
  teacher: 'Кабинет преподавателя',
  tenant_admin: 'Кабинет администратора',
  platform_admin: 'Кабинет платформы'
};

const normalize = (raw: string): LearnerRoleCode | null => {
  const lowered = raw.toLowerCase();
  if (lowered === 'student' || lowered === 'learner') return 'learner';
  if (lowered === 'teacher') return 'teacher';
  if (lowered === 'admin' || lowered === 'tenant_admin') return 'tenant_admin';
  if (lowered === 'platform_admin') return 'platform_admin';
  return null;
};

const collectRoles = (session: UserSession | null): LearnerRoleCode[] => {
  if (!session) return [];
  const normalized = new Set<LearnerRoleCode>();
  for (const raw of session.roles ?? []) {
    const code = normalize(raw);
    if (code) normalized.add(code);
  }
  return ROLE_ORDER.filter((code) => normalized.has(code));
};

export const getAvailableRoles = (session: UserSession | null): RoleOption[] => {
  const roles = collectRoles(session);
  if (roles.length <= 1) return [];
  return roles.map((code) => ({ code, label: ROLE_LABEL[code], href: ROLE_HREF[code] }));
};

export const getActiveRole = (
  session: UserSession | null,
  requested: string | null | undefined
): LearnerRoleCode => {
  const available = collectRoles(session);
  const normalizedRequested = requested ? normalize(requested) : null;
  if (normalizedRequested && available.includes(normalizedRequested)) {
    return normalizedRequested;
  }
  return available[0] ?? 'learner';
};
