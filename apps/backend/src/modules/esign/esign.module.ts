import { Module } from '@nestjs/common';
import { EsignController } from './esign.controller.js';
import { EsignService } from './esign.service.js';
import { AuditModule } from '../audit/audit.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { CoreModule } from '../core/core.module.js';
@Module({ imports: [AuditModule, DocumentsModule, CoreModule], controllers: [EsignController], providers: [EsignService], exports: [EsignService] })
export class EsignModule {}
