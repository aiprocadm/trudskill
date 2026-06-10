import { Module, Scope } from '@nestjs/common';

import { EisotTestingRegistryController } from './eisot-testing-registry/eisot-testing-registry.controller.js';
import { EisotTestingRegistryService } from './eisot-testing-registry/eisot-testing-registry.service.js';
import { EisotTestingXlsxWriter } from './eisot-testing-registry/eisot-testing-xlsx.writer.js';
import { FrdoRegistryXlsxWriter } from './frdo-registry/frdo-registry-xlsx.writer.js';
import { FrdoRegistryController } from './frdo-registry/frdo-registry.controller.js';
import { FrdoRegistryService } from './frdo-registry/frdo-registry.service.js';
import { IdentityRetentionScanner } from './identity/identity-retention-scanner.service.js';
import { IdentityRetentionSchedulerService } from './identity/identity-retention-scheduler.service.js';
import { InMemoryMvpState } from './infrastructure/in-memory-mvp.state.js';
import { MvpPersistenceRepositoryAdapter } from './infrastructure/mvp-persistence.repository.adapter.js';
import { MVP_PERSISTENCE_BACKEND } from './infrastructure/mvp-persistence.token.js';
import { MvpRequestPersistenceInterceptor } from './infrastructure/mvp-request-persistence.interceptor.js';
import { MVP_STATE } from './infrastructure/mvp-state.token.js';
import { MvpTenantRunner } from './infrastructure/mvp-tenant-runner.service.js';
import { PostgresMvpPersistenceBackend } from './infrastructure/postgres-mvp-persistence.backend.js';
import { LearnerPdfCardService } from './learner-pdf-card.service.js';
import { LearnersBulkImportService } from './learners-bulk-import.service.js';
import { MvpBulkEnqueueService } from './mvp-bulk-enqueue.service.js';
import { MvpInternalWorkerController } from './mvp-internal-worker.controller.js';
import { MvpController } from './mvp.controller.js';
import { MvpService } from './mvp.service.js';
import { OtRegistryXlsxWriter } from './ot-registry/ot-registry-xlsx.writer.js';
import { OtRegistryXmlWriter } from './ot-registry/ot-registry-xml.writer.js';
import { OtRegistryController } from './ot-registry/ot-registry.controller.js';
import { OtRegistryService } from './ot-registry/ot-registry.service.js';
import { InMemoryRecertificationDraftsState } from './recertification/in-memory-recertification-drafts.state.js';
import { PostgresRecertificationDraftsRepository } from './recertification/postgres-recertification-drafts.repository.js';
import { RECERTIFICATION_DRAFTS_REPOSITORY } from './recertification/recertification-drafts.repository.js';
import { RecertificationScanner } from './recertification/recertification-scanner.service.js';
import { RecertificationController } from './recertification/recertification.controller.js';
import { RecertificationService } from './recertification/recertification.service.js';
import { CourseDeadlineScanner } from './reminders/course-deadline-scanner.service.js';
import { DocumentRevokedEmailListener } from './reminders/document-revoked-email.listener.js';
import { RemindersSchedulerService } from './reminders/reminders-scheduler.service.js';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module.js';
import { CommunicationModule } from '../communication/communication.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { FilesModule } from '../files/files.module.js';
import { IamModule } from '../iam/iam.module.js';
import { OrgModule } from '../org/org.module.js';
import { TenantModule } from '../tenant/tenant.module.js';

@Module({
  imports: [
    InfrastructureModule,
    FilesModule,
    IamModule,
    DocumentsModule,
    OrgModule,
    CommunicationModule,
    TenantModule
  ],
  controllers: [
    MvpController,
    MvpInternalWorkerController,
    OtRegistryController,
    FrdoRegistryController,
    EisotTestingRegistryController,
    RecertificationController
  ],
  providers: [
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
    CourseDeadlineScanner,
    RemindersSchedulerService,
    DocumentRevokedEmailListener,
    IdentityRetentionScanner,
    IdentityRetentionSchedulerService,
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
    { provide: LearnerPdfCardService, scope: Scope.REQUEST, useClass: LearnerPdfCardService },
    {
      provide: LearnersBulkImportService,
      scope: Scope.REQUEST,
      useClass: LearnersBulkImportService
    },
    {
      provide: MvpRequestPersistenceInterceptor,
      scope: Scope.REQUEST,
      useClass: MvpRequestPersistenceInterceptor
    }
  ]
})
export class MvpModule {}
