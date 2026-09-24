import { Module, Scope } from '@nestjs/common';

import { MvpNormalizedReadsService } from './infrastructure/mvp-normalized-reads.service.js';
import { MvpRequestPersistenceInterceptor } from './infrastructure/mvp-request-persistence.interceptor.js';
import { MVP_STATE } from './infrastructure/mvp-state.token.js';
import { MvpTenantRunner } from './infrastructure/mvp-tenant-runner.service.js';
import { MvpEnrollmentService } from './mvp-enrollment.service.js';
import { MvpInternalWorkerController } from './mvp-internal-worker.controller.js';
import { backendEnv } from '../../env.js';
import { ExpiredAttemptsScanner } from './assessment/expired-attempts.scanner.service.js';
import { ExpiredAttemptsSchedulerService } from './assessment/expired-attempts.scheduler.service.js';
import { CloseGroupChainController } from './close-group-chain.controller.js';
import { CloseGroupChainService } from './close-group-chain.service.js';
import { ConsentController } from './consents/consent.controller.js';
import { CONSENT_REPOSITORY } from './consents/consent.repository.js';
import { ConsentService } from './consents/consent.service.js';
import { InMemoryConsentRepository } from './consents/in-memory-consent.repository.js';
import { PostgresConsentRepository } from './consents/postgres-consent.repository.js';
import { ManagerDashboardService } from './dashboards/manager-dashboard.service.js';
import { MethodistDashboardService } from './dashboards/methodist-dashboard.service.js';
import { EisotTestingRegistryController } from './eisot-testing-registry/eisot-testing-registry.controller.js';
import { EisotTestingRegistryService } from './eisot-testing-registry/eisot-testing-registry.service.js';
import { EisotTestingXlsxWriter } from './eisot-testing-registry/eisot-testing-xlsx.writer.js';
import { EsiaController } from './esia/esia.controller.js';
import { ESIA_SERVICE_CONFIG, EsiaService, type EsiaServiceConfig } from './esia/esia.service.js';
import { InMemorySimpleSignatureRepository } from './esignature/in-memory-simple-signature.repository.js';
import { LegalLogReader } from './esignature/legal-log.reader.js';
import { LegalLogWriter } from './esignature/legal-log.writer.js';
import { PostgresSimpleSignatureRepository } from './esignature/postgres-simple-signature.repository.js';
import { SimpleSignatureController } from './esignature/simple-signature.controller.js';
import { SIMPLE_SIGNATURE_REPOSITORY } from './esignature/simple-signature.repository.js';
import { SimpleSignatureService } from './esignature/simple-signature.service.js';
import { ExamOutcomeService } from './exam/exam-outcome.service.js';
import { FrdoRegistryXlsxWriter } from './frdo-registry/frdo-registry-xlsx.writer.js';
import { FrdoRegistryController } from './frdo-registry/frdo-registry.controller.js';
import { FrdoRegistryService } from './frdo-registry/frdo-registry.service.js';
import { IdentityPolicyController } from './identity/identity-policy.controller.js';
import { IDENTITY_POLICY_REPOSITORY } from './identity/identity-policy.repository.js';
import { IdentityPolicyService } from './identity/identity-policy.service.js';
import { IdentityRetentionScanner } from './identity/identity-retention-scanner.service.js';
import { IdentityRetentionSchedulerService } from './identity/identity-retention-scheduler.service.js';
import { InMemoryIdentityPolicyRepository } from './identity/in-memory-identity-policy.repository.js';
import { LearnerDossierService } from './identity/learner-dossier.service.js';
import { PostgresIdentityPolicyRepository } from './identity/postgres-identity-policy.repository.js';
import { InMemoryMvpState } from './infrastructure/in-memory-mvp.state.js';
import { MvpPersistenceRepositoryAdapter } from './infrastructure/mvp-persistence.repository.adapter.js';
import { MVP_PERSISTENCE_BACKEND } from './infrastructure/mvp-persistence.token.js';
import { PostgresMvpPersistenceBackend } from './infrastructure/postgres-mvp-persistence.backend.js';
import { COUNTERPARTIES_REPOSITORY } from './infrastructure/repositories/counterparties.repository.js';
import { ENROLLMENTS_REPOSITORY } from './infrastructure/repositories/enrollments.repository.js';
import { EXAM_RESULTS_REPOSITORY } from './infrastructure/repositories/exam-results.repository.js';
import { GROUP_COURSES_REPOSITORY } from './infrastructure/repositories/group-courses.repository.js';
import { InMemoryEnrollmentsRepository } from './infrastructure/repositories/in-memory-enrollments.repository.js';
import { InMemoryExamResultsRepository } from './infrastructure/repositories/in-memory-exam-results.repository.js';
import { InMemoryGroupCoursesRepository } from './infrastructure/repositories/in-memory-group-courses.repository.js';
import { InMemoryLearnersRepository } from './infrastructure/repositories/in-memory-learners.repository.js';
import { InMemoryRegistryRepository } from './infrastructure/repositories/in-memory-registry.repository.js';
import { LEARNERS_REPOSITORY } from './infrastructure/repositories/learners.repository.js';
import { PostgresCounterpartiesRepository } from './infrastructure/repositories/postgres-counterparties.repository.js';
import { LearnerPdfCardService } from './learner-pdf-card.service.js';
import { LearnersBulkImportService } from './learners-bulk-import.service.js';
import { PlatformLibraryController } from './library/platform-library.controller.js';
import { PlatformLibraryService } from './library/platform-library.service.js';
import { MvpBulkEnqueueService } from './mvp-bulk-enqueue.service.js';
import { MvpController } from './mvp.controller.js';
import { MvpService } from './mvp.service.js';
import { NmoRegistryController } from './nmo-registry/nmo-registry.controller.js';
import { NmoRegistryService } from './nmo-registry/nmo-registry.service.js';
import { NmoXlsxWriter } from './nmo-registry/nmo-xlsx.writer.js';
import { NotificationRecipientsController } from './notification-recipients.controller.js';
import { TenantOnboardingController } from './onboarding/tenant-onboarding.controller.js';
import { TenantOnboardingService } from './onboarding/tenant-onboarding.service.js';
import { OtRegistryXlsxWriter } from './ot-registry/ot-registry-xlsx.writer.js';
import { OtRegistryXmlWriter } from './ot-registry/ot-registry-xml.writer.js';
import { OtRegistryController } from './ot-registry/ot-registry.controller.js';
import { OtRegistryService } from './ot-registry/ot-registry.service.js';
import { LearnerPiiService } from './pii/learner-pii.service.js';
import { ProctoringRetentionScanner } from './proctoring/proctoring-retention-scanner.service.js';
import { ProctoringRetentionSchedulerService } from './proctoring/proctoring-retention-scheduler.service.js';
import { InMemoryRecertificationDraftsState } from './recertification/in-memory-recertification-drafts.state.js';
import { PostgresRecertificationDraftsRepository } from './recertification/postgres-recertification-drafts.repository.js';
import { RECERTIFICATION_DRAFTS_REPOSITORY } from './recertification/recertification-drafts.repository.js';
import { RecertificationScanner } from './recertification/recertification-scanner.service.js';
import { RecertificationController } from './recertification/recertification.controller.js';
import { RecertificationService } from './recertification/recertification.service.js';
import { CourseDeadlineScanner } from './reminders/course-deadline-scanner.service.js';
import { DocumentRevokedEmailListener } from './reminders/document-revoked-email.listener.js';
import { KnowledgeRetestScanner } from './reminders/knowledge-retest-scanner.service.js';
import { LicenseExpiryScanner } from './reminders/license-expiry-scanner.service.js';
import { ReminderOutbox } from './reminders/reminder-outbox.service.js';
import { ReminderSettingsService } from './reminders/reminder-settings.service.js';
import { RemindersSchedulerService } from './reminders/reminders-scheduler.service.js';
import { RostechnadzorRegistryController } from './rostechnadzor-registry/rostechnadzor-registry.controller.js';
import { RostechnadzorRegistryService } from './rostechnadzor-registry/rostechnadzor-registry.service.js';
import { RostechnadzorXlsxWriter } from './rostechnadzor-registry/rostechnadzor-xlsx.writer.js';
import { ScormContentController } from './scorm/scorm-content.controller.js';
import { ScormController } from './scorm/scorm.controller.js';
import { ScormService } from './scorm/scorm.service.js';
import { TelegramBotController } from './telegram-bot.controller.js';
import { TelegramLinkController } from './telegram-link.controller.js';
import { TenantUsageController } from './usage/tenant-usage.controller.js';
import { TenantUsageService } from './usage/tenant-usage.service.js';
import { VideoProviderSettingsController } from './video/video-provider-settings.controller.js';
import { UserDisplayNamesService } from '../../common/iam/user-display-names.service.js';
import {
  ESIA_IDENTITY_PROVIDER,
  NoopEsiaProvider
} from '../../infrastructure/esia/esia-identity.provider.js';
import { EsiaOidcProvider } from '../../infrastructure/esia/esia-oidc.provider.js';
import { MockEsiaProvider } from '../../infrastructure/esia/mock-esia.provider.js';
import {
  EXPORT_SIGNATURE_PROVIDER,
  NoopExportSignatureProvider
} from '../../infrastructure/export-signature/export-signature.provider.js';
import { FakeExportSignatureProvider } from '../../infrastructure/export-signature/fake-export-signature.provider.js';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module.js';
import { CommunicationModule } from '../communication/communication.module.js';
import { PushSubscriptionService } from '../communication/web-push/push-subscription.service.js';
import { WebPushController } from '../communication/web-push/web-push.controller.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { FilesModule } from '../files/files.module.js';
import { IamModule } from '../iam/iam.module.js';
import { OrgModule } from '../org/org.module.js';
import { TenantModule } from '../tenant/tenant.module.js';
import { DocumentMaterialService } from './video/document-material.service.js';
import { InMemoryVideoAssetsRepository } from './video/in-memory-video-assets.repository.js';
import { InMemoryVideoProgressRepository } from './video/in-memory-video-progress.repository.js';
import { InMemoryVideoProviderSettingsRepository } from './video/in-memory-video-provider-settings.repository.js';
import { LearningHoursService } from './video/learning-hours.service.js';
import { PostgresVideoAssetsRepository } from './video/postgres-video-assets.repository.js';
import { PostgresVideoProgressRepository } from './video/postgres-video-progress.repository.js';
import { PostgresVideoProviderSettingsRepository } from './video/postgres-video-provider-settings.repository.js';
import { TenantStorageService } from './video/tenant-storage.service.js';
import { PlatformModule } from '../platform/platform.module.js';
import { VideoAccessService } from './video/video-access.service.js';
import { VIDEO_ASSETS_REPOSITORY } from './video/video-assets.repository.js';
import { VideoPlaybackController } from './video/video-playback.controller.js';
import { VideoPlaybackService } from './video/video-playback.service.js';
import { VIDEO_PROGRESS_REPOSITORY } from './video/video-progress.repository.js';
import { VideoProgressService } from './video/video-progress.service.js';
import { VideoProviderResolver } from './video/video-provider-resolver.service.js';
import { VIDEO_PROVIDER_SETTINGS_REPOSITORY } from './video/video-provider-settings.repository.js';
import { VideoProviderSettingsService } from './video/video-provider-settings.service.js';
import { VideoWebhookController } from './video/video-webhook.controller.js';
import { VideoController } from './video/video.controller.js';
import { VideoService } from './video/video.service.js';
import { DatabaseService } from '../../infrastructure/database/database.service.js';
import { TELEGRAM_WEBHOOK_SECRET } from '../../infrastructure/telegram/telegram.provider.js';
import { FakeVideoProvider } from '../../infrastructure/video-provider/fake-video.provider.js';
import { KinescopeVideoProvider } from '../../infrastructure/video-provider/kinescope-video.provider.js';
import {
  NoopVideoProvider,
  VIDEO_PROVIDER_REGISTRY,
  type VideoProvider,
  type VideoProviderCode,
  type VideoProviderRegistry
} from '../../infrastructure/video-provider/video.provider.js';
import { BackgroundTasksModule } from '../background-tasks/background-tasks.module.js';
import { GROUPS_REPOSITORY } from './infrastructure/repositories/groups.repository.js';
import { PostgresEnrollmentsRepository } from './infrastructure/repositories/postgres-enrollments.repository.js';
import { PostgresExamResultsRepository } from './infrastructure/repositories/postgres-exam-results.repository.js';
import { PostgresGroupCoursesRepository } from './infrastructure/repositories/postgres-group-courses.repository.js';
import { PostgresGroupsRepository } from './infrastructure/repositories/postgres-groups.repository.js';
import { PostgresLearnersRepository } from './infrastructure/repositories/postgres-learners.repository.js';

