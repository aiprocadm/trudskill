import { Module, Scope } from '@nestjs/common';

import { InMemoryMvpState } from './infrastructure/in-memory-mvp.state.js';
import { MvpPersistenceRepositoryAdapter } from './infrastructure/mvp-persistence.repository.adapter.js';
import { MVP_PERSISTENCE_BACKEND } from './infrastructure/mvp-persistence.token.js';
import { MvpRequestPersistenceInterceptor } from './infrastructure/mvp-request-persistence.interceptor.js';
import { MVP_STATE } from './infrastructure/mvp-state.token.js';
import { PostgresMvpPersistenceBackend } from './infrastructure/postgres-mvp-persistence.backend.js';
import { LearnerPdfCardService } from './learner-pdf-card.service.js';
import { LearnersBulkImportService } from './learners-bulk-import.service.js';
import { MvpBulkEnqueueService } from './mvp-bulk-enqueue.service.js';
import { MvpInternalWorkerController } from './mvp-internal-worker.controller.js';
import { MvpController } from './mvp.controller.js';
import { MvpService } from './mvp.service.js';
import { OtRegistryXlsxWriter } from './ot-registry/ot-registry-xlsx.writer.js';
import { OtRegistryService } from './ot-registry/ot-registry.service.js';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { FilesModule } from '../files/files.module.js';
import { IamModule } from '../iam/iam.module.js';
import { OrgModule } from '../org/org.module.js';

@Module({
  imports: [InfrastructureModule, FilesModule, IamModule, DocumentsModule, OrgModule],
  controllers: [MvpController, MvpInternalWorkerController],
  providers: [
    MvpBulkEnqueueService,
    PostgresMvpPersistenceBackend,
    { provide: MVP_PERSISTENCE_BACKEND, useClass: MvpPersistenceRepositoryAdapter },
    { provide: MVP_STATE, scope: Scope.REQUEST, useClass: InMemoryMvpState },
    { provide: MvpService, scope: Scope.REQUEST, useClass: MvpService },
    OtRegistryXlsxWriter,
    { provide: OtRegistryService, scope: Scope.REQUEST, useClass: OtRegistryService },
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
