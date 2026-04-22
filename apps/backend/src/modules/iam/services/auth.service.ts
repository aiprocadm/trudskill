import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Optional, UnauthorizedException } from '@nestjs/common';

import { ensureInMemoryModeAllowed } from '../../../common/runtime/in-memory-mode.guard.js';
import { backendEnv } from '../../../env.js';
import { DatabaseService } from '../../../infrastructure/database/database.service.js';
import { AuditService } from '../../audit/audit.service.js';
import {
  hashRefreshToken,
  issueSignedAccessToken,
  issueToken,
  verifyPassword
} from '../crypto.util.js';
import { IamService } from './iam.service.js';

import type { RequestContext } from '../../../common/context/request-context.js';
import type { AuthEvent, Session, User } from '../iam.types.js';

export interface LoginPayload {
  login: string;
  password: string;
}

@Injectable()
export class AuthService {
  private sessions: Session[] = [];
  private authEvents: AuthEvent[] = [];

  constructor(
    @Inject(IamService)
    private readonly iamService: IamService,
    @Inject(AuditService)
    private readonly auditService: AuditService,
    @Inject(DatabaseService)
    @Optional()
    private readonly databaseService?: DatabaseService
  ) {
    if (!this.databaseService) {
      ensureInMemoryModeAllowed('AuthService');
    }
    if (
      (backendEnv.NODE_ENV === 'production' || backendEnv.NODE_ENV === 'staging') &&
      !this.databaseService
    ) {
      throw new Error('AuthService requires DatabaseService in production/staging');
    }
  }

  async login(tenantId: string, payload: LoginPayload, context: RequestContext) {
    const resolved = await this.iamService.findUserByLogin(tenantId, payload.login);
    if (!resolved) {
      throw new UnauthorizedException({
        code: 'invalid_credentials',
        message: 'Invalid credentials'
      });
    }

    const { user, databaseBacked } = resolved;

    if (user.status === 'blocked') {
      throw new UnauthorizedException({ code: 'user_blocked', message: 'User is blocked' });
    }

    if (!verifyPassword(payload.password, user.passwordHash)) {
      throw new UnauthorizedException({
        code: 'invalid_credentials',
        message: 'Invalid credentials'
      });
    }

    const persistRelational = !this.databaseService || databaseBacked;
    const tokens = await this.createSession(user, persistRelational);
    await this.pushAuthEvent(tenantId, user.id, 'login', persistRelational);
    this.auditService.write(
      {
        tenantId,
        actorId: user.id,
        action: 'auth.login',
        entityType: 'iam.user',
        entityId: user.id,
        requestId: context.requestId,
        ip: context.ip,
        userAgent: context.userAgent
      },
      { skipDatabase: !persistRelational }
    );

    return tokens;
  }

  async refresh(
    tenantId: string,
    refreshToken: string,
    csrfToken: string,
    context: RequestContext
  ) {
    const tokenHash = hashRefreshToken(refreshToken, backendEnv.AUTH_JWT_SECRET);
    const csrfTokenHash = hashRefreshToken(`csrf:${csrfToken}`, backendEnv.AUTH_JWT_SECRET);
    const activeSession = await this.consumeRefreshSession(tenantId, tokenHash, csrfTokenHash);
    if (Date.parse(activeSession.expiresAt) <= Date.now()) {
      throw new UnauthorizedException({ code: 'session_expired', message: 'Session expired' });
    }
    const user = await this.iamService.getUser(tenantId, activeSession.userId);
    const persistRelational = await this.shouldPersistRelationalSideEffects(tenantId, user.id);
    const nextTokens = await this.createSession(user, persistRelational, activeSession.jti);
    await this.pushAuthEvent(tenantId, user.id, 'refresh', persistRelational);
    this.auditService.write(
      {
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
      },
      { skipDatabase: !persistRelational }
    );

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
    const persistRelational = await this.shouldPersistRelationalSideEffects(tenantId, userId);
    await this.pushAuthEvent(tenantId, userId, 'logout', persistRelational);
    this.auditService.write(
      {
        tenantId,
        actorId: userId,
        action: 'auth.logout',
        entityType: 'iam.session',
        entityId: session.id,
        requestId: context.requestId
      },
      { skipDatabase: !persistRelational }
    );
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
      jti: string;
      parent_jti: string | null;
      refresh_token_hash: string;
      csrf_token_hash: string | null;
      expires_at: string;
      revoked_at: string | null;
      rotated_at: string | null;
      consumed_at: string | null;
      revoke_reason: string | null;
    }>(
      `
        select id, tenant_id, user_id, jti, parent_jti, refresh_token_hash, csrf_token_hash,
               expires_at::text as expires_at, revoked_at::text as revoked_at,
               rotated_at::text as rotated_at, consumed_at::text as consumed_at, revoke_reason
        from iam.sessions
        where tenant_id = $1 and user_id = $2
        order by created_at desc
      `,
      [tenantId, userId]
    );

