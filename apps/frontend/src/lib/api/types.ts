import type { CurrentUser } from '../../entities/session/model';
import type { AuthTokensContract } from '@trudskill/api-contracts';
import type {
  GeneratedLoginRequest,
  GeneratedLogoutRequest
} from '@trudskill/api-contracts/src/generated/contracts.generated';

export type LoginRequest = GeneratedLoginRequest;

export type LoginResponse = AuthTokensContract;

export type LogoutRequest = GeneratedLogoutRequest;

// §5.160: /auth/me carries server-resolved permissions (the SSOT — iam.role_permissions) so the
// session is hydrated from the backend instead of a hand-maintained static role→permission map.
export type MeResponse = CurrentUser & { permissions: string[] };
