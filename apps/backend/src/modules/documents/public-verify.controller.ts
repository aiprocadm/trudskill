import { Controller, Get, Inject, NotFoundException, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { DocumentsService } from './documents.service.js';
import { AuditService } from '../audit/audit.service.js';

/**
 * Pillar A Plan C §5.8 — публичная проверка подлинности документа по QR-коду.
 *
 * Endpoint без TenantGuard / PermissionGuard / auth — любой пользователь
 * (или regulator) может проверить документ через ссылку из QR.
 *
 * Rate-limit: 30 req/мин/IP (стандарт прописан в спеке). Защищает от
 * перебора, хотя при 128-битном qr_token перебор практически невозможен.
 */
@Controller('public')
export class PublicVerifyController {
  constructor(
    @Inject(DocumentsService) private readonly documentsService: DocumentsService,
    @Inject(AuditService) private readonly auditService: AuditService
  ) {}

  @Get('verify/:token')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async verify(@Param('token') token: string) {
    // Audit пишется с tenantId='public' для трассировки — не раскрывает
    // tenant документа (это сделает service-level если расширим).
    // entityId — partial token (первые 4 символа) для расследований:
    // полный token = доступ к документу, не должен светиться в audit-логе.
    await this.auditService.writeCritical({
      tenantId: 'public',
      action: 'documents.qr_verification_requested',
      entityType: 'documents.generated',
      entityId: `${token.slice(0, 4)}…`
    });
    const result = this.documentsService.verifyDocumentByQrToken(token);
    if (result.status === 'not_found') {
      throw new NotFoundException({
        code: 'document_not_found',
        message: 'Документ с таким QR-кодом не найден'
      });
    }
    return result;
  }
}
