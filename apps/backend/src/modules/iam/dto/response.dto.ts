import type {
  AuthClaimsContract,
  AuthTokensContract,
  SessionResponseContract,
  UserResponseContract
} from '@cdoprof/api-contracts';

export type AuthResponseDto = AuthTokensContract;
export type AuthClaimsResponseDto = AuthClaimsContract;
export type UserResponseDto = UserResponseContract;
export type SessionResponseDto = SessionResponseContract;
