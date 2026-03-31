import { Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../../audit/audit.service.js';
import type { RequestContext } from '../../../common/context/request-context.js';
import { DatabaseService } from '../../../infrastructure/database/database.service.js';
import { backendEnv } from '../../../env.js';
import {
  hashRefreshToken,
  issueSignedAccessToken,
  issueToken,
  verifyPassword
} from '../crypto.util.js';
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

  constructor(
    private readonly iamService: IamService,
    private readonly auditService: AuditService,
    @Optional() private readonly databaseService?: DatabaseService
  ) {}

  async login(tenantId: string, payload: LoginPayload, context: RequestContext) {
    const user = await this.iamService.findUserByLogin(tenantId, payload.login);
    if (!user) {
      throw new UnauthorizedException({
        code: 'invalid_credentials',
        message: 'Invalid credentials'
      });
    }

    if (user.status === 'blocked') {
      throw new UnauthorizedException({ code: 'user_blocked', message: 'User is blocked' });
    }

    if (!verifyPassword(payload.password, user.passwordHash)) {
      throw new UnauthorizedException({
        code: 'invalid_credentials',
        message: 'Invalid credentials'
      });
    }

    const tokens = await this.createSession(user);
    await this.pushAuthEvent(tenantId, user.id, 'login');
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

  async refresh(tenantId: string, refreshToken: string, context: RequestContext) {
    const tokenHash = hashRefreshToken(refreshToken, backendEnv.AUTH_JWT_SECRET);
    const activeSession = await this.findActiveSessionByRefreshHash(tenantId, tokenHash);

    if (!activeSession) {
      throw new UnauthorizedException({
        code: 'invalid_refresh',
        message: 'Refresh token is invalid'
      });
    }

    if (Date.parse(activeSession.expiresAt) <= Date.now()) {
      await this.revokeSessionInternal(activeSession.id, tenantId, activeSession.userId);
      throw new UnauthorizedException({ code: 'session_expired', message: 'Session expired' });
    }

    await this.revokeSessionInternal(activeSession.id, tenantId, activeSession.userId);
    const user = await this.iamService.getUser(tenantId, activeSession.userId);
    const nextTokens = await this.createSession(user);
    await this.pushAuthEvent(tenantId, user.id, 'refresh');
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
      newValues: { revokedAt: new Date().toISOString() }
    });

    return nextTokens;
  }

  async logout(
    tenantId: string,
    userId: string,
    sessionId: string,
    context: RequestContext
  ): Promise<void> {
    const session = await this.findSession(sessionId, tenantId, userId);
    if (!session) {
      return;
    }

    await this.revokeSessionInternal(session.id, tenantId, userId);
    await this.pushAuthEvent(tenantId, userId, 'logout');
    this.auditService.write({
      tenantId,
      actorId: userId,
      action: 'auth.logout',
      entityType: 'iam.session',
      entityId: session.id,
      requestId: context.requestId
    });
  }

  async listSessions(tenantId: string, userId: string): Promise<Session[]> {
    if (!this.databaseService) {
      return this.sessions.filter(
        (session) => session.tenantId === tenantId && session.userId === userId
      );
    }

    const rows = await this.databaseService.query<{
      id: string;
      tenant_id: string;
      user_id: string;
      refresh_token_hash: string;
      expires_at: string;
      revoked_at: string | null;
    }>(
      `
        select id, tenant_id, user_id, refresh_token_hash, expires_at::text as expires_at, revoked_at::text as revoked_at
        from iam.sessions
        where tenant_id = $1 and user_id = $2
        order by created_at desc
      `,
      [tenantId, userId]
    );

    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      refreshTokenHash: row.refresh_token_hash,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at ?? undefined
    }));
  }

  async revokeSession(
    tenantId: string,
    actorId: string,
    sessionId: string,
    context: RequestContext
  ): Promise<void> {
    const session = await this.findSession(sessionId, tenantId);
    if (!session || session.revokedAt) {
      return;
    }

    await this.revokeSessionInternal(session.id, tenantId, session.userId);
    await this.pushAuthEvent(tenantId, actorId, 'session_revoke');
    this.auditService.write({
      tenantId,
      actorId,
      action: 'auth.session_revoke',
      entityType: 'iam.session',
      entityId: session.id,
      requestId: context.requestId,
      oldValues: { revokedAt: null },
      newValues: { revokedAt: new Date().toISOString() }
    });
  }

  async isSessionActive(tenantId: string, userId: string, sessionId: string): Promise<boolean> {
    const session = await this.findSession(sessionId, tenantId, userId);
    if (!session || session.revokedAt) {
      return false;
    }
    return Date.parse(session.expiresAt) > Date.now();
  }

  async logoutAll(tenantId: string, userId: string, context: RequestContext): Promise<void> {
    if (!this.databaseService) {
      this.sessions = this.sessions.map((session) => {
        if (session.tenantId === tenantId && session.userId === userId && !session.revokedAt) {
          return { ...session, revokedAt: new Date().toISOString() };
        }
        return session;
      });
    } else {
      await this.databaseService.query(
        `
          update iam.sessions
          set revoked_at = now(), updated_at = now()
          where tenant_id = $1 and user_id = $2 and revoked_at is null
        `,
        [tenantId, userId]
      );
    }

    await this.pushAuthEvent(tenantId, userId, 'logout_all');
    this.auditService.write({
      tenantId,
      actorId: userId,
      action: 'auth.logout_all',
      entityType: 'iam.session',
      entityId: userId,
      requestId: context.requestId
    });
  }

  async getAuthEvents(tenantId: string): Promise<AuthEvent[]> {
    if (!this.databaseService) {
      return this.authEvents.filter((event) => event.tenantId === tenantId);
    }

    const rows = await this.databaseService.query<{
      id: string;
      tenant_id: string;
      user_id: string;
      type: AuthEvent['type'];
      created_at: string;
    }>(
      `
        select id, tenant_id, user_id, type, created_at::text as created_at
        from iam.auth_events
        where tenant_id = $1
        order by created_at desc
      `,
      [tenantId]
    );

    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      type: row.type,
      createdAt: row.created_at
    }));
  }

  private async createSession(user: User) {
    const refreshToken = issueToken();
    const session: Session = {
      id: `s_${randomUUID().replace(/-/g, '')}`,
      tenantId: user.tenantId,
      userId: user.id,
      refreshTokenHash: hashRefreshToken(refreshToken, backendEnv.AUTH_JWT_SECRET),
      expiresAt: new Date(Date.now() + backendEnv.REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString()
    };

    if (!this.databaseService) {
      this.sessions.push(session);
    } else {
      await this.databaseService.query(
        `
          insert into iam.sessions (id, tenant_id, user_id, refresh_token_hash, expires_at)
          values ($1, $2, $3, $4, $5::timestamptz)
        `,
        [session.id, session.tenantId, session.userId, session.refreshTokenHash, session.expiresAt]
      );
    }

    const userRoles = await this.iamService.getUserRoles(user.tenantId, user.id);
    const accessToken = issueSignedAccessToken(
      {
        sub: user.id,
        tenant_id: user.tenantId,
        session_id: session.id,
        roles: userRoles.map((role) => role.code)
      },
      backendEnv.AUTH_JWT_SECRET,
      backendEnv.ACCESS_TOKEN_TTL_SECONDS
    );

    return {
      accessToken,
      refreshToken,
      sessionId: session.id,
      expiresIn: backendEnv.ACCESS_TOKEN_TTL_SECONDS
    };
  }

  private async pushAuthEvent(
    tenantId: string,
    userId: string,
    type: AuthEvent['type']
  ): Promise<void> {
    const event: AuthEvent = {
      id: `ae_${randomUUID().replace(/-/g, '')}`,
      tenantId,
      userId,
      type,
      createdAt: new Date().toISOString()
    };

    if (!this.databaseService) {
      this.authEvents.push(event);
      return;
    }

    await this.databaseService.query(
      `
        insert into iam.auth_events (id, tenant_id, user_id, type, payload, created_at)
        values ($1, $2, $3, $4, '{}'::jsonb, $5::timestamptz)
      `,
      [event.id, event.tenantId, event.userId, event.type, event.createdAt]
    );
  }

  private async findSession(
    sessionId: string,
    tenantId: string,
    userId?: string
  ): Promise<Session | undefined> {
    if (!this.databaseService) {
      return this.sessions.find(
        (item) =>
          item.id === sessionId && item.tenantId === tenantId && (!userId || item.userId === userId)
      );
    }

    const rows = await this.databaseService.query<{
      id: string;
      tenant_id: string;
      user_id: string;
      refresh_token_hash: string;
      expires_at: string;
      revoked_at: string | null;
    }>(
      `
        select id, tenant_id, user_id, refresh_token_hash, expires_at::text as expires_at, revoked_at::text as revoked_at
        from iam.sessions
        where id = $1 and tenant_id = $2 and ($3::text is null or user_id = $3)
        limit 1
      `,
      [sessionId, tenantId, userId ?? null]
    );

    const row = rows[0];
    if (!row) {
      return undefined;
    }

    return {
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      refreshTokenHash: row.refresh_token_hash,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at ?? undefined
    };
  }

  private async findActiveSessionByRefreshHash(
    tenantId: string,
    refreshTokenHash: string
  ): Promise<Session | undefined> {
    if (!this.databaseService) {
      return this.sessions.find(
        (session) =>
          session.tenantId === tenantId &&
          !session.revokedAt &&
          session.refreshTokenHash === refreshTokenHash
      );
    }

    const rows = await this.databaseService.query<{
      id: string;
      tenant_id: string;
      user_id: string;
      refresh_token_hash: string;
      expires_at: string;
      revoked_at: string | null;
    }>(
      `
        select id, tenant_id, user_id, refresh_token_hash, expires_at::text as expires_at, revoked_at::text as revoked_at
        from iam.sessions
        where tenant_id = $1 and refresh_token_hash = $2 and revoked_at is null
        order by created_at desc
        limit 1
      `,
      [tenantId, refreshTokenHash]
    );

    const row = rows[0];
    if (!row) {
      return undefined;
    }

    return {
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      refreshTokenHash: row.refresh_token_hash,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at ?? undefined
    };
  }

  private async revokeSessionInternal(
    sessionId: string,
    tenantId: string,
    userId: string
  ): Promise<void> {
    if (!this.databaseService) {
      this.sessions = this.sessions.map((session) => {
        if (
          session.id === sessionId &&
          session.tenantId === tenantId &&
          session.userId === userId
        ) {
          return { ...session, revokedAt: new Date().toISOString() };
        }
        return session;
      });
      return;
    }

    await this.databaseService.query(
      `
        update iam.sessions
        set revoked_at = now(), updated_at = now()
        where id = $1 and tenant_id = $2 and user_id = $3 and revoked_at is null
      `,
      [sessionId, tenantId, userId]
    );
  }
}
