import { Module } from '@nestjs/common';

import { ChatController } from './chat.controller.js';
import { CHAT_REPOSITORY } from './chat.repository.js';
import { ChatService } from './chat.service.js';
import { EMAIL_DELIVERIES_REPOSITORY } from './email-deliveries.repository.js';
import { EmailNotificationsController } from './email-notifications.controller.js';
import { EmailResendService } from './email-resend.service.js';
import { EMAIL_TEMPLATES_REPOSITORY } from './email-templates.repository.js';
import { EnrollmentEmailListener } from './enrollment-email.listener.js';
import { ExamIdentityEmailListener } from './exam-identity-email.listener.js';
import { InMemoryChatState } from './in-memory-chat.state.js';
import { InMemoryEmailDeliveriesState } from './in-memory-email-deliveries.state.js';
import { InMemoryEmailTemplatesState } from './in-memory-email-templates.state.js';
import { InMemoryNotificationsState } from './in-memory-notifications.state.js';
import { InMemoryWebinarProviderSettingsRepository } from './in-memory-webinar-provider-settings.repository.js';
import { InMemoryWebinarsState } from './in-memory-webinars.state.js';
import { NotificationDispatcher } from './notification-dispatcher.service.js';
import { NOTIFICATIONS_STATE } from './notifications-state.token.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { PostgresChatRepository } from './postgres-chat.repository.js';
import { PostgresEmailDeliveriesRepository } from './postgres-email-deliveries.repository.js';
import { PostgresEmailTemplatesRepository } from './postgres-email-templates.repository.js';
import { PostgresWebinarProviderSettingsRepository } from './postgres-webinar-provider-settings.repository.js';
import { PostgresWebinarsRepository } from './postgres-webinars.repository.js';
import { InMemorySmsProviderSettingsRepository } from './sms/in-memory-sms-provider-settings.repository.js';
import { PostgresSmsProviderSettingsRepository } from './sms/postgres-sms-provider-settings.repository.js';
import { SmsChannelService } from './sms/sms-channel.service.js';
import { SMS_PROVIDER_SETTINGS_REPOSITORY } from './sms/sms-provider-settings.repository.js';
import { SmsProviderSettingsService } from './sms/sms-provider-settings.service.js';
import { SmsController } from './sms/sms.controller.js';
import { NoopWebPushSender } from './web-push/noop-web-push-sender.js';
import { WEB_PUSH_SENDER } from './web-push/web-push-sender.js';
import { WebPushSender } from './web-push/web-push-sender.service.js';
import { WebinarProviderResolver } from './webinar-provider-resolver.service.js';
import { WEBINAR_PROVIDER_SETTINGS_REPOSITORY } from './webinar-provider-settings.repository.js';
import { WebinarProviderSettingsService } from './webinar-provider-settings.service.js';
import { WebinarsWebhookController } from './webinars-webhook.controller.js';
import { WebinarsController } from './webinars.controller.js';
import { WEBINARS_REPOSITORY } from './webinars.repository.js';
import { WebinarsService } from './webinars.service.js';
import { backendEnv } from '../../env.js';
import { DatabaseService } from '../../infrastructure/database/database.service.js';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module.js';
import { MAILER, NoopMailer } from '../../infrastructure/mailer/mailer.service.js';
import { SmtpMailer } from '../../infrastructure/mailer/smtp-mailer.service.js';
import { FakeSmsProvider } from '../../infrastructure/sms-provider/fake-sms.provider.js';
import {
  NoopSmsProvider,
  SMS_PROVIDER_REGISTRY,
  type SmsProvider,
  type SmsProviderCode,
  type SmsProviderRegistry
} from '../../infrastructure/sms-provider/sms.provider.js';
import { FakeWebinarProvider } from '../../infrastructure/webinar-provider/fake-webinar.provider.js';
import { JitsiWebinarProvider } from '../../infrastructure/webinar-provider/jitsi-webinar.provider.js';
import {
  NoopWebinarProvider,
  WEBINAR_PROVIDER_REGISTRY,
  type WebinarProvider,
  type WebinarProviderCode,
  type WebinarProviderRegistry
} from '../../infrastructure/webinar-provider/webinar.provider.js';
import { IamModule } from '../iam/iam.module.js';
import { MvpPersistenceRepositoryAdapter } from '../mvp/infrastructure/mvp-persistence.repository.adapter.js';
import { MVP_PERSISTENCE_BACKEND } from '../mvp/infrastructure/mvp-persistence.token.js';
import { MvpTenantRunner } from '../mvp/infrastructure/mvp-tenant-runner.service.js';
import { PostgresMvpPersistenceBackend } from '../mvp/infrastructure/postgres-mvp-persistence.backend.js';
import { TenantModule } from '../tenant/tenant.module.js';

