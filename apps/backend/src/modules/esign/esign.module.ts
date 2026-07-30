import { Module } from '@nestjs/common';

import { ESIGN_STATE } from './esign-state.token.js';
import { EsignController } from './esign.controller.js';
import { EsignService } from './esign.service.js';
import { InMemoryEsignState } from './in-memory-esign.state.js';
import { AuditModule } from '../audit/audit.module.js';
import { CoreModule } from '../core/core.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { IamModule } from '../iam/iam.module.js';
import { LegalLogWriter } from '../mvp/esignature/legal-log.writer.js';

@Module({
  imports: [AuditModule, DocumentsModule, CoreModule, IamModule],
  controllers: [EsignController],
  providers: [
    EsignService,
    { provide: ESIGN_STATE, useClass: InMemoryEsignState },
    // Юридический журнал в БД (append-only, 0004): до этой правки записи esign жили
    // только в памяти и не переживали перезапуск.
    LegalLogWriter
  ],
  exports: [EsignService]
})
export class EsignModule {}
