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
import { WebinarsController } from './webinars.controller.js';
import { WEBINARS_REPOSITORY } from './webinars.repository.js';
import { WebinarsService } from './webinars.service.js';
import { backendEnv } from '../../env.js';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module.js';
import { MAILER, NoopMailer } from '../../infrastructure/mailer/mailer.service.js';
import { SmtpMailer } from '../../infrastructure/mailer/smtp-mailer.service.js';
import { IamModule } from '../iam/iam.module.js';

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
    EnrollmentEmailListener
  ],
  exports: [NotificationsService, ChatService, WebinarsService, NotificationDispatcher]
})
export class CommunicationModule {}