@Module({
  // TenantModule — ради подписи бренда в письмах (ФТ-D3.1): диспетчер резолвит
  // имя центра через TenantService (@Optional, тесты живут и без него).
  imports: [InfrastructureModule, IamModule, TenantModule],
  controllers: [
    NotificationsController,
    ChatController,
    WebinarsController,
    WebinarsWebhookController,
    EmailNotificationsController,
    SmsController
  ],
  providers: [
    EmailResendService,
    { provide: NOTIFICATIONS_STATE, useClass: InMemoryNotificationsState },
    PostgresChatRepository,
    { provide: CHAT_REPOSITORY, useClass: PostgresChatRepository },
    PostgresWebinarsRepository,
    { provide: WEBINARS_REPOSITORY, useClass: PostgresWebinarsRepository },
    InMemoryChatState,
    InMemoryWebinarsState,
    NotificationsService,
    WebinarsService,
    PostgresWebinarProviderSettingsRepository,
    {
      provide: WEBINAR_PROVIDER_SETTINGS_REPOSITORY,
      useFactory: (db: DatabaseService) =>
        backendEnv.ALLOW_IN_MEMORY_STATE
          ? new InMemoryWebinarProviderSettingsRepository()
          : new PostgresWebinarProviderSettingsRepository(db),
      inject: [DatabaseService]
    },
    WebinarProviderSettingsService,
    // Phase 8 webinar seam. Multi-provider registry; the ACTIVE provider is chosen per-tenant by
    // WebinarProviderResolver. Ships dormant (WEBINARS_ENABLED=false → resolver always returns Noop).
    {
      provide: WEBINAR_PROVIDER_REGISTRY,
      useFactory: (): WebinarProviderRegistry =>
        new Map<WebinarProviderCode, WebinarProvider>([
          ['noop', new NoopWebinarProvider()],
          ['fake', new FakeWebinarProvider()],
          ['jitsi', new JitsiWebinarProvider('')]
        ])
    },
    // Объявлен фабрикой, а НЕ классом. У конструктора два последних параметра —
    // примитивы со значениями по умолчанию (флаг и режим запуска). При обычном
    // объявлении Nest берёт типы из метаданных и пытается найти в контейнере
    // Boolean и String, которых там нет: приложение падает на старте с
    // UnknownDependenciesException. Под tsx это не проявлялось — esbuild
    // не эмитит метаданные типов, и Nest просто не видел лишние параметры,
    // поэтому дефекта не замечали, пока не запустили собранный код.
    {
      provide: WebinarProviderResolver,
      useFactory: (registry: WebinarProviderRegistry, settings: WebinarProviderSettingsService) =>
        new WebinarProviderResolver(
          registry,
          settings,
          backendEnv.WEBINARS_ENABLED,
          backendEnv.NODE_ENV
        ),
      inject: [WEBINAR_PROVIDER_REGISTRY, WebinarProviderSettingsService]
    },
    /*
     * Фаза 3 Task 5 (ФТ-C1.3): шов СМС — ВТОРОЙ канал доставки одноразовой ссылки.
     * Поставляется спящим: реестр знает только `noop` и `fake`, адаптер конкретного
     * оператора подключается отдельно (открытый вопрос №4 / Фаза 4 вместе с биллингом).
     */
    {
      provide: SMS_PROVIDER_SETTINGS_REPOSITORY,
      useFactory: (db: DatabaseService) =>
        backendEnv.ALLOW_IN_MEMORY_STATE
          ? new InMemorySmsProviderSettingsRepository()
          : new PostgresSmsProviderSettingsRepository(db),
      inject: [DatabaseService]
    },
    SmsProviderSettingsService,
    {
      provide: SMS_PROVIDER_REGISTRY,
      useFactory: (): SmsProviderRegistry =>
        new Map<SmsProviderCode, SmsProvider>([
          ['noop', new NoopSmsProvider()],
          ['fake', new FakeSmsProvider()]
        ])
    },
    // Фабрикой, а не классом — та же причина, что у WebinarProviderResolver выше:
    // примитивный параметр конструктора (NODE_ENV) Nest ищет в контейнере как String.
    {
      provide: SmsChannelService,
      useFactory: (registry: SmsProviderRegistry, settings: SmsProviderSettingsService) =>
        new SmsChannelService(registry, settings, backendEnv.NODE_ENV),
      inject: [SMS_PROVIDER_REGISTRY, SmsProviderSettingsService]
    },
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
    ExamIdentityEmailListener,
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
  exports: [
    NotificationsService,
    ChatService,
    WebinarsService,
    WebinarProviderSettingsService,
    NotificationDispatcher
  ]
})
export class CommunicationModule {}
