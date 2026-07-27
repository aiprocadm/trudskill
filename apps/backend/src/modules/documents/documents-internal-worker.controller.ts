import { Body, Controller, Inject, NotFoundException, Post, UseGuards } from '@nestjs/common';
import { IsInt, IsObject, IsOptional, IsPositive, IsString, MinLength } from 'class-validator';

import { collectDocumentImageRefs } from './document-images.js';
import { DocumentVariablesBuilder } from './document-variables.builder.js';
import { DocumentsTenantRunner } from './documents-tenant-runner.service.js';
import { assertValidDto } from '../../common/app-validation.pipe.js';
import { FilesService } from '../files/files.service.js';
import { WorkerCallbackGuard } from '../mvp/infrastructure/worker-callback.guard.js';
import { TenantService } from '../tenant/tenant.service.js';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PDF_MIME = 'application/pdf';

class WorkerTaskRefDto {
  @IsString()
  @MinLength(1)
  tenantId!: string;

  @IsString()
  @MinLength(1)
  taskId!: string;
}

class WorkerCompleteDto extends WorkerTaskRefDto {
  @IsString()
  @MinLength(1)
  fileId!: string;

  /** ФТ-A1.3: PDF-двойник (worker конвертирует через Gotenberg). */
  @IsOptional()
  @IsString()
  @MinLength(1)
  pdfFileId?: string;

  /** ФТ-A1.4: словарь подставленных значений — основа детерминированного перевыпуска. */
  @IsOptional()
  @IsObject()
  variablesSnapshot?: Record<string, unknown>;
}

class WorkerFailDto extends WorkerTaskRefDto {
  @IsString()
  @MinLength(1)
  message!: string;
}

class WorkerUploadIntentDto extends WorkerTaskRefDto {
  @IsInt()
  @IsPositive()
  sizeBytes!: number;

  @IsOptional()
  @IsString()
  contentType?: string;
}

/**
 * Внутренние эндпоинты конвейера рендера (Фаза 1 Task 2, ФТ-A1.1) — вызывает apps/worker
 * после сообщения RabbitMQ. Не для браузера: защита — WorkerCallbackGuard (shared secret),
 * как у mvp/bulk-enrollments. Работают ВНЕ HTTP-персистенса, поэтому состояние тенанта
 * гидрируется/сохраняется явно через DocumentsTenantRunner (под per-tenant локом).
 *
 * `start` — клейм задачи: queued/running → running (+ резервация номера) и выдача всего,
 * что нужно рендеру (presigned GET шаблона, номер, переменные); терминальная задача →
 * `{claimed:false}` (worker молча ack'ает дубль сообщения). Race «сообщение обогнало
 * сохранение состояния» отдаёт 404 → worker ретраит с backoff'ом.
 */
@Controller('internal/worker/documents')
@UseGuards(WorkerCallbackGuard)
export class DocumentsInternalWorkerController {
  constructor(
    @Inject(DocumentsTenantRunner) private readonly runner: DocumentsTenantRunner,
    @Inject(DocumentVariablesBuilder) private readonly variables: DocumentVariablesBuilder,
    @Inject(FilesService) private readonly files: FilesService,
    @Inject(TenantService) private readonly tenants: TenantService
  ) {}

