import { Module } from '@nestjs/common';

import { DOCUMENTS_STATE } from './documents-state.token.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';
import { InMemoryDocumentsState } from './in-memory-documents.state.js';
import { PostgresDocumentsPersistenceStub } from './postgres-documents.state.stub.js';
import { backendEnv } from '../../env.js';
import { AuditModule } from '../audit/audit.module.js';

const documentsStateProvider = {
  provide: DOCUMENTS_STATE,
  useClass:
    backendEnv.DOCUMENTS_PERSISTENCE_DRIVER === 'postgres'
      ? PostgresDocumentsPersistenceStub
      : InMemoryDocumentsState
};

@Module({
  imports: [AuditModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, documentsStateProvider],
  exports: [DocumentsService]
})
export class DocumentsModule {}
