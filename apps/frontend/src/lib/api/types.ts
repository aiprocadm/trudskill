import type { AuthTokensContract } from '@cdoprof/api-contracts';
import type { GeneratedLoginRequest, GeneratedLogoutRequest } from '@cdoprof/api-contracts/src/generated/contracts.generated';
import type { CurrentUser } from '../../entities/session/model';

export type LoginRequest = GeneratedLoginRequest;

export type LoginResponse = AuthTokensContract;

export type LogoutRequest = GeneratedLogoutRequest;

export type MeResponse = CurrentUser;
