import { randomBytes, randomUUID } from 'node:crypto';

import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional
} from '@nestjs/common';

import { DatabaseService } from '../../../infrastructure/database/database.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { hashPassword, unusablePasswordHash } from '../crypto.util.js';
import { toUserResponse } from '../iam-response.mapper.js';

import type { Permission, Role, User, UserPublicDto } from '../iam.types.js';

export type ResolvedLoginUser = { user: User; databaseBacked: boolean };
export interface SuperTokensUserBridge {
  id: string;
  tenantId: string;
  userId: string;
  supertokensUserId: string;
  passwordMigrationStatus: 'pending' | 'imported' | 'rehash_completed' | 'failed';
  rehashRequired: boolean;
}

@Injectable()
export class IamService {
  private readonly fallbackUsers: User[] = [
    {
      id: 'u_platform_admin',
      tenantId: 'tenant_demo',
      login: 'platform_admin',
      email: 'platform@demo.local',
      passwordHash: hashPassword('Password123!'),
      status: 'active',
      displayName: 'Platform Admin'
    },
    {
      id: 'u_tenant_admin',
      tenantId: 'tenant_demo',
      login: 'tenant_admin',
      email: 'tenant@demo.local',
      passwordHash: hashPassword('Password123!'),
      status: 'active',
      displayName: 'Tenant Admin'
    },
    {
      id: 'u_manager',
      tenantId: 'tenant_demo',
      login: 'manager',
      email: 'manager@demo.local',
      passwordHash: hashPassword('Password123!'),
      status: 'active',
      displayName: 'Manager'
    },
    {
      id: 'u_methodist',
      tenantId: 'tenant_demo',
      login: 'methodist',
      email: 'methodist@demo.local',
      passwordHash: hashPassword('Password123!'),
      status: 'active',
      displayName: 'Methodist'
    },
    {
      id: 'u_blocked',
      tenantId: 'tenant_demo',
      login: 'blocked_user',
      email: 'blocked@demo.local',
      passwordHash: hashPassword('Password123!'),
      status: 'blocked',
      displayName: 'Blocked User'
    }
  ];

  private readonly fallbackRoles: Role[] = [
    {
      id: 'r_platform_admin',
      tenantId: 'tenant_demo',
      code: 'platform_admin',
      name: 'Администратор платформы'
    },
    {
      id: 'r_tenant_admin',
      tenantId: 'tenant_demo',
      code: 'tenant_admin',
      name: 'Администратор центра'
    },
    { id: 'r_manager', tenantId: 'tenant_demo', code: 'manager', name: 'Руководитель' },
    { id: 'r_methodist', tenantId: 'tenant_demo', code: 'methodist', name: 'Методист' }
  ];

  private readonly fallbackPermissions: Permission[] = [
    { id: 'p_auth_manage_sessions', code: 'auth.manage_sessions', description: 'Manage sessions' },
    { id: 'p_iam_manage_roles', code: 'iam.manage_roles', description: 'Assign roles' },
    { id: 'p_tenant_read', code: 'tenant.read', description: 'Read tenant' },
    {
      id: 'p_assessment_read_cross_learner',
      code: 'assessment.read.cross_learner',
      description: 'Read assessment rows for any learner (bypass IAM-linked row scope on GET/list)'
    },
    {
      id: 'p_learners_act_as',
      code: 'learners.act_as',
      description:
        'Mutate learner-linked progress/submissions/attempts on behalf of delegated staff'
    }
  ];

  private fallbackUserRoles = new Map<string, string[]>([
    ['u_platform_admin', ['r_platform_admin']],
    ['u_tenant_admin', ['r_tenant_admin']],
    ['u_manager', ['r_manager']],
    ['u_methodist', ['r_methodist']],
    ['u_blocked', ['r_manager']]
  ]);

  constructor(
    @Inject(AuditService)
    private readonly auditService: AuditService,
    @Inject(DatabaseService)
    @Optional()
    private readonly databaseService?: DatabaseService
  ) {}

