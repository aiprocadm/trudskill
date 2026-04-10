import { Module } from '@nestjs/common';

import { ESIGN_STATE } from './esign-state.token.js';
import { EsignController } from './esign.controller.js';
import { EsignService } from './esign.service.js';
import { InMemoryEsignState } from './in-memory-esign.state.js';
import { AuditModule } from '../audit/audit.module.js';
import { CoreModule } from '../core/core.module.js';
import { DocumentsModule } from '../documents/documents.module.js';

@Module({
  imports: [AuditModule, DocumentsModule, CoreModule],
  controllers: [EsignController],
  providers: [EsignService, { provide: ESIGN_STATE, useClass: InMemoryEsignState }],
  exports: [EsignService]
})
export class EsignModule {}
