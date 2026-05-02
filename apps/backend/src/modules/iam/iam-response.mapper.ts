import type { AuthResponseDto, SessionResponseDto, UserResponseDto } from './dto/response.dto.js';
import type { Session, User } from './iam.types.js';
import type { AuthTokensContract } from '@cdoprof/api-contracts';

export const toAuthResponse = (
  tokens: AuthTokensContract & { refreshToken?: string }
): AuthResponseDto => {
  const { accessToken, sessionId, expiresIn, claims } = tokens;
  return { accessToken, sessionId, expiresIn, claims };
};

export const toSessionResponse = (session: Session): SessionResponseDto => ({
  id: session.id,
  tenantId: session.tenantId,
  userId: session.userId,
  expiresAt: session.expiresAt,
  revokedAt: session.revokedAt
});

export const toUserResponse = (user: User): UserResponseDto => ({
  id: user.id,
  tenantId: user.tenantId,
  login: user.login,
  email: user.email,
  status: user.status,
  displayName: user.displayName
});