  async findOrCreateByEmail(tenantId: string, rawEmail: string): Promise<ResolvedLoginUser> {
    const email = rawEmail.toLowerCase().trim();

    if (!this.databaseService) {
      const existing = this.fallbackUsers.find(
        (u) => u.tenantId === tenantId && (u.email ?? '').toLowerCase() === email
      );
      if (existing) {
        return { user: existing, databaseBacked: false };
      }
      const user: User = {
        id: `u_${randomUUID().replace(/-/g, '')}`,
        tenantId,
        login: `magic_${randomUUID().replace(/-/g, '')}`,
        email,
        passwordHash: hashPassword(randomBytes(32).toString('hex')),
        status: 'active',
        displayName: email.split('@')[0] || email
      };
      this.fallbackUsers.push(user);
      return { user, databaseBacked: false };
    }

    const rows = await this.databaseService.query<{
      id: string;
      tenant_id: string;
      login: string;
      email: string | null;
      password_hash: string;
      status: 'active' | 'blocked';
      display_name: string;
      totp_secret_encrypted: string | null;
      totp_enabled: boolean;
      totp_last_used_step: string | number | null;
    }>(
      `
        select id, tenant_id, login, email, password_hash, status, display_name, totp_secret_encrypted, totp_enabled, totp_last_used_step
        from iam.users
        where tenant_id = $1 and lower(email) = $2 and deleted_at is null
        limit 1
      `,
      [tenantId, email]
    );

    if (rows[0]) {
      return { user: this.toUser(rows[0]), databaseBacked: true };
    }

    const id = `u_${randomUUID().replace(/-/g, '')}`;
    const login = `magic_${randomUUID().replace(/-/g, '')}`;
    const passwordHash = hashPassword(randomBytes(32).toString('hex'));
    const displayName = email.split('@')[0] || email;

    await this.databaseService.query(
      `
        insert into iam.users (id, tenant_id, login, email, password_hash, status, display_name)
        values ($1, $2, $3, $4, $5, 'active', $6)
      `,
      [id, tenantId, login, email, passwordHash, displayName]
    );

    return { user: await this.getUser(tenantId, id), databaseBacked: true };
  }

  async findUserByLogin(tenantId: string, login: string): Promise<ResolvedLoginUser | undefined> {
    if (!this.databaseService) {
      const user = this.fallbackUsers.find((u) => u.tenantId === tenantId && u.login === login);
      return user ? { user, databaseBacked: false } : undefined;
    }

    const rows = await this.databaseService.query<{
      id: string;
      tenant_id: string;
      login: string;
      email: string | null;
      password_hash: string;
      status: 'active' | 'blocked';
      display_name: string;
      totp_secret_encrypted: string | null;
      totp_enabled: boolean;
      totp_last_used_step: string | number | null;
    }>(
      `
        select id, tenant_id, login, email, password_hash, status, display_name, totp_secret_encrypted, totp_enabled, totp_last_used_step
        from iam.users
        where tenant_id = $1 and login = $2 and deleted_at is null
        limit 1
      `,
      [tenantId, login]
    );

    if (rows[0]) {
      return { user: this.toUser(rows[0]), databaseBacked: true };
    }

    const fallback = this.fallbackUsers.find(
      (user) => user.tenantId === tenantId && user.login === login
    );
    return fallback ? { user: fallback, databaseBacked: false } : undefined;
  }

  /** Пользователь есть в БД (не только dev-fallback в памяти). */
  async isUserPersistedInDatabase(tenantId: string, userId: string): Promise<boolean> {
    if (!this.databaseService) {
      return false;
    }

    const rows = await this.databaseService.query<{ one: number }>(
      `
        select 1 as one
        from iam.users
        where tenant_id = $1 and id = $2 and deleted_at is null
        limit 1
      `,
      [tenantId, userId]
    );

    return rows.length > 0;
  }

