import { Module, Scope } from '@nestjs/common';

import { DocumentVariablesBuilder } from './document-variables.builder.js';
import { DocumentsEnqueueService } from './documents-enqueue.service.js';
import { DocumentsInternalWorkerController } from './documents-internal-worker.controller.js';
import { DOCUMENTS_STATE } from './documents-state.token.js';
import { DocumentsTenantRunner } from './documents-tenant-runner.service.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';
import { EnrollmentDocumentIssuanceListener } from './enrollment-document-issuance.listener.js';
import { GroupPackageService } from './group-package.service.js';
import { InMemoryDocumentsState } from './in-memory-documents.state.js';
import { PublicVerifyController } from './public-verify.controller.js';
import { backendEnv } from '../../env.js';
import { DocumentsPersistenceRepositoryAdapter } from './infrastructure/documents-persistence.repository.adapter.js';
import { DOCUMENTS_PERSISTENCE_BACKEND } from './infrastructure/documents-persistence.token.js';
import { DocumentsRequestPersistenceInterceptor } from './infrastructure/documents-request-persistence.interceptor.js';
import { MemoryDocumentsPersistenceBackend } from './infrastructure/memory-documents-persistence.backend.js';
import { JobQuarantineService } from './job-quarantine.service.js';
import { MissedIssuanceSchedulerService } from './missed-issuance.scheduler.service.js';
import { StuckTasksReaperService } from './stuck-tasks-reaper.service.js';
import { TemplateInspectionService } from './template-inspection.service.js';
import { FakeDocumentSignatureProvider } from '../../infrastructure/document-signature/fake-document-signature.provider.js';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { PostgresDocumentsPersistenceBackend } from './infrastructure/postgres-documents-persistence.backend.js';
import {
  DOCUMENT_SIGNATURE_PROVIDER,
  NoopDocumentSignatureProvider
} from '../../infrastructure/document-signature/document-signature.provider.js';
import { FilesModule } from '../files/files.module.js';
import { IamModule } from '../iam/iam.module.js';
import { MvpPersistenceRepositoryAdapter } from '../mvp/infrastructure/mvp-persistence.repository.adapter.js';
import { MVP_PERSISTENCE_BACKEND } from '../mvp/infrastructure/mvp-persistence.token.js';
import { MvpTenantRunner } from '../mvp/infrastructure/mvp-tenant-runner.service.js';
import { PostgresMvpPersistenceBackend } from '../mvp/infrastructure/postgres-mvp-persistence.backend.js';
import { OrgModule } from '../org/org.module.js';
import { TenantModule } from '../tenant/tenant.module.js';

const persistenceBackendClass =
  backendEnv.DOCUMENTS_PERSISTENCE_DRIVER === 'postgres'
    ? DocumentsPersistenceRepositoryAdapter
    : MemoryDocumentsPersistenceBackend;

@Module({
  imports: [AuditModule, InfrastructureModule, IamModule, FilesModule, TenantModule, OrgModule],
  controllers: [DocumentsController, PublicVerifyController, DocumentsInternalWorkerController],
  providers: [
    PostgresDocumentsPersistenceBackend,
    { provide: DOCUMENTS_PERSISTENCE_BACKEND, useClass: persistenceBackendClass },
    { provide: DOCUMENTS_STATE, scope: Scope.REQUEST, useClass: InMemoryDocumentsState },
    { provide: DocumentsService, scope: Scope.REQUEST, useClass: DocumentsService },
    DocumentsTenantRunner,
    DocumentsEnqueueService,
    JobQuarantineService,
    StuckTasksReaperService,
    // Порция 37 (журнал 273): добор документов, чей выпуск потерялся вместе с процессом.
    MissedIssuanceSchedulerService,
    // Сборщик словаря переменных (Task 4) читает MVP-состояние. MvpTenantRunner собираем
    // из инфраструктуры напрямую — импорт MvpModule дал бы цикл (он импортирует documents).
    PostgresMvpPersistenceBackend,
    { provide: MVP_PERSISTENCE_BACKEND, useClass: MvpPersistenceRepositoryAdapter },
    MvpTenantRunner,
    DocumentVariablesBuilder,
    TemplateInspectionService,
    GroupPackageService,
    EnrollmentDocumentIssuanceListener,
    {
      provide: DocumentsRequestPersistenceInterceptor,
      scope: Scope.REQUEST,
      useClass: DocumentsRequestPersistenceInterceptor
    },
    {
      provide: DOCUMENT_SIGNATURE_PROVIDER,
      useFactory: () => {
        // STAGING: synthetic signer for end-to-end QA (env refinement forbids it in prod).
        if (backendEnv.ESIGN_ENABLED && backendEnv.ESIGN_PROVIDER === 'fake') {
          return new FakeDocumentSignatureProvider(backendEnv.ESIGN_SIGNER_NAME);
        }
        // CryptoPro adapter not implemented yet — fall back to Noop so prod can't silently
        // believe docs are signed. Swap this branch for `new CryptoProSignatureProvider(...)`.
        if (backendEnv.ESIGN_ENABLED && backendEnv.ESIGN_PROVIDER === 'cryptopro') {
          console.warn(
            '[esign] ESIGN_PROVIDER=cryptopro requested but adapter not implemented — using Noop'
          );
        }
        return new NoopDocumentSignatureProvider();
      }
    }
  ],
  // DOCUMENTS_PERSISTENCE_BACKEND экспортируется для ЧИТАЮЩИХ потребителей вне модуля
  // (ФТ-D2.3: онбординг считает шаблоны). DocumentsTenantRunner для этого не годится —
  // он всегда пишет снимок обратно, а подсчёту записывать нечего.
  // DocumentsRequestPersistenceInterceptor экспортируется для контроллеров ДРУГИХ модулей,
  // чьи сервисы работают через request-scoped DocumentsService (mvp, esign, реестры):
  // без него их маршруты читают и пишут пустое, никогда не сохраняемое состояние документов.
  // DOCUMENTS_STATE экспортируется вместе с ним: класс-перехватчик из @UseInterceptors
  // инстанцируется в модуле КОНТРОЛЛЕРА, и его зависимости должны быть видимы там
  // (это поймал сторож DI-графа app.module.di.test.ts). Провайдер остаётся один —
  // request-scoped экземпляр состояния общий у перехватчика и DocumentsService.
  exports: [
    DocumentsService,
    DocumentsTenantRunner,
    DOCUMENTS_PERSISTENCE_BACKEND,
    DocumentsRequestPersistenceInterceptor,
    DOCUMENTS_STATE
  ]
})
export class DocumentsModule {}