    const fromDb = new Map<string, Session>(
      rows.map((row) => [
        row.id,
        {
          id: row.id,
          tenantId: row.tenant_id,
          userId: row.user_id,
          jti: row.jti,
          parentJti: row.parent_jti ?? undefined,
          refreshTokenHash: row.refresh_token_hash,
          csrfTokenHash: row.csrf_token_hash ?? undefined,
          expiresAt: row.expires_at,
          revokedAt: row.revoked_at ?? undefined,
          rotatedAt: row.rotated_at ?? undefined,
          consumedAt: row.consumed_at ?? undefined,
          revokeReason: row.revoke_reason ?? undefined
        }
      ])
    );

    for (const session of this.sessions) {
      if (session.tenantId === tenantId && session.userId === userId && !fromDb.has(session.id)) {
        fromDb.set(session.id, session);
      }
    }

    return [...fromDb.values()].sort((a, b) => Date.parse(b.expiresAt) - Date.parse(a.expiresAt));
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
    const persistRelational = await this.shouldPersistRelationalSideEffects(tenantId, actorId);
    await this.pushAuthEvent(tenantId, actorId, 'session_revoke', persistRelational);
    this.auditService.write(
      {
        tenantId,
        actorId,
        action: 'auth.session_revoke',
        entityType: 'iam.session',
        entityId: session.id,
        requestId: context.requestId,
        oldValues: { revokedAt: null },
        newValues: { revokedAt: new Date().toISOString() }
      },
      { skipDatabase: !persistRelational }
    );
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
      this.sessions = this.sessions.map((session) => {
        if (session.tenantId === tenantId && session.userId === userId && !session.revokedAt) {
          return { ...session, revokedAt: new Date().toISOString() };
        }
        return session;
      });
    }

    const persistRelational = await this.shouldPersistRelationalSideEffects(tenantId, userId);
    await this.pushAuthEvent(tenantId, userId, 'logout_all', persistRelational);
    this.auditService.write(
      {
        tenantId,
        actorId: userId,
        action: 'auth.logout_all',
        entityType: 'iam.session',
        entityId: userId,
        requestId: context.requestId
      },
      { skipDatabase: !persistRelational }
    );
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

    const fromDb = rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      type: row.type,
      createdAt: row.created_at
    }));

    const fromMemory = this.authEvents.filter((event) => event.tenantId === tenantId);
    return [...fromMemory, ...fromDb].sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
    );
  }

  private async shouldPersistRelationalSideEffects(
    tenantId: string,
    userId: string
  ): Promise<boolean> {
    return (
      !this.databaseService || (await this.iamService.isUserPersistedInDatabase(tenantId, userId))
    );
  }

  private async createSession(user: User, persistRelational: boolean, parentJti?: string) {
    const refreshToken = issueToken();
    const csrfToken = issueToken();
    const session: Session = {
      id: `s_${randomUUID().replace(/-/g, '')}`,
      tenantId: user.tenantId,
      userId: user.id,
      jti: `jti_${randomUUID().replace(/-/g, '')}`,
      parentJti,
      refreshTokenHash: hashRefreshToken(refreshToken, backendEnv.AUTH_JWT_SECRET),
      csrfTokenHash: hashRefreshToken(`csrf:${csrfToken}`, backendEnv.AUTH_JWT_SECRET),
      expiresAt: new Date(Date.now() + backendEnv.REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString()
    };

    if (!this.databaseService || !persistRelational) {
      this.sessions.push(session);
    } else {
      await this.databaseService.query(
        `
          insert into iam.sessions (
            id,
            tenant_id,
            user_id,
            jti,
            parent_jti,
            refresh_token_hash,
            csrf_token_hash,
            expires_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz)
        `,
        [
          session.id,
          session.tenantId,
          session.userId,
          session.jti,
          session.parentJti ?? null,
          session.refreshTokenHash,
          session.csrfTokenHash!,
          session.expiresAt
        ]
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
      csrfToken,
      sessionId: session.id,
      expiresIn: backendEnv.ACCESS_TOKEN_TTL_SECONDS
    };
  }

  private async pushAuthEvent(
    tenantId: string,
    userId: string,
    type: AuthEvent['type'],
    persistRelational: boolean
  ): Promise<void> {
    const event: AuthEvent = {
      id: `ae_${randomUUID().replace(/-/g, '')}`,
      tenantId,
      userId,
      type,
      createdAt: new Date().toISOString()
    };

    if (!this.databaseService || !persistRelational) {
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
      jti: string;
      parent_jti: string | null;
      refresh_token_hash: string;
      csrf_token_hash: string | null;
      expires_at: string;
      revoked_at: string | null;
      rotated_at: string | null;
      consumed_at: string | null;
      revoke_reason: string | null;
    }>(
      `
        select id, tenant_id, user_id, jti, parent_jti, refresh_token_hash, csrf_token_hash,
               expires_at::text as expires_at, revoked_at::text as revoked_at,
               rotated_at::text as rotated_at, consumed_at::text as consumed_at, revoke_reason
        from iam.sessions
        where id = $1 and tenant_id = $2 and ($3::text is null or user_id = $3)
        limit 1
      `,
      [sessionId, tenantId, userId ?? null]
    );

    const row = rows[0];
    if (row) {
      return {
        id: row.id,
        tenantId: row.tenant_id,
        userId: row.user_id,
        jti: row.jti,
        parentJti: row.parent_jti ?? undefined,
        refreshTokenHash: row.refresh_token_hash,
        csrfTokenHash: row.csrf_token_hash ?? undefined,
        expiresAt: row.expires_at,
        revokedAt: row.revoked_at ?? undefined,
        rotatedAt: row.rotated_at ?? undefined,
        consumedAt: row.consumed_at ?? undefined,
        revokeReason: row.revoke_reason ?? undefined
      };
    }

    return this.sessions.find(
      (item) =>
        item.id === sessionId && item.tenantId === tenantId && (!userId || item.userId === userId)
    );
  }

  private async consumeRefreshSession(
    tenantId: string,
    refreshTokenHash: string,
    csrfTokenHash: string
  ): Promise<Session> {
    if (!this.databaseService) {
      const activeSession = this.sessions.find(
        (session) => session.tenantId === tenantId && session.refreshTokenHash === refreshTokenHash
      );
      if (!activeSession) {
        throw new UnauthorizedException({
          code: 'invalid_refresh',
          message: 'Refresh token is invalid'
        });
      }
      if (activeSession.csrfTokenHash !== csrfTokenHash) {
        throw new UnauthorizedException({ code: 'invalid_csrf', message: 'Invalid CSRF token' });
      }
      if (activeSession.consumedAt || activeSession.revokedAt) {
        this.revokeFamilyInMemory(tenantId, activeSession.jti, 'refresh_replay_detected');
        throw new UnauthorizedException({
          code: 'refresh_replay',
          message: 'Refresh token replay detected'
        });
      }
      const now = new Date().toISOString();
      activeSession.consumedAt = now;
      activeSession.rotatedAt = now;
      activeSession.revokedAt = now;
      activeSession.revokeReason = 'rotated';
      return activeSession;
    }

    const consumed = await this.databaseService.withTransaction(async (client) => {
      const rows = await this.databaseService!.query<{
        id: string;
        tenant_id: string;
        user_id: string;
        jti: string;
        parent_jti: string | null;
        refresh_token_hash: string;
        csrf_token_hash: string | null;
        expires_at: string;
        consumed_at: string | null;
        revoked_at: string | null;
      }>(
        `
          select id, tenant_id, user_id, jti, parent_jti, refresh_token_hash, csrf_token_hash,
                 expires_at::text as expires_at, consumed_at::text as consumed_at, revoked_at::text as revoked_at
          from iam.sessions
          where tenant_id = $1 and refresh_token_hash = $2
          order by created_at desc
          for update skip locked
          limit 1
        `,
        [tenantId, refreshTokenHash],
        client
      );

      const row = rows[0];
      if (!row) {
        return null;
      }
      if (row.csrf_token_hash !== csrfTokenHash) {
        throw new UnauthorizedException({ code: 'invalid_csrf', message: 'Invalid CSRF token' });
      }
      if (row.consumed_at || row.revoked_at) {
        await this.databaseService!.query(
          `
            with recursive family as (
              select id, tenant_id, jti
              from iam.sessions
              where tenant_id = $1 and jti = $2
              union all
              select s.id, s.tenant_id, s.jti
              from iam.sessions s
              join family f on s.tenant_id = f.tenant_id and s.parent_jti = f.jti
            )
            update iam.sessions target
            set revoked_at = coalesce(target.revoked_at, now()),
                revoke_reason = coalesce(target.revoke_reason, 'refresh_replay_detected'),
                updated_at = now()
            from family
            where target.id = family.id
          `,
          [tenantId, row.jti],
          client
        );
        throw new UnauthorizedException({
          code: 'refresh_replay',
          message: 'Refresh token replay detected'
        });
      }

      const revokedRows = await this.databaseService!.query<{ id: string }>(
        `
          update iam.sessions
          set consumed_at = now(), rotated_at = now(), revoked_at = now(), revoke_reason = 'rotated', updated_at = now()
          where id = $1 and revoked_at is null
          returning id
        `,
        [row.id],
        client
      );
      if (!revokedRows.length) {
        return null;
      }

      return {
        id: row.id,
        tenantId: row.tenant_id,
        userId: row.user_id,
        jti: row.jti,
        parentJti: row.parent_jti ?? undefined,
        refreshTokenHash: row.refresh_token_hash,
        csrfTokenHash: row.csrf_token_hash ?? undefined,
        expiresAt: row.expires_at
      } as Session;
    });

    if (consumed) {
      return consumed;
    }

    const activeSession = this.sessions.find(
      (session) => session.tenantId === tenantId && session.refreshTokenHash === refreshTokenHash
    );
    if (!activeSession) {
      throw new UnauthorizedException({
        code: 'invalid_refresh',
        message: 'Refresh token is invalid'
      });
    }
    if (activeSession.csrfTokenHash !== csrfTokenHash) {
      throw new UnauthorizedException({ code: 'invalid_csrf', message: 'Invalid CSRF token' });
    }
    if (activeSession.consumedAt || activeSession.revokedAt) {
      this.revokeFamilyInMemory(tenantId, activeSession.jti, 'refresh_replay_detected');
      throw new UnauthorizedException({
        code: 'refresh_replay',
        message: 'Refresh token replay detected'
      });
    }
    const now = new Date().toISOString();
    activeSession.consumedAt = now;
    activeSession.rotatedAt = now;
    activeSession.revokedAt = now;
    activeSession.revokeReason = 'rotated';
    return activeSession;
  }

  private revokeFamilyInMemory(tenantId: string, rootJti: string, reason: string): void {
    const family = new Set<string>([rootJti]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const session of this.sessions) {
        if (
          session.tenantId === tenantId &&
          session.parentJti &&
          family.has(session.parentJti) &&
          !family.has(session.jti)
        ) {
          family.add(session.jti);
          changed = true;
        }
      }
    }

    const now = new Date().toISOString();
    this.sessions = this.sessions.map((session) => {
      if (session.tenantId !== tenantId || !family.has(session.jti)) {
        return session;
      }
      return {
        ...session,
        revokedAt: session.revokedAt ?? now,
        revokeReason: session.revokeReason ?? reason
      };
    });
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
    this.sessions = this.sessions.map((session) => {
      if (session.id === sessionId && session.tenantId === tenantId && session.userId === userId) {
        return { ...session, revokedAt: new Date().toISOString() };
      }
      return session;
    });
  }
}