  async getUser(tenantId: string, userId: string): Promise<User> {
    if (!this.databaseService) {
      const user = this.fallbackUsers.find(
        (item) => item.id === userId && item.tenantId === tenantId
      );
      if (!user) {
        throw new NotFoundException({ code: 'user_not_found', message: 'User not found' });
      }
      return user;
    }

    const rows = await this.databaseService.query<{
      id: string;
      tenant_id: string;
      login: string;
      email: string | null;
      password_hash: string;
      status: 'active' | 'blocked';
      display_name: string;
      counterparty_id: string | null;
      totp_secret_encrypted: string | null;
      totp_enabled: boolean;
      totp_last_used_step: string | number | null;
    }>(
      `
        select id, tenant_id, login, email, password_hash, status, display_name, counterparty_id, totp_secret_encrypted, totp_enabled, totp_last_used_step
        from iam.users
        where tenant_id = $1 and id = $2 and deleted_at is null
        limit 1
      `,
      [tenantId, userId]
    );

    const user = rows[0];
    if (user) {
      return this.toUser(user);
    }

    const fallbackUser = this.fallbackUsers.find(
      (item) => item.id === userId && item.tenantId === tenantId
    );
    if (fallbackUser) {
      return fallbackUser;
    }

    throw new NotFoundException({ code: 'user_not_found', message: 'User not found' });
  }

