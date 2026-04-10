import { Module } from '@nestjs/common';

import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';
import { AuditModule } from '../audit/audit.module.js';

@Module({
  imports: [AuditModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService]
})
export class DocumentsModule {}
