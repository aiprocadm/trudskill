import type { SessionResponseContract, UserResponseContract } from '@trudskill/api-contracts';

export type UserStatus = 'active' | 'blocked';

export interface User {
  id: string;
  tenantId: string;
  login: string;
  email: string | null;
  passwordHash: string;
  status: UserStatus;
  displayName: string;
  /** МГ-J3.2 (0112): должность сотрудника — из приглашения или правки карточки. */
  position?: string | null;
  /** ФТ-E5: контрагент представителя заказчика; пусто у персонала центра. */
  counterpartyId?: string | null;
  /** 2FA (ФТ-G3): подтверждённая TOTP-защита входа. Опциональны — legacy-конструкторы юзера их не знают. */
  totpEnabled?: boolean;
  totpSecretEncrypted?: string | null;
  totpLastUsedStep?: number | null;
}

export type UserPublicDto = UserResponseContract;

export interface Role {
  id: string;
  tenantId: string;
  code: string;
  name: string;
}

export interface Permission {
  id: string;
  code: string;
  description: string;
}

export interface Session {
  id: string;
  tenantId: string;
  userId: string;
  jti: string;
  parentJti?: string;
  refreshTokenHash: string;
  csrfTokenHash?: string;
  expiresAt: string;
  /**
   * Порция 33 (журнал 270): кто из поддержки вошёл «от имени» владельца сессии.
   * Пусто — обычный вход. Живёт в сессии, а не только в токене: иначе пометка
   * исчезла бы при первом обновлении токена, а доступ остался бы.
   */
  impersonatedBy?: string;
  rotatedAt?: string;
  consumedAt?: string;
  revokedAt?: string;
  revokeReason?: string;
}

export type SessionPublicDto = SessionResponseContract;

export interface AuthEvent {
  id: string;
  tenantId: string;
  userId: string;
  type:
    | 'login'
    | 'logout'
    | 'refresh'
    | 'session_revoke'
    | 'logout_all'
    | 'magic_link_login'
    | 'totp_verified'
    | 'totp_failed';
  createdAt: string;
}
