import { Module, Scope } from '@nestjs/common';

import { DOCUMENTS_STATE } from './documents-state.token.js';
import { DocumentsTenantRunner } from './documents-tenant-runner.service.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';
import { EnrollmentDocumentIssuanceListener } from './enrollment-document-issuance.listener.js';
import { InMemoryDocumentsState } from './in-memory-documents.state.js';
import { backendEnv } from '../../env.js';
import { DocumentsPersistenceRepositoryAdapter } from './infrastructure/documents-persistence.repository.adapter.js';
import { DOCUMENTS_PERSISTENCE_BACKEND } from './infrastructure/documents-persistence.token.js';
import {
  DOCUMENT_SIGNATURE_PROVIDER,
  NoopDocumentSignatureProvider
} from '../../infrastructure/document-signature/document-signature.provider.js';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { DocumentsRequestPersistenceInterceptor } from './infrastructure/documents-request-persistence.interceptor.js';
import { MemoryDocumentsPersistenceBackend } from './infrastructure/memory-documents-persistence.backend.js';
import { PostgresDocumentsPersistenceBackend } from './infrastructure/postgres-documents-persistence.backend.js';
import { PublicVerifyController } from './public-verify.controller.js';
import { IamModule } from '../iam/iam.module.js';

const persistenceBackendClass =
  backendEnv.DOCUMENTS_PERSISTENCE_DRIVER === 'postgres'
    ? DocumentsPersistenceRepositoryAdapter
    : MemoryDocumentsPersistenceBackend;

@Module({
  imports: [AuditModule, InfrastructureModule, IamModule],
  controllers: [DocumentsController, PublicVerifyController],
  providers: [
    PostgresDocumentsPersistenceBackend,
    { provide: DOCUMENTS_PERSISTENCE_BACKEND, useClass: persistenceBackendClass },
    { provide: DOCUMENTS_STATE, scope: Scope.REQUEST, useClass: InMemoryDocumentsState },
    { provide: DocumentsService, scope: Scope.REQUEST, useClass: DocumentsService },
    DocumentsTenantRunner,
    EnrollmentDocumentIssuanceListener,
    {
      provide: DocumentsRequestPersistenceInterceptor,
      scope: Scope.REQUEST,
      useClass: DocumentsRequestPersistenceInterceptor
    },
    {
      provide: DOCUMENT_SIGNATURE_PROVIDER,
      useFactory: () => {
        // CryptoPro adapter not implemented yet — when ESIGN_ENABLED && provider==='cryptopro'
        // is requested, fall back to Noop so prod can't silently believe docs are signed.
        // Swap this branch for `new CryptoProSignatureProvider(...)` when the adapter lands.
        if (backendEnv.ESIGN_ENABLED && backendEnv.ESIGN_PROVIDER === 'cryptopro') {
          console.warn(
            '[esign] ESIGN_PROVIDER=cryptopro requested but adapter not implemented — using Noop'
          );
        }
        return new NoopDocumentSignatureProvider();
      }
    }
  ],
  exports: [DocumentsService, DocumentsTenantRunner]
})
export class DocumentsModule {}