  async findSuperTokensBridgeByUserId(
    tenantId: string,
    userId: string
  ): Promise<SuperTokensUserBridge | null> {
    if (!this.databaseService) {
      return null;
    }

    const rows = await this.databaseService.query<{
      id: string;
      tenant_id: string;
      user_id: string;
      supertokens_user_id: string;
      password_migration_status: 'pending' | 'imported' | 'rehash_completed' | 'failed';
      rehash_required: boolean;
    }>(
      `
        select id, tenant_id, user_id, supertokens_user_id, password_migration_status, rehash_required
        from iam.supertokens_user_bridge
        where tenant_id = $1 and user_id = $2 and deleted_at is null
        limit 1
      `,
      [tenantId, userId]
    );

    const row = rows[0];
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      supertokensUserId: row.supertokens_user_id,
      passwordMigrationStatus: row.password_migration_status,
      rehashRequired: row.rehash_required
    };
  }

  async upsertSuperTokensBridge(params: {
    tenantId: string;
    userId: string;
    supertokensUserId: string;
    passwordMigrationStatus?: 'pending' | 'imported' | 'rehash_completed' | 'failed';
    rehashRequired?: boolean;
  }): Promise<SuperTokensUserBridge | null> {
    if (!this.databaseService) {
      return null;
    }

    const rows = await this.databaseService.query<{
      id: string;
      tenant_id: string;
      user_id: string;
      supertokens_user_id: string;
      password_migration_status: 'pending' | 'imported' | 'rehash_completed' | 'failed';
      rehash_required: boolean;
    }>(
      `
        insert into iam.supertokens_user_bridge (
          id,
          tenant_id,
          user_id,
          supertokens_user_id,
          password_migration_status,
          rehash_required
        )
        values ($1, $2, $3, $4, $5, $6)
        on conflict (tenant_id, user_id)
        do update set
          supertokens_user_id = excluded.supertokens_user_id,
          password_migration_status = excluded.password_migration_status,
          rehash_required = excluded.rehash_required,
          deleted_at = null
        returning id, tenant_id, user_id, supertokens_user_id, password_migration_status, rehash_required
      `,
      [
        `stb_${randomUUID().replace(/-/g, '')}`,
        params.tenantId,
        params.userId,
        params.supertokensUserId,
        params.passwordMigrationStatus ?? 'pending',
        params.rehashRequired ?? true
      ]
    );

    const row = rows[0];
    if (!row) {
      throw new Error('Failed to upsert SuperTokens user bridge record');
    }

    return {
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      supertokensUserId: row.supertokens_user_id,
      passwordMigrationStatus: row.password_migration_status,
      rehashRequired: row.rehash_required
    };
  }

  /**
   * @param query.role код роли — отбор по носителям роли.
   *
   * Ревизия 2026-08-27 (порция 29, журнал 278): экран «Люди и доступ» отправлял выбранную
   * роль в параметре сортировки, которого этот метод не читает вовсе, — список приходил
   * целиком, а фильтр выглядел применённым. Отбор живёт здесь, а не на клиенте: клиент
   * отфильтровал бы только текущую страницу и врал бы иначе.
   */
  async listUsers(
    tenantId: string,
    query?: {
      q?: string;
      status?: string;
      page?: number;
      pageSize?: number;
      role?: string;
    }
  ): Promise<{ items: User[]; total: number; page: number; pageSize: number }> {
    const page = Math.max(1, query?.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query?.pageSize ?? 20));
    const roleCode = query?.role?.trim();
    // Отбор ПЕРЕД пагинацией: иначе счётчик и число страниц врали бы про весь список.
    const keepByRole = async (users: User[]): Promise<User[]> => {
      if (!roleCode) return users;
      const kept: User[] = [];
      for (const user of users) {
        const roles = await this.getUserRoles(tenantId, user.id);
        if (roles.some((role) => role.code === roleCode)) kept.push(user);
      }
      return kept;
    };

    if (!this.databaseService) {
      let rows = this.fallbackUsers.filter((user) => user.tenantId === tenantId);
      if (query?.q) {
        const value = query.q.toLowerCase();
        rows = rows.filter(
          (user) =>
            user.displayName.toLowerCase().includes(value) ||
            user.login.toLowerCase().includes(value) ||
            (user.email ?? '').toLowerCase().includes(value)
        );
      }
      if (query?.status) rows = rows.filter((user) => user.status === query.status);
      const byRole = await keepByRole(rows);
      const sorted = [...byRole].sort((a, b) => a.displayName.localeCompare(b.displayName));
      const start = (page - 1) * pageSize;
      return { items: sorted.slice(start, start + pageSize), total: sorted.length, page, pageSize };
    }

    const rows = await this.databaseService.query<{
      id: string;
      tenant_id: string;
      login: string;
      email: string | null;
      password_hash: string;
      status: 'active' | 'blocked';
      display_name: string;
      totp_secret_encrypted: string | null;
      totp_enabled: boolean;
      totp_last_used_step: string | number | null;
    }>(
      `
        select id, tenant_id, login, email, password_hash, status, display_name, totp_secret_encrypted, totp_enabled, totp_last_used_step
        from iam.users
        where tenant_id = $1 and deleted_at is null
        order by created_at desc
      `,
      [tenantId]
    );

    const normalized = rows.map((row) => this.toUser(row));
    const filtered = normalized
      .filter((user) => (query?.status ? user.status === query.status : true))
      .filter((user) =>
        query?.q
          ? `${user.displayName} ${user.login} ${user.email ?? ''}`
              .toLowerCase()
              .includes(query.q.toLowerCase())
          : true
      );
    const byRole = await keepByRole(filtered);
    const start = (page - 1) * pageSize;
    return {
      items: byRole.slice(start, start + pageSize),
      total: byRole.length,
      page,
      pageSize
    };
  }

  /**
   * Ревизия 2026-08-27 (порция 31, журнал 269): БЕЗ пароля учётка создаётся без
   * возможности входа по паролю.
   *
   * Раньше пустое поле означало публично известный `Password123!` — он лежит и в
   * документации стенда, и в демо-миграции, то есть администратор заводил сотрудника,
   * а получал учётку, в которую может войти любой, кто читал наши же документы.
   * Исправить её потом было нечем: ручек смены и сброса пароля в продукте нет.
   *
   * Вход у такого человека один — по ссылке на почту (работает с порции 23), поэтому
   * почта в этом случае обязательна: иначе войти было бы нечем вовсе.
   */
  async createUser(
    tenantId: string,
    payload: {
      login: string;
      email?: string | null;
      displayName: string;
      status?: 'active' | 'blocked';
      password?: string;
    },
    auditMeta?: { actorId?: string; requestId?: string; correlationId?: string }
  ): Promise<User> {
    if (!payload.password && !payload.email) {
      throw new BadRequestException({
        code: 'user_login_method_required',
        message: 'Укажите пароль или адрес почты: без пароля человек входит по ссылке на почту'
      });
    }
    const passwordHash = payload.password ? hashPassword(payload.password) : unusablePasswordHash();
    if (!this.databaseService) {
      const user: User = {
        id: `u_${payload.login}`,
        tenantId,
        login: payload.login,
        email: payload.email ?? null,
        passwordHash,
        status: payload.status ?? 'active',
        displayName: payload.displayName
      };
      this.fallbackUsers.push(user);
      this.auditService.write({
        tenantId,
        actorId: auditMeta?.actorId,
        requestId: auditMeta?.requestId,
        correlationId: auditMeta?.correlationId,
        action: 'iam.user_created',
        entityType: 'iam.user',
        entityId: user.id,
        newValues: { login: user.login, displayName: user.displayName, status: user.status }
      });
      return user;
    }

    const id = `u_${randomUUID().replace(/-/g, '')}`;
    await this.databaseService.query(
      `
        insert into iam.users (id, tenant_id, login, email, password_hash, status, display_name)
        values ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        id,
        tenantId,
        payload.login,
        payload.email ?? null,
        passwordHash,
        payload.status ?? 'active',
        payload.displayName
      ]
    );

    const created = await this.getUser(tenantId, id);
    this.auditService.write({
      tenantId,
      actorId: auditMeta?.actorId,
      requestId: auditMeta?.requestId,
      correlationId: auditMeta?.correlationId,
      action: 'iam.user_created',
      entityType: 'iam.user',
      entityId: created.id,
      newValues: { login: created.login, displayName: created.displayName, status: created.status }
    });
    return created;
  }

  async updateUser(
    tenantId: string,
    userId: string,
    payload: { email?: string | null; displayName?: string; status?: 'active' | 'blocked' }
  ): Promise<User> {
    if (!this.databaseService) {
      const user = await this.getUser(tenantId, userId);
      if (payload.email !== undefined) user.email = payload.email;
      if (payload.displayName !== undefined) user.displayName = payload.displayName;
      if (payload.status !== undefined) user.status = payload.status;
      return user;
    }

    const current = await this.getUser(tenantId, userId);
    await this.databaseService.query(
      `
        update iam.users
        set
          email = $3,
          display_name = $4,
          status = $5,
          updated_at = now()
        where tenant_id = $1 and id = $2 and deleted_at is null
      `,
      [
        tenantId,
        userId,
        payload.email !== undefined ? payload.email : current.email,
        payload.displayName ?? current.displayName,
        payload.status ?? current.status
      ]
    );

    return this.getUser(tenantId, userId);
  }

  /**
   * Replace stored password hash after successful verify (e.g. migrate legacy SQL seed SHA-256 to scrypt).
   */
  async upgradePasswordHash(
    tenantId: string,
    userId: string,
    newPasswordHash: string
  ): Promise<void> {
    if (!this.databaseService) {
      const user = this.fallbackUsers.find((u) => u.tenantId === tenantId && u.id === userId);
      if (!user) {
        throw new NotFoundException({ code: 'user_not_found', message: 'User not found' });
      }
      user.passwordHash = newPasswordHash;
      return;
    }

    await this.databaseService.query(
      `
        update iam.users
        set password_hash = $3, updated_at = now()
        where tenant_id = $1 and id = $2 and deleted_at is null
      `,
      [tenantId, userId, newPasswordHash]
    );
  }

  /** 2FA (ФТ-G3): сохранить свежесгенерированный секрет; сама 2FA включается отдельно (confirm). */
  async setTotpSecret(tenantId: string, userId: string, encryptedSecret: string): Promise<void> {
    if (!this.databaseService) {
      const user = this.requireFallbackUser(tenantId, userId);
      user.totpSecretEncrypted = encryptedSecret;
      user.totpEnabled = false;
      user.totpLastUsedStep = null;
      return;
    }
    await this.databaseService.query(
      `
        update iam.users
        set totp_secret_encrypted = $3, totp_enabled = false, totp_last_used_step = null,
            updated_at = now()
        where tenant_id = $1 and id = $2 and deleted_at is null
      `,
      [tenantId, userId, encryptedSecret]
    );
  }

  /** 2FA: включить после подтверждения кодом; выключение стирает секрет и анти-replay шаг. */
  async setTotpEnabled(tenantId: string, userId: string, enabled: boolean): Promise<void> {
    if (!this.databaseService) {
      const user = this.requireFallbackUser(tenantId, userId);
      user.totpEnabled = enabled;
      if (!enabled) {
        user.totpSecretEncrypted = null;
        user.totpLastUsedStep = null;
      }
      return;
    }
    await this.databaseService.query(
      enabled
        ? `
            update iam.users
            set totp_enabled = true, updated_at = now()
            where tenant_id = $1 and id = $2 and deleted_at is null
          `
        : `
            update iam.users
            set totp_enabled = false, totp_secret_encrypted = null, totp_last_used_step = null,
                updated_at = now()
            where tenant_id = $1 and id = $2 and deleted_at is null
          `,
      [tenantId, userId]
    );
  }

  /** 2FA: зафиксировать принятый шаг TOTP — тот же код второй раз не пройдёт (anti-replay). */
  async updateTotpLastUsedStep(tenantId: string, userId: string, step: number): Promise<void> {
    if (!this.databaseService) {
      const user = this.requireFallbackUser(tenantId, userId);
      user.totpLastUsedStep = step;
      return;
    }
    await this.databaseService.query(
      `
        update iam.users
        set totp_last_used_step = greatest(coalesce(totp_last_used_step, 0), $3), updated_at = now()
        where tenant_id = $1 and id = $2 and deleted_at is null
      `,
      [tenantId, userId, step]
    );
  }

  private requireFallbackUser(tenantId: string, userId: string): User {
    const user = this.fallbackUsers.find((u) => u.tenantId === tenantId && u.id === userId);
    if (!user) {
      throw new NotFoundException({ code: 'user_not_found', message: 'User not found' });
    }
    return user;
  }

  async getRoles(tenantId: string): Promise<Role[]> {
    if (!this.databaseService) {
      return this.fallbackRoles.filter((role) => role.tenantId === tenantId);
    }

    const rows = await this.databaseService.query<{
      id: string;
      tenant_id: string;
      code: string;
      name: string;
    }>('select id, tenant_id, code, name from iam.roles where tenant_id = $1 order by code asc', [
      tenantId
    ]);

    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      code: row.code,
      name: row.name
    }));
  }

  async getPermissions(): Promise<Permission[]> {
    if (!this.databaseService) {
      return [...this.fallbackPermissions];
    }

    const rows = await this.databaseService.query<{
      id: string;
      code: string;
      description: string;
    }>('select id, code, description from iam.permissions order by code asc');

    return rows.map((row) => ({ id: row.id, code: row.code, description: row.description }));
  }

  async getUserRoles(tenantId: string, userId: string): Promise<Role[]> {
    await this.getUser(tenantId, userId);

    if (!this.databaseService) {
      const roleIds = this.fallbackUserRoles.get(userId) ?? [];
      return this.fallbackRoles.filter(
        (role) => role.tenantId === tenantId && roleIds.includes(role.id)
      );
    }

    const rows = await this.databaseService.query<{
      id: string;
      tenant_id: string;
      code: string;
      name: string;
    }>(
      `
        select r.id, r.tenant_id, r.code, r.name
        from iam.user_roles ur
        join iam.roles r on r.id = ur.role_id and r.tenant_id = ur.tenant_id
        where ur.tenant_id = $1 and ur.user_id = $2
        order by r.code asc
      `,
      [tenantId, userId]
    );

    if (rows.length > 0) {
      return rows.map((row) => ({
        id: row.id,
        tenantId: row.tenant_id,
        code: row.code,
        name: row.name
      }));
    }

    const roleIds = this.fallbackUserRoles.get(userId) ?? [];
    return this.fallbackRoles.filter(
      (role) => role.tenantId === tenantId && roleIds.includes(role.id)
    );
  }

  /**
   * Коды ролей для НЕСКОЛЬКИХ пользователей сразу — ОДНИМ запросом (ТЗ 5.6 / Э6).
   *
   * Экран «Люди и доступ» давал отбор по роли, а колонки с ролью в таблице не было: человек
   * отбирал вслепую и не видел, что за роль у найденных (журнал 453). Роли берутся только
   * для строк текущей страницы — их не больше `page_size`, — и одним запросом, а не по
   * одному на человека: двадцать обращений к базе на каждый показ списка мы уже проходили.
   */
  async roleCodesOfUsers(tenantId: string, userIds: string[]): Promise<Record<string, string[]>> {
    const result: Record<string, string[]> = Object.fromEntries(userIds.map((id) => [id, []]));
    if (userIds.length === 0) return result;

    if (!this.databaseService) {
      for (const userId of userIds) {
        const roleIds = this.fallbackUserRoles.get(userId) ?? [];
        result[userId] = this.fallbackRoles
          .filter((role) => role.tenantId === tenantId && roleIds.includes(role.id))
          .map((role) => role.code)
          .sort();
      }
      return result;
    }

    const rows = await this.databaseService.query<{ user_id: string; code: string }>(
      `
        select ur.user_id, r.code
        from iam.user_roles ur
        join iam.roles r on r.id = ur.role_id and r.tenant_id = ur.tenant_id
        where ur.tenant_id = $1 and ur.user_id = any($2)
        order by r.code asc
      `,
      [tenantId, userIds]
    );
    for (const row of rows) {
      (result[row.user_id] ??= []).push(row.code);
    }
    return result;
  }

  async setUserRoles(
    tenantId: string,
    userId: string,
    roleCodes: string[],
    actorId?: string,
    requestId?: string,
    correlationId?: string
  ): Promise<Role[]> {
    await this.getUser(tenantId, userId);
    const previousRoles = (await this.getUserRoles(tenantId, userId)).map((role) => role.code);

    if (!this.databaseService) {
      const selected = this.fallbackRoles.filter(
        (role) => role.tenantId === tenantId && roleCodes.includes(role.code)
      );
      if (selected.length !== roleCodes.length) {
        throw new NotFoundException({
          code: 'role_not_found',
          message: 'One or more roles not found'
        });
      }
      this.fallbackUserRoles.set(
        userId,
        selected.map((role) => role.id)
      );
      this.auditService.write({
        tenantId,
        actorId,
        action: 'iam.user_roles_updated',
        entityType: 'iam.user',
        entityId: userId,
        requestId,
        correlationId,
        oldValues: { roleCodes: previousRoles },
        newValues: { roleCodes }
      });
      return selected;
    }

    const roles = await this.databaseService.query<{
      id: string;
      tenant_id: string;
      code: string;
      name: string;
    }>(
      'select id, tenant_id, code, name from iam.roles where tenant_id = $1 and code = any($2::text[])',
      [tenantId, roleCodes]
    );

    if (roles.length !== roleCodes.length) {
      throw new NotFoundException({
        code: 'role_not_found',
        message: 'One or more roles not found'
      });
    }

    await this.databaseService.withTransaction(async (client) => {
      await this.databaseService!.query(
        'delete from iam.user_roles where tenant_id = $1 and user_id = $2',
        [tenantId, userId],
        client
      );
      for (const role of roles) {
        await this.databaseService!.query(
          'insert into iam.user_roles (id, tenant_id, user_id, role_id) values ($1, $2, $3, $4)',
          [`ur_${randomUUID().replace(/-/g, '')}`, tenantId, userId, role.id],
          client
        );
      }
    });

    this.auditService.write({
      tenantId,
      actorId,
      action: 'iam.user_roles_updated',
      entityType: 'iam.user',
      entityId: userId,
      requestId,
      correlationId,
      oldValues: { roleCodes: previousRoles },
      newValues: { roleCodes }
    });

    return roles.map((role) => ({
      id: role.id,
      tenantId: role.tenant_id,
      code: role.code,
      name: role.name
    }));
  }

  /**
   * ФТ-E5 (Фаза 4): права актора ВМЕСТЕ с его привязкой к контрагенту — одной загрузкой.
   *
   * Гвард ставит привязку в `RequestContext` на каждом запросе, поэтому отдельный поход
   * в БД за ней означал бы лишний запрос на каждый вызов API. Пользователь и так
   * загружается при разрешении прав — привязка едет тем же рейсом.
   */
  async resolveActorScope(
    tenantId: string,
    userId: string
  ): Promise<{ permissions: string[]; counterpartyId?: string }> {
    const user = await this.getUser(tenantId, userId);
    const permissions = await this.resolvePermissionsForLoadedUser(tenantId, userId);
    return {
      permissions,
      ...(user.counterpartyId ? { counterpartyId: user.counterpartyId } : {})
    };
  }

  async resolvePermissions(tenantId: string, userId: string): Promise<string[]> {
    await this.getUser(tenantId, userId);
    return this.resolvePermissionsForLoadedUser(tenantId, userId);
  }

  private async resolvePermissionsForLoadedUser(
    tenantId: string,
    userId: string
  ): Promise<string[]> {
    if (!this.databaseService) {
      // DB-less fallback (dev / unit tests only): there is no per-role permission map here —
      // just a flat staff permission set — so every seeded user resolves to that full set.
      // The previous admin-role check was dead (both branches returned the same list, §5.158).
      // Production always injects a databaseService and runs the role-gated SQL below, so this
      // coarse path never executes there.
      return this.fallbackPermissions.map((permission) => permission.code);
    }

    const rows = await this.databaseService.query<{ code: string }>(
      `
        select distinct p.code
        from iam.user_roles ur
        join iam.role_permissions rp
          on rp.tenant_id = ur.tenant_id
         and rp.role_id = ur.role_id
        join iam.permissions p
          on p.id = rp.permission_id
        where ur.tenant_id = $1
          and ur.user_id = $2
      `,
      [tenantId, userId]
    );

    return rows.map((row) => row.code);
  }

  toPublicUser(user: User): UserPublicDto {
    return toUserResponse(user);
  }

  toPublicUsers(users: User[]): UserPublicDto[] {
    return users.map((user) => this.toPublicUser(user));
  }

  private toUser(row: {
    id: string;
    tenant_id: string;
    login: string;
    email: string | null;
    password_hash: string;
    status: 'active' | 'blocked';
    display_name: string;
    counterparty_id?: string | null;
    totp_secret_encrypted?: string | null;
    totp_enabled?: boolean;
    // pg отдаёт bigint строкой — нормализуем в number.
    totp_last_used_step?: string | number | null;
  }): User {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      login: row.login,
      email: row.email,
      passwordHash: row.password_hash,
      status: row.status,
      displayName: row.display_name,
      counterpartyId: row.counterparty_id ?? null,
      totpEnabled: row.totp_enabled ?? false,
      totpSecretEncrypted: row.totp_secret_encrypted ?? null,
      totpLastUsedStep: row.totp_last_used_step == null ? null : Number(row.totp_last_used_step)
    };
  }
}