  @Post('start')
  async start(@Body() raw: unknown) {
    const body = assertValidDto(WorkerTaskRefDto, raw);
    const claim = await this.runner.runWithTenantDocuments(body.tenantId, async (documents) => {
      const task = documents.getDocumentTask(body.tenantId, body.taskId);
      if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
        return { claimed: false as const, status: task.status };
      }
      const started = documents.startTask(body.tenantId, body.taskId);
      const version = started.templateVersionId
        ? documents.getTemplateVersion(body.tenantId, started.templateVersionId)
        : undefined;
      const number = documents.getTaskReservedNumber(body.tenantId, started.id);
      return {
        claimed: true as const,
        status: started.status,
        templateFileId: version?.fileId,
        number,
        task: started
      };
    });
    if (!claim.claimed) {
      return claim;
    }
    if (!claim.templateFileId) {
      // Версия без файла: worker получит ответ без templateFileUrl и пометит задачу failed.
      return { claimed: true, taskId: body.taskId, number: claim.number, variables: {} };
    }
    // Presigned GET шаблона — вне runner'а (не держим tenant-лок на время S3-вызова).
    const templateFileUrl = await this.files.createDownloadUrl(body.tenantId, claim.templateFileId);
    // ФТ-A2.3: полный словарь всех десяти категорий каталога — собирается вне tenant-лока
    // documents (сборщик берёт собственный лок MVP-состояния).
    const variables = await this.variables.build({
      tenantId: body.tenantId,
      task: claim.task,
      ...(claim.number ? { reservedNumber: claim.number } : {})
    });
    // ФТ-A7.1: подпись и печать — отдельные файлы; worker получает presigned GET на каждую.
    const images = await this.imageUrls(body.tenantId, variables);
    return {
      claimed: true,
      taskId: body.taskId,
      number: claim.number,
      templateFileUrl,
      variables,
      images
    };
  }

  /** Presigned-ссылки на картинки бланка; недоступный файл пропускаем, а не валим выдачу. */
  private async imageUrls(
    tenantId: string,
    variables: Record<string, unknown>
  ): Promise<Array<{ name: string; url: string; widthMm: number }>> {
    const requisites = await this.tenants.getRequisites(tenantId).catch(() => undefined);
    const refs = collectDocumentImageRefs(variables, requisites);
    const resolved = await Promise.all(
      refs.map(async (ref) => {
        const url = await this.files.createDownloadUrl(tenantId, ref.fileId).catch(() => undefined);
        return url ? { name: ref.name, url, widthMm: ref.widthMm } : undefined;
      })
    );
    return resolved.filter((item): item is { name: string; url: string; widthMm: number } =>
      Boolean(item)
    );
  }

  @Post('result-upload-intent')
  async resultUploadIntent(@Body() raw: unknown) {
    const body = assertValidDto(WorkerUploadIntentDto, raw);
    const contentType = body.contentType ?? DOCX_MIME;
    // Расширение выводим из MIME: тот же эндпоинт отдаёт интенты и под DOCX, и под PDF-двойник.
    const extension = contentType === PDF_MIME ? 'pdf' : 'docx';
    return this.files.createUploadIntent(
      body.tenantId,
      { originalName: `${body.taskId}.${extension}`, contentType, sizeBytes: body.sizeBytes },
      {
        keyPrefix: 'generated-documents',
        mimeAllowlist: new Set([DOCX_MIME, PDF_MIME]),
        maxBytes: 50 * 1024 * 1024
      }
    );
  }

  @Post('complete')
  async complete(@Body() raw: unknown) {
    const body = assertValidDto(WorkerCompleteDto, raw);
    return this.runner.runWithTenantDocuments(body.tenantId, async (documents) => {
      const generated = documents.completeTask(body.tenantId, body.taskId, body.fileId, undefined, {
        ...(body.pdfFileId ? { pdfFileId: body.pdfFileId } : {}),
        ...(body.variablesSnapshot ? { variablesSnapshot: body.variablesSnapshot } : {})
      });
      return {
        generatedDocumentId: generated.id,
        documentNumber: generated.documentNumber,
        pdfFileId: generated.pdfFileId
      };
    });
  }

  @Post('fail')
  async fail(@Body() raw: unknown) {
    const body = assertValidDto(WorkerFailDto, raw);
    return this.runner.runWithTenantDocuments(body.tenantId, async (documents) => {
      try {
        const task = documents.failTask(body.tenantId, body.taskId, body.message);
        return { status: task.status };
      } catch (error) {
        if (error instanceof NotFoundException) throw error;
        // Completed task cannot be failed — гонка с дублем сообщения; отвечаем идемпотентно.
        return { status: 'completed' };
      }
    });
  }
}