@Module({
  imports: [
    InfrastructureModule,
    /* ТЗ 12.2: постановка в очередь заводит запись в реестре фоновых задач. */
    BackgroundTasksModule,
    FilesModule,
    IamModule,
    DocumentsModule,
    OrgModule,
    CommunicationModule,
    TenantModule,
    // ФТ-D4: тариф тенанта для счётчиков использования и гейта новых слушателей.
    PlatformModule
  ],
  controllers: [
    TelegramBotController,
    TelegramLinkController,
    MvpController,
    TenantUsageController,
    TenantOnboardingController,
    PlatformLibraryController,
    VideoController,
    VideoProviderSettingsController,
    IdentityPolicyController,
    SimpleSignatureController,
    ConsentController,
    VideoPlaybackController,
    VideoWebhookController,
    MvpInternalWorkerController,
    OtRegistryController,
    CloseGroupChainController,
    FrdoRegistryController,
    EisotTestingRegistryController,
    RostechnadzorRegistryController,
    NmoRegistryController,
    RecertificationController,
    NotificationRecipientsController,
    ScormController,
    ScormContentController,
    WebPushController,
    EsiaController
  ],
  providers: [
    UserDisplayNamesService,
    // Фаза 2 Task 1 (ФТ-B1.1) — шов видео-провайдера. Реестр мультипровайдерный, АКТИВНЫЙ
    // выбирается пер тенант резолвером; тенант без настройки получает Noop.
    PostgresVideoProviderSettingsRepository,
    {
      provide: VIDEO_PROVIDER_SETTINGS_REPOSITORY,
      useFactory: (db: DatabaseService) =>
        backendEnv.ALLOW_IN_MEMORY_STATE
          ? new InMemoryVideoProviderSettingsRepository()
          : new PostgresVideoProviderSettingsRepository(db),
      inject: [DatabaseService]
    },
    VideoProviderSettingsService,
    {
      provide: VIDEO_PROVIDER_REGISTRY,
      useFactory: (): VideoProviderRegistry =>
        new Map<VideoProviderCode, VideoProvider>([
          ['noop', new NoopVideoProvider()],
          ['fake', new FakeVideoProvider()],
          // ФТ-B1.2: готовый видеосервис (решение владельца по вопросу №1 от 2026-07-28).
          // Без KINESCOPE_API_TOKEN адаптер спит и резолвер отдаёт noop.
          [
            'kinescope',
            new KinescopeVideoProvider({
              apiUrl: backendEnv.KINESCOPE_API_URL,
              apiToken: backendEnv.KINESCOPE_API_TOKEN,
              webhookSecret: backendEnv.KINESCOPE_WEBHOOK_SECRET
            })
          ]
        ])
    },
    /*
     * Через фабрику, а не классом: третий параметр конструктора — примитив (`nodeEnv: string`)
     * со значением по умолчанию. Под tsx это незаметно (esbuild не эмитит метаданные типов),
     * а в собранном виде Nest пытается внедрить `String` и падает
     * «Nest can't resolve dependencies of the VideoProviderResolver ... argument String at index [2]».
     * Тот же дефект уже чинили у WebinarProviderResolver и PaymentProviderResolver (§5.187);
     * при добавлении видео (Фаза 2 Task 1) его повторили, и это не всплывало, потому что образ
     * бэкенда не собирался вовсе — обнаружено 2026-08-12, когда smoke-тест впервые дошёл до запуска.
     */
    {
      provide: VideoProviderResolver,
      useFactory: (registry: VideoProviderRegistry, settings: VideoProviderSettingsService) =>
        new VideoProviderResolver(registry, settings, backendEnv.NODE_ENV),
      inject: [VIDEO_PROVIDER_REGISTRY, VideoProviderSettingsService]
    },
    // Фаза 2 Task 2 (ФТ-B1.1) — загрузка видео методистом.
    PostgresVideoAssetsRepository,
    {
      provide: VIDEO_ASSETS_REPOSITORY,
      useFactory: (db: DatabaseService) =>
        backendEnv.ALLOW_IN_MEMORY_STATE
          ? new InMemoryVideoAssetsRepository()
          : new PostgresVideoAssetsRepository(db),
      inject: [DatabaseService]
    },
    TenantStorageService,
    TenantUsageService,
    TenantOnboardingService,
    { provide: PlatformLibraryService, scope: Scope.REQUEST, useClass: PlatformLibraryService },
    VideoService,
    MvpBulkEnqueueService,
    PostgresMvpPersistenceBackend,
    PostgresRecertificationDraftsRepository,
    {
      provide: RECERTIFICATION_DRAFTS_REPOSITORY,
      useClass: PostgresRecertificationDraftsRepository
    },
    InMemoryRecertificationDraftsState,
    RecertificationScanner,
    MvpTenantRunner,
    // Phase 7 payments — singleton bulk-enrollment helper for fulfillment outside an HTTP request
    // (hydrates+saves tenant MVP state via MvpTenantRunner). NO Scope.REQUEST.
    MvpEnrollmentService,
    CourseDeadlineScanner,
    /* ТЗ 11.3: пороги напоминаний — настройка центра с умолчаниями Р11. */
    ReminderSettingsService,
    LicenseExpiryScanner,
    KnowledgeRetestScanner,
    ReminderOutbox,
    RemindersSchedulerService,
    DocumentRevokedEmailListener,
    IdentityRetentionScanner,
    // ФТ-C1 (Фаза 3 Task 1) — политика идентификации как данные.
    PostgresIdentityPolicyRepository,
    {
      provide: IDENTITY_POLICY_REPOSITORY,
      useFactory: (db: DatabaseService) =>
        backendEnv.ALLOW_IN_MEMORY_STATE
          ? new InMemoryIdentityPolicyRepository()
          : new PostgresIdentityPolicyRepository(db),
      inject: [DatabaseService]
    },
    IdentityPolicyService,
    // ФТ-C2 (Фаза 3 Task 9) — «личное дело слушателя»: сборка из существующих источников.
    LegalLogReader,
    LearnerDossierService,
    // ФТ-G6 (Фаза 4 Task 12) — права субъекта ПДн: выгрузка и обезличивание.
    LearnerPiiService,
    /*
     * ТЗ 10.4 (Р9) — итог проверки знаний и повторные проверки. Как и панели, считается из
     * состояния на лету: отдельная таблица задач разошлась бы с действительностью при первом
     * же пропущенном событии.
     */
    {
      provide: ExamOutcomeService,
      scope: Scope.REQUEST,
      useClass: ExamOutcomeService
    },
    // ТЗ 8.3 — панель руководителя: считается из состояния центра на лету.
    {
      provide: ManagerDashboardService,
      scope: Scope.REQUEST,
      useClass: ManagerDashboardService
    },
    // ФТ-H2 (Фаза 5 Task 2) — дашборд методиста: считается из состояния на лету.
    {
      provide: MethodistDashboardService,
      scope: Scope.REQUEST,
      useClass: MethodistDashboardService
    },
    // ФТ-C1.1 (Фаза 3 Task 3) — ПЭП: соглашение и подписанные действия.
    LegalLogWriter,
    PostgresSimpleSignatureRepository,
    {
      provide: SIMPLE_SIGNATURE_REPOSITORY,
      useFactory: (db: DatabaseService) =>
        backendEnv.ALLOW_IN_MEMORY_STATE
          ? new InMemorySimpleSignatureRepository()
          : new PostgresSimpleSignatureRepository(db),
      inject: [DatabaseService]
    },
    SimpleSignatureService,
    // ФТ-C3.2 (Фаза 3 Task 6) — раздельные согласия на ПДн и на фото.
    PostgresConsentRepository,
    {
      provide: CONSENT_REPOSITORY,
      useFactory: (db: DatabaseService) =>
        backendEnv.ALLOW_IN_MEMORY_STATE
          ? new InMemoryConsentRepository()
          : new PostgresConsentRepository(db),
      inject: [DatabaseService]
    },
    ConsentService,
    // ФТ-E2 (Task 12): закрытие истёкших попыток без участия клиента.
    ExpiredAttemptsScanner,
    ExpiredAttemptsSchedulerService,
    IdentityRetentionSchedulerService,
    ProctoringRetentionScanner,
    ProctoringRetentionSchedulerService,
    { provide: RecertificationService, scope: Scope.REQUEST, useClass: RecertificationService },
    { provide: MVP_PERSISTENCE_BACKEND, useClass: MvpPersistenceRepositoryAdapter },
    /* Фаза 1 перехода с CDOPROF (срез 1b): репозитории контрагентов и групп. В памяти таблиц
       нет — там пустые реестры; чтение из них включает только флаг LMS_NORMALIZED_COLLECTIONS. */
    {
      provide: COUNTERPARTIES_REPOSITORY,
      useFactory: (db: DatabaseService) =>
        backendEnv.ALLOW_IN_MEMORY_STATE
          ? new InMemoryRegistryRepository([], 'id')
          : new PostgresCounterpartiesRepository(db),
      inject: [DatabaseService]
    },
    {
      provide: GROUPS_REPOSITORY,
      useFactory: (db: DatabaseService) =>
        backendEnv.ALLOW_IN_MEMORY_STATE
          ? new InMemoryRegistryRepository([], 'counterpartyId')
          : new PostgresGroupsRepository(db),
      inject: [DatabaseService]
    },
    {
      provide: LEARNERS_REPOSITORY,
      useFactory: (db: DatabaseService) =>
        backendEnv.ALLOW_IN_MEMORY_STATE
          ? new InMemoryLearnersRepository([])
          : new PostgresLearnersRepository(db),
      inject: [DatabaseService]
    },
    {
      provide: ENROLLMENTS_REPOSITORY,
      useFactory: (db: DatabaseService) =>
        backendEnv.ALLOW_IN_MEMORY_STATE
          ? new InMemoryEnrollmentsRepository([])
          : new PostgresEnrollmentsRepository(db),
      inject: [DatabaseService]
    },
    {
      provide: GROUP_COURSES_REPOSITORY,
      useFactory: (db: DatabaseService) =>
        backendEnv.ALLOW_IN_MEMORY_STATE
          ? new InMemoryGroupCoursesRepository([])
          : new PostgresGroupCoursesRepository(db),
      inject: [DatabaseService]
    },
    {
      provide: EXAM_RESULTS_REPOSITORY,
      useFactory: (db: DatabaseService) =>
        backendEnv.ALLOW_IN_MEMORY_STATE
          ? new InMemoryExamResultsRepository([])
          : new PostgresExamResultsRepository(db),
      inject: [DatabaseService]
    },
    MvpNormalizedReadsService,
    /* ФТ-F3: секрет ручки бота значением контейнера — иначе контроллер нечем проверить. */
    { provide: TELEGRAM_WEBHOOK_SECRET, useValue: backendEnv.TELEGRAM_WEBHOOK_SECRET },
    { provide: MVP_STATE, scope: Scope.REQUEST, useClass: InMemoryMvpState },
    { provide: MvpService, scope: Scope.REQUEST, useClass: MvpService },
    OtRegistryXlsxWriter,
    OtRegistryXmlWriter,
    { provide: OtRegistryService, scope: Scope.REQUEST, useClass: OtRegistryService },
    { provide: CloseGroupChainService, scope: Scope.REQUEST, useClass: CloseGroupChainService },
    FrdoRegistryXlsxWriter,
    { provide: FrdoRegistryService, scope: Scope.REQUEST, useClass: FrdoRegistryService },
    EisotTestingXlsxWriter,
    {
      provide: EisotTestingRegistryService,
      scope: Scope.REQUEST,
      useClass: EisotTestingRegistryService
    },
    RostechnadzorXlsxWriter,
    {
      provide: RostechnadzorRegistryService,
      scope: Scope.REQUEST,
      useClass: RostechnadzorRegistryService
    },
    NmoXlsxWriter,
    { provide: NmoRegistryService, scope: Scope.REQUEST, useClass: NmoRegistryService },
    { provide: LearnerPdfCardService, scope: Scope.REQUEST, useClass: LearnerPdfCardService },
    {
      provide: LearnersBulkImportService,
      scope: Scope.REQUEST,
      useClass: LearnersBulkImportService
    },
    { provide: ScormService, scope: Scope.REQUEST, useClass: ScormService },
    // Проверка доступа читает состояние тенанта (материалы, модули, зачисления) —
    // поэтому request-scoped, как ScormService.
    PostgresVideoProgressRepository,
    {
      provide: VIDEO_PROGRESS_REPOSITORY,
      useFactory: (db: DatabaseService) =>
        backendEnv.ALLOW_IN_MEMORY_STATE
          ? new InMemoryVideoProgressRepository()
          : new PostgresVideoProgressRepository(db),
      inject: [DatabaseService]
    },
    // Проверка доступа и приём прогресса читают состояние тенанта — request-scoped.
    { provide: VideoAccessService, scope: Scope.REQUEST, useClass: VideoAccessService },
    // Журнал часов читает состояние тенанта — тоже request-scoped.
    { provide: LearningHoursService, scope: Scope.REQUEST, useClass: LearningHoursService },
    { provide: DocumentMaterialService, scope: Scope.REQUEST, useClass: DocumentMaterialService },
    { provide: VideoPlaybackService, scope: Scope.REQUEST, useClass: VideoPlaybackService },
    { provide: VideoProgressService, scope: Scope.REQUEST, useClass: VideoProgressService },
    // Phase 10 Track C — self-service push subscription CRUD (request-scoped, reads MVP_STATE).
    { provide: PushSubscriptionService, scope: Scope.REQUEST, useClass: PushSubscriptionService },
    {
      provide: MvpRequestPersistenceInterceptor,
      scope: Scope.REQUEST,
      useClass: MvpRequestPersistenceInterceptor
    },
    // ЕСИА (Госуслуги) OAuth seam — ships dormant (ESIA_ENABLED=false → NoopEsiaProvider).
    {
      provide: ESIA_IDENTITY_PROVIDER,
      useFactory: () => {
        if (!backendEnv.ESIA_ENABLED) return new NoopEsiaProvider();
        if (backendEnv.ESIA_PROVIDER === 'mock') return new MockEsiaProvider();
        if (backendEnv.ESIA_PROVIDER === 'esia') {
          return new EsiaOidcProvider({
            clientId: backendEnv.ESIA_CLIENT_ID ?? '',
            authorizeUrl: backendEnv.ESIA_AUTHORIZE_URL ?? '',
            scopes: backendEnv.ESIA_SCOPES,
            ...(backendEnv.ESIA_TOKEN_URL ? { tokenUrl: backendEnv.ESIA_TOKEN_URL } : {}),
            ...(backendEnv.ESIA_USERINFO_URL ? { userinfoUrl: backendEnv.ESIA_USERINFO_URL } : {}),
            ...(backendEnv.ESIA_CERT_PATH ? { certPath: backendEnv.ESIA_CERT_PATH } : {})
          });
        }
        return new NoopEsiaProvider();
      }
    },
    {
      provide: ESIA_SERVICE_CONFIG,
      useValue: {
        secret: backendEnv.ESIA_STATE_SECRET,
        ttlSeconds: 300,
        callbackUrl:
          backendEnv.ESIA_CALLBACK_URL ?? 'http://localhost:3001/api/v1/auth/esia/callback',
        nowMs: () => Date.now()
      } satisfies EsiaServiceConfig
    },
    { provide: EsiaService, scope: Scope.REQUEST, useClass: EsiaService },
    // Phase 6 КЭП — export-signature seam. Ships dormant (EXPORT_SIGN_ENABLED=false → Noop).
    {
      provide: EXPORT_SIGNATURE_PROVIDER,
      useFactory: () => {
        // STAGING: synthetic detached signer for end-to-end QA (env refinement forbids it in prod).
        if (backendEnv.EXPORT_SIGN_ENABLED && backendEnv.EXPORT_SIGN_PROVIDER === 'fake') {
          return new FakeExportSignatureProvider(backendEnv.EXPORT_SIGN_SIGNER_NAME);
        }
        // CryptoPro adapter not implemented yet — fall back to Noop so prod can't silently
        // believe exports are signed. Swap this branch for `new CryptoProExportSignatureProvider(...)`.
        if (backendEnv.EXPORT_SIGN_ENABLED && backendEnv.EXPORT_SIGN_PROVIDER === 'cryptopro') {
          console.warn(
            '[export-sign] EXPORT_SIGN_PROVIDER=cryptopro requested but adapter not implemented — using Noop'
          );
        }
        return new NoopExportSignatureProvider();
      }
    }
  ],
  exports: [MvpService, MvpEnrollmentService]
})
export class MvpModule {}
