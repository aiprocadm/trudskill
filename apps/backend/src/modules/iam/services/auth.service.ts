import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service.js';
import type { RequestContext } from '../../../common/context/request-context.js';
import { backendEnv } from '../../../env.js';
import { hashRefreshToken, issueToken, verifyPassword } from '../crypto.util.js';
import type { AuthEvent, Session, User } from '../iam.types.js';
import { IamService } from './iam.service.js';

export interface LoginPayload {
  login: string;
  password: string;
}

@Injectable()
export class AuthService {
  private sessions: Session[] = [];
  private authEvents: AuthEvent[] = [];

  constructor(private readonly iamService: IamService, private readonly auditService: AuditService) {}

  login(tenantId: string, payload: LoginPayload, context: RequestContext) {
    const user = this.iamService.findUserByLogin(tenantId, payload.login);
    if (!user) {
      throw new UnauthorizedException({ code: 'invalid_credentials', message: 'Invalid credentials' });
    }

    if (user.status === 'blocked') {
      throw new UnauthorizedException({ code: 'user_blocked', message: 'User is blocked' });
    }

    if (!verifyPassword(payload.password, user.passwordHash)) {
      throw new UnauthorizedException({ code: 'invalid_credentials', message: 'Invalid credentials' });
    }

    const tokens = this.createSession(user);
    this.pushAuthEvent(tenantId, user.id, 'login');
    this.auditService.write({
      tenantId,
      actorId: user.id,
      action: 'auth.login',
      entityType: 'iam.user',
      entityId: user.id,
      requestId: context.requestId,
      ip: context.ip,
      userAgent: context.userAgent
    });

    return tokens;
  }

  refresh(tenantId: string, refreshToken: string, context: RequestContext) {
    const tokenHash = hashRefreshToken(refreshToken);
    const activeSession = this.sessions.find(
      (session) =>
        session.tenantId === tenantId && !session.revokedAt && session.refreshTokenHash === tokenHash
    );

    if (!activeSession) {
      throw new UnauthorizedException({ code: 'invalid_refresh', message: 'Refresh token is invalid' });
    }

    activeSession.revokedAt = new Date().toISOString();
    const user = this.iamService.getUser(tenantId, activeSession.userId);
    const nextTokens = this.createSession(user);
    this.pushAuthEvent(tenantId, user.id, 'refresh');
    this.auditService.write({
      tenantId,
      actorId: user.id,
      action: 'auth.refresh',
      entityType: 'iam.session',
      entityId: activeSession.id,
      requestId: context.requestId,
      ip: context.ip,
      userAgent: context.userAgent,
      oldValues: { revokedAt: null },
      newValues: { revokedAt: activeSession.revokedAt }
    });

    return nextTokens;
  }

  logout(tenantId: string, userId: string, sessionId: string, context: RequestContext): void {
    const session = this.sessions.find(
      (item) => item.id === sessionId && item.tenantId === tenantId && item.userId === userId
    );
    if (!session) {
      return;
    }

    session.revokedAt = new Date().toISOString();
    this.pushAuthEvent(tenantId, userId, 'logout');
    this.auditService.write({
      tenantId,
      actorId: userId,
      action: 'auth.logout',
      entityType: 'iam.session',
      entityId: session.id,
      requestId: context.requestId
    });
  }

  listSessions(tenantId: string, userId: string): Session[] {
    return this.sessions.filter((session) => session.tenantId === tenantId && session.userId === userId);
  }

  revokeSession(tenantId: string, actorId: string, sessionId: string, context: RequestContext): void {
    const session = this.sessions.find((item) => item.id === sessionId && item.tenantId === tenantId);
    if (!session || session.revokedAt) {
      return;
    }

    session.revokedAt = new Date().toISOString();
    this.pushAuthEvent(tenantId, actorId, 'session_revoke');
    this.auditService.write({
      tenantId,
      actorId,
      action: 'auth.session_revoke',
      entityType: 'iam.session',
      entityId: session.id,
      requestId: context.requestId,
      oldValues: { revokedAt: null },
      newValues: { revokedAt: session.revokedAt }
    });
  }

  logoutAll(tenantId: string, userId: string, context: RequestContext): void {
    this.sessions = this.sessions.map((session) => {
      if (session.tenantId === tenantId && session.userId === userId && !session.revokedAt) {
        return { ...session, revokedAt: new Date().toISOString() };
      }
      return session;
    });

    this.pushAuthEvent(tenantId, userId, 'logout_all');
    this.auditService.write({
      tenantId,
      actorId: userId,
      action: 'auth.logout_all',
      entityType: 'iam.session',
      entityId: userId,
      requestId: context.requestId
    });
  }

  getAuthEvents(tenantId: string): AuthEvent[] {
    return this.authEvents.filter((event) => event.tenantId === tenantId);
  }

  private createSession(user: User) {
    const accessToken = issueToken();
    const refreshToken = issueToken();
    const session: Session = {
      id: `s_${this.sessions.length + 1}`,
      tenantId: user.tenantId,
      userId: user.id,
      refreshTokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(Date.now() + backendEnv.REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString()
    };
    this.sessions.push(session);

    return {
      accessToken,
      refreshToken,
      sessionId: session.id,
      expiresIn: backendEnv.ACCESS_TOKEN_TTL_SECONDS
    };
  }

  private pushAuthEvent(tenantId: string, userId: string, type: AuthEvent['type']) {
    this.authEvents.push({
      id: `ae_${this.authEvents.length + 1}`,
      tenantId,
      userId,
      type,
      createdAt: new Date().toISOString()
    });
  }
}
