import { Module } from '@nestjs/common';

import { ESIGN_STATE } from './esign-state.token.js';
import { EsignController } from './esign.controller.js';
import { EsignService } from './esign.service.js';
import { InMemoryEsignState } from './in-memory-esign.state.js';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { CoreModule } from '../core/core.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { IamModule } from '../iam/iam.module.js';
import { LegalLogWriter } from '../mvp/esignature/legal-log.writer.js';

@Module({
  // InfrastructureModule обязателен: LegalLogWriter объявлен провайдером здесь и
  // требует DatabaseService — без импорта весь бэкенд не стартует (2026-08-03).
  imports: [AuditModule, DocumentsModule, CoreModule, IamModule, InfrastructureModule],
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
