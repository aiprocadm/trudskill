import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  NotFoundException,
  Param,
  Post,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';

import { assertValidDto } from '../../../common/app-validation.pipe.js';
import { CurrentContext } from '../../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../../common/guards/tenant.guard.js';
import { DocumentsService } from '../../documents/documents.service.js';
import { DocumentsRequestPersistenceInterceptor } from '../../documents/infrastructure/documents-request-persistence.interceptor.js';
import { FilesService } from '../../files/files.service.js';
import { RequirePermissions } from '../../iam/permission.decorator.js';
import { PermissionGuard } from '../../iam/permission.guard.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import { MvpRequestPersistenceInterceptor } from '../infrastructure/mvp-request-persistence.interceptor.js';
import { MVP_STATE } from '../infrastructure/mvp-state.token.js';
import {
  AttachExternalScanRequest,
  CreateUploadUrlRequest,
  RegisterExternalDocumentRequest
} from '../mvp.dto.js';

import type { RequestContext } from '../../../common/context/request-context.js';

/** Сканы внешних документов: PDF и фотографии бланка. */
const EXTERNAL_SCAN_MIME: ReadonlySet<string> = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg'
]);
const EXTERNAL_SCAN_MAX_BYTES = 25 * 1024 * 1024;

/**
 * Внешние документы (ТЗ перехода с CDOPROF, МГ-F4.1, Фаза 3, срез 22.1; ТЗ §16
 * `POST /documents/external`, право `documents.write`).
 *
 * Документ, выданный раньше — в CDOPROF или на бумаге, — заносится реквизитами: вид, номер,
 * дата, слушатель, серия и разряд, срок действия, скан по желанию. Движок его не выпускал и не
 * перевыпускает, а книга выдачи, карточка слушателя и отчёты о сроках его видят.
 *
 * Живёт в модуле групп и слушателей: слушателя и его запись в группе знает только его снимок,
 * а модуль документов не импортирует модуль групп (цикл).
 */
@Controller()
@UseInterceptors(MvpRequestPersistenceInterceptor, DocumentsRequestPersistenceInterceptor)
@UseGuards(TenantGuard)
export class ExternalDocumentsController {
  constructor(
    @Inject(MVP_STATE) private readonly state: InMemoryMvpState,
    @Inject(DocumentsService) private readonly documents: DocumentsService,
    @Inject(FilesService) private readonly files: FilesService
  ) {}

  /** Запись слушателя, к которой относится документ: в группе, если она названа, иначе последняя. */
  private sourceOf(tenantId: string, learnerId: string, groupId: string | undefined) {
    const learner = this.state.learners.find((l) => l.tenantId === tenantId && l.id === learnerId);
    if (!learner) {
      throw new NotFoundException({
        code: 'external_document_learner_not_found',
        message: 'Слушатель не найден — внешний документ заносится на существующего слушателя.'
      });
    }
    const enrollments = this.state.enrollments
      .filter(
        (e) =>
          e.tenantId === tenantId &&
          e.learnerId === learnerId &&
          (!groupId || e.groupId === groupId)
      )
      .sort((a, b) => (b.enrolledAt ?? '').localeCompare(a.enrolledAt ?? ''));
    const enrollment = enrollments[0];
    if (groupId && !enrollment) {
      throw new BadRequestException({
        code: 'external_document_learner_not_in_group',
        message: 'Слушатель не состоит в указанной группе.'
      });
    }
    return enrollment
      ? { sourceEntityType: 'enrollment', sourceEntityId: enrollment.id }
      : { sourceEntityType: 'learner', sourceEntityId: learnerId };
  }

  @Post('documents/external')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  register(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const b = assertValidDto(RegisterExternalDocumentRequest, raw);
    const source = this.sourceOf(c.tenantId!, b.learnerId, b.groupId);
    return this.documents.registerExternalDocument(
      c.tenantId!,
      c.userId,
      {
        kindCode: b.kindCode,
        number: b.number,
        date: b.date,
        ...source,
        ...(b.series ? { series: b.series } : {}),
        ...(b.rank ? { rank: b.rank } : {}),
        ...(b.validUntil ? { validUntil: b.validUntil } : {}),
        ...(b.fileId ? { fileId: b.fileId } : {}),
        ...(b.sourceSystem ? { sourceSystem: b.sourceSystem } : {}),
        ...(b.externalId ? { externalId: b.externalId } : {})
      },
      c
    );
  }

  /** Шаг 1 загрузки скана: адрес для файла (PDF, PNG, JPEG, до 25 МБ). */
  @Post('documents/external/upload-url')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  uploadUrl(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const b = assertValidDto(CreateUploadUrlRequest, raw);
    return this.files.createUploadIntent(c.tenantId!, b, {
      keyPrefix: 'external-documents',
      mimeAllowlist: EXTERNAL_SCAN_MIME,
      maxBytes: EXTERNAL_SCAN_MAX_BYTES
    });
  }

  /** Шаг 2: «Загрузить скан» — единственное, что можно сделать с внешним документом (МГ-F4.1). */
  @Post('documents/external/:id/scan')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  async attachScan(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() raw: unknown
  ) {
    const b = assertValidDto(AttachExternalScanRequest, raw);
    const status = await this.files.getAntivirusStatus(c.tenantId!, b.fileId);
    if (status === null) {
      throw new NotFoundException({ code: 'file_not_found', message: 'Файл не найден' });
    }
    const document = this.documents.attachExternalScan(c.tenantId!, c.userId, id, b.fileId, c);
    /* Проверка антивирусом — в фоне; до вердикта скачать файл нельзя (гейт `FilesService`). */
    void this.files.scanFile(c.tenantId!, b.fileId, c.userId).catch(() => {
      // Сбой проверки не отменяет привязку: файл остаётся «на проверке», и скачать его нельзя,
      // пока антивирус не даст вердикт (гейт `FilesService`) — повторная проверка при скачивании.
    });
    return document;
  }
}
