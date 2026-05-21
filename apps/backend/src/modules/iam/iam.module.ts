import { Module, type Provider, forwardRef } from '@nestjs/common';

import { AuthController } from './auth.controller.js';
import { PermissionGuard } from './permission.guard.js';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from './modules/auth.module.js';
import { PermissionsModule } from './modules/permissions.module.js';
import { RolesModule } from './modules/roles.module.js';
import { SessionsModule } from './modules/sessions.module.js';
import { UsersModule } from './modules/users.module.js';
import { AuthService } from './services/auth.service.js';
import { IamService } from './services/iam.service.js';
import { InMemoryMagicLinkTokenRepo } from './services/in-memory-magic-link-token-repo.js';
import {
  LoggingMagicLinkEmailSender,
  MAGIC_LINK_EMAIL_SENDER
} from './services/magic-link-email-sender.js';
import {
  MAGIC_LINK_SERVICE_CONFIG,
  MAGIC_LINK_TOKEN_REPO,
  MagicLinkService,
  type MagicLinkServiceConfig
} from './services/magic-link.service.js';
import { PostgresMagicLinkTokenRepo } from './services/postgres-magic-link-token-repo.js';
import { DatabaseService } from '../../infrastructure/database/database.service.js';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module.js';

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

const magicLinkProviders: Provider[] = [
  {
    provide: MAGIC_LINK_SERVICE_CONFIG,
    useValue: { ttlMs: FIFTEEN_MINUTES_MS } satisfies MagicLinkServiceConfig
  },
  {
    provide: MAGIC_LINK_TOKEN_REPO,
    useFactory: (db?: DatabaseService) =>
      db ? new PostgresMagicLinkTokenRepo(db) : new InMemoryMagicLinkTokenRepo(),
    inject: [{ token: DatabaseService, optional: true }]
  },
  {
    provide: MAGIC_LINK_EMAIL_SENDER,
    useClass: LoggingMagicLinkEmailSender
  },
  MagicLinkService
];

@Module({
  imports: [
    InfrastructureModule,
    forwardRef(() => AuditModule),
    AuthModule,
    UsersModule,
    RolesModule,
    PermissionsModule,
    SessionsModule
  ],
  controllers: [AuthController],
  providers: [IamService, AuthService, PermissionGuard, ...magicLinkProviders],
  exports: [IamService, AuthService, MagicLinkService]
})
export class IamModule {}
