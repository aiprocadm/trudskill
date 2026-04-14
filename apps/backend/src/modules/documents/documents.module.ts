import { Module, Scope } from '@nestjs/common';

import { DOCUMENTS_STATE } from './documents-state.token.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';
import { InMemoryDocumentsState } from './in-memory-documents.state.js';
import { backendEnv } from '../../env.js';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { DOCUMENTS_PERSISTENCE_BACKEND } from './infrastructure/documents-persistence.token.js';
import { DocumentsRequestPersistenceInterceptor } from './infrastructure/documents-request-persistence.interceptor.js';
import { MemoryDocumentsPersistenceBackend } from './infrastructure/memory-documents-persistence.backend.js';
import { PostgresDocumentsPersistenceBackend } from './infrastructure/postgres-documents-persistence.backend.js';
import { IamModule } from '../iam/iam.module.js';

const persistenceBackendClass =
  backendEnv.DOCUMENTS_PERSISTENCE_DRIVER === 'postgres'
    ? PostgresDocumentsPersistenceBackend
    : MemoryDocumentsPersistenceBackend;

@Module({
  imports: [AuditModule, InfrastructureModule, IamModule],
  controllers: [DocumentsController],
  providers: [
    { provide: DOCUMENTS_PERSISTENCE_BACKEND, useClass: persistenceBackendClass },
    { provide: DOCUMENTS_STATE, scope: Scope.REQUEST, useClass: InMemoryDocumentsState },
    { provide: DocumentsService, scope: Scope.REQUEST, useClass: DocumentsService },
    {
      provide: DocumentsRequestPersistenceInterceptor,
      scope: Scope.REQUEST,
      useClass: DocumentsRequestPersistenceInterceptor
    }
  ],
  exports: [DocumentsService]
})
export class DocumentsModule {}
