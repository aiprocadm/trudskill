import { Module, Scope } from '@nestjs/common';

import { backendEnv } from '../../env.js';
import { ExpiredAttemptsScanner } from './assessment/expired-attempts.scanner.service.js';
import { ExpiredAttemptsSchedulerService } from './assessment/expired-attempts.scheduler.service.js';
import { ConsentController } from './consents/consent.controller.js';
import { CONSENT_REPOSITORY } from './consents/consent.repository.js';
import { ConsentService } from './consents/consent.service.js';
import { InMemoryConsentRepository } from './consents/in-memory-consent.repository.js';
import { PostgresConsentRepository } from './consents/postgres-consent.repository.js';
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
import { MvpRequestPersistenceInterceptor } from './infrastructure/mvp-request-persistence.interceptor.js';
import { MVP_STATE } from './infrastructure/mvp-state.token.js';
import { MvpTenantRunner } from './infrastructure/mvp-tenant-runner.service.js';
import { PostgresMvpPersistenceBackend } from './infrastructure/postgres-mvp-persistence.backend.js';
import { LearnerPdfCardService } from './learner-pdf-card.service.js';
import { LearnersBulkImportService } from './learners-bulk-import.service.js';
import { PlatformLibraryController } from './library/platform-library.controller.js';
import { PlatformLibraryService } from './library/platform-library.service.js';
import { MvpBulkEnqueueService } from './mvp-bulk-enqueue.service.js';
import { MvpEnrollmentService } from './mvp-enrollment.service.js';
import { MvpInternalWorkerController } from './mvp-internal-worker.controller.js';
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
import { LicenseExpiryScanner } from './reminders/license-expiry-scanner.service.js';
import { RemindersSchedulerService } from './reminders/reminders-scheduler.service.js';
import { RostechnadzorRegistryController } from './rostechnadzor-registry/rostechnadzor-registry.controller.js';
import { RostechnadzorRegistryService } from './rostechnadzor-registry/rostechnadzor-registry.service.js';
import { RostechnadzorXlsxWriter } from './rostechnadzor-registry/rostechnadzor-xlsx.writer.js';
import { ScormContentController } from './scorm/scorm-content.controller.js';
import { ScormController } from './scorm/scorm.controller.js';
import { ScormService } from './scorm/scorm.service.js';
import { TenantUsageController } from './usage/tenant-usage.controller.js';
import { TenantUsageService } from './usage/tenant-usage.service.js';
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
import { FakeVideoProvider } from '../../infrastructure/video-provider/fake-video.provider.js';
import { KinescopeVideoProvider } from '../../infrastructure/video-provider/kinescope-video.provider.js';
import {
  NoopVideoProvider,
  VIDEO_PROVIDER_REGISTRY,
  type VideoProvider,
  type VideoProviderCode,
  type VideoProviderRegistry
} from '../../infrastructure/video-provider/video.provider.js';

@Module({
  imports: [
    InfrastructureModule,
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
    MvpController,
    TenantUsageController,
    TenantOnboardingController,
    PlatformLibraryController,
    VideoController,
    IdentityPolicyController,
    SimpleSignatureController,
    ConsentController,
    VideoPlaybackController,
    VideoWebhookController,
    MvpInternalWorkerController,
    OtRegistryController,
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
    VideoProviderResolver,
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
    LicenseExpiryScanner,
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
    { provide: MVP_STATE, scope: Scope.REQUEST, useClass: InMemoryMvpState },
    { provide: MvpService, scope: Scope.REQUEST, useClass: MvpService },
    OtRegistryXlsxWriter,
    OtRegistryXmlWriter,
    { provide: OtRegistryService, scope: Scope.REQUEST, useClass: OtRegistryService },
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
