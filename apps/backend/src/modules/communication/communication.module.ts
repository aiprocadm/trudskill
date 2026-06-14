import { Module } from '@nestjs/common';

import { ChatController } from './chat.controller.js';
import { CHAT_REPOSITORY } from './chat.repository.js';
import { ChatService } from './chat.service.js';
import { EMAIL_DELIVERIES_REPOSITORY } from './email-deliveries.repository.js';
import { EmailNotificationsController } from './email-notifications.controller.js';
import { EMAIL_TEMPLATES_REPOSITORY } from './email-templates.repository.js';
import { EnrollmentEmailListener } from './enrollment-email.listener.js';
import { InMemoryChatState } from './in-memory-chat.state.js';
import { InMemoryEmailDeliveriesState } from './in-memory-email-deliveries.state.js';
import { InMemoryEmailTemplatesState } from './in-memory-email-templates.state.js';
import { InMemoryNotificationsState } from './in-memory-notifications.state.js';
import { InMemoryWebinarsState } from './in-memory-webinars.state.js';
import { NotificationDispatcher } from './notification-dispatcher.service.js';
import { NOTIFICATIONS_STATE } from './notifications-state.token.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { PostgresChatRepository } from './postgres-chat.repository.js';
import { PostgresEmailDeliveriesRepository } from './postgres-email-deliveries.repository.js';
import { PostgresEmailTemplatesRepository } from './postgres-email-templates.repository.js';
import { PostgresWebinarsRepository } from './postgres-webinars.repository.js';
import { NoopWebPushSender } from './web-push/noop-web-push-sender.js';
import { WEB_PUSH_SENDER } from './web-push/web-push-sender.js';
import { WebPushSender } from './web-push/web-push-sender.service.js';
import { WebinarsController } from './webinars.controller.js';
import { WEBINARS_REPOSITORY } from './webinars.repository.js';
import { WebinarsService } from './webinars.service.js';
import { backendEnv } from '../../env.js';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module.js';
import { MAILER, NoopMailer } from '../../infrastructure/mailer/mailer.service.js';
import { SmtpMailer } from '../../infrastructure/mailer/smtp-mailer.service.js';
import { IamModule } from '../iam/iam.module.js';
import { MvpPersistenceRepositoryAdapter } from '../mvp/infrastructure/mvp-persistence.repository.adapter.js';
import { MVP_PERSISTENCE_BACKEND } from '../mvp/infrastructure/mvp-persistence.token.js';
import { MvpTenantRunner } from '../mvp/infrastructure/mvp-tenant-runner.service.js';
import { PostgresMvpPersistenceBackend } from '../mvp/infrastructure/postgres-mvp-persistence.backend.js';

@Module({
  imports: [InfrastructureModule, IamModule],
  controllers: [
    NotificationsController,
    ChatController,
    WebinarsController,
    EmailNotificationsController
  ],
  providers: [
    { provide: NOTIFICATIONS_STATE, useClass: InMemoryNotificationsState },
    PostgresChatRepository,
    { provide: CHAT_REPOSITORY, useClass: PostgresChatRepository },
    PostgresWebinarsRepository,
    { provide: WEBINARS_REPOSITORY, useClass: PostgresWebinarsRepository },
    InMemoryChatState,
    InMemoryWebinarsState,
    NotificationsService,
    WebinarsService,
    ChatService,
    {
      provide: MAILER,
      useFactory: () =>
        backendEnv.NOTIFICATIONS_EMAIL_ENABLED
          ? new SmtpMailer({
              host: backendEnv.SMTP_HOST ?? '',
              port: backendEnv.SMTP_PORT,
              from: backendEnv.SMTP_FROM,
              ...(backendEnv.SMTP_USER ? { user: backendEnv.SMTP_USER } : {}),
              ...(backendEnv.SMTP_PASSWORD ? { password: backendEnv.SMTP_PASSWORD } : {})
            })
          : new NoopMailer()
    },
    PostgresEmailTemplatesRepository,
    { provide: EMAIL_TEMPLATES_REPOSITORY, useClass: PostgresEmailTemplatesRepository },
    PostgresEmailDeliveriesRepository,
    { provide: EMAIL_DELIVERIES_REPOSITORY, useClass: PostgresEmailDeliveriesRepository },
    InMemoryEmailTemplatesState,
    InMemoryEmailDeliveriesState,
    NotificationDispatcher,
    EnrollmentEmailListener,
    // Phase 10 Track C — web-push fan-out. Dormant by default: NoopWebPushSender (no deps).
    // When WEB_PUSH_ENABLED=true, the real WebPushSender loads recipient subscriptions from
    // MVP-state via its own MvpTenantRunner (built here from infra to avoid importing MvpModule,
    // which would be circular — MvpModule already imports CommunicationModule). Both runners read
    // the same postgres tables through the shared singleton DatabaseService, so state is consistent.
    PostgresMvpPersistenceBackend,
    { provide: MVP_PERSISTENCE_BACKEND, useClass: MvpPersistenceRepositoryAdapter },
    MvpTenantRunner,
    {
      provide: WEB_PUSH_SENDER,
      useFactory: (tenantRunner: MvpTenantRunner) =>
        backendEnv.WEB_PUSH_ENABLED ? new WebPushSender(tenantRunner) : new NoopWebPushSender(),
      inject: [MvpTenantRunner]
    }
  ],
  exports: [NotificationsService, ChatService, WebinarsService, NotificationDispatcher]
})
export class CommunicationModule {}
