import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';

import { DOCUMENT_KINDS } from './document-kinds.js';
import { DocumentsEnqueueService } from './documents-enqueue.service.js';
import {
  CloseGroupDto,
  CreateNumberingRuleDto,
  CreateTemplateBindingDto,
  CreateTemplateDto,
  CreateTemplateVariableDto,
  CreateTemplateVersionDto,
  CreateUploadUrlDto,
  DiscardQuarantinedDto,
  DocumentReasonDto,
  GenerateDocumentDto,
  GenerateDocumentsBatchDto,
  IssueGroupOrderDto,
  SetCurrentVersionDto,
  TenantImageSlotDto,
  UpdateNumberingRuleDto,
  UpdateTemplateBindingDto,
  UpdateTemplateDto,
  UpdateTemplateVariableDto,
  UpdateTemplateVersionDto
} from './documents.request-dto.js';
import {
  DocumentsService,
  type IssuedDocumentFilter,
  type IssuedDocumentsPage
} from './documents.service.js';
import { GroupPackageService } from './group-package.service.js';
import { capHttpPageSize } from './http-page-cap.js';
import { DocumentsNormalizedReadsService } from './infrastructure/documents-normalized-reads.service.js';
import { DocumentsRequestPersistenceInterceptor } from './infrastructure/documents-request-persistence.interceptor.js';
import { IssuanceReadinessService } from './issuance-readiness.service.js';
import { JobQuarantineService } from './job-quarantine.service.js';
import { validateProtocolTemplate } from './protocol-compliance.js';
import { TemplateInspectionService } from './template-inspection.service.js';
import { demoVariables } from './variable-catalog.js';
import { assertValidDto } from '../../common/app-validation.pipe.js';
import { CurrentContext } from '../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { FilesService } from '../files/files.service.js';
import { RequirePermissions } from '../iam/permission.decorator.js';
import { PermissionGuard } from '../iam/permission.guard.js';
import { isNormalizedRead } from '../mvp/infrastructure/normalized-collections.js';
import { ReadsNormalized } from '../mvp/infrastructure/reads-normalized.decorator.js';
import {
  TENANT_DOCUMENT_IMAGES_KEY,
  TENANT_IMAGE_SLOTS,
  type TenantImageSlot,
  readTenantDocumentImages
} from '../tenant/tenant-document-images.js';
import { TenantService } from '../tenant/tenant.service.js';

import type { BaseFilter } from './documents.dto.js';
import type { RequestContext } from '../../common/context/request-context.js';
import type { Response } from 'express';

/** Hard cap для CSV-экспорта книги выдачи — защита от DoS на больших тенантах. */
export const ISSUANCE_JOURNAL_CSV_HARD_CAP = 10000;

/** Заголовки CSV в книге выдачи (точный порядок столбцов). */
export const ISSUANCE_JOURNAL_CSV_HEADER =
  '№;Дата выдачи;№ документа;Тип документа;Статус;ID документа;ID группового приказа';

const TEMPLATE_DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Форматы факсимиле (ФТ-A7.1) — ровно те, что умеет вставлять движок рендера. */
const TENANT_IMAGE_MIMES = new Set(['image/png', 'image/jpeg']);

@Controller()
@UseInterceptors(DocumentsRequestPersistenceInterceptor)
@UseGuards(TenantGuard)
export class DocumentsController {
  constructor(
    @Inject(DocumentsService) private readonly documentsService: DocumentsService,
    @Inject(DocumentsEnqueueService) private readonly enqueue: DocumentsEnqueueService,
    @Inject(TemplateInspectionService) private readonly inspection: TemplateInspectionService,
    @Inject(GroupPackageService) private readonly groupPackages: GroupPackageService,
    @Inject(FilesService) private readonly files: FilesService,
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(JobQuarantineService) private readonly quarantine: JobQuarantineService,
    /*
     * ТЗ 8.2 (Р6): запрет выдачи, пока центр настроен не до конца. Параметр ПОСЛЕДНИЙ —
     * новая зависимость в середине сдвигает позиционные вызовы (журнал 526).
     */
    @Inject(IssuanceReadinessService)
    private readonly issuanceReadiness: IssuanceReadinessService,
    /* Фаза 1, срез 5b: чтение документов из таблицы под флагом. Параметр ПОСЛЕДНИЙ (журнал 526). */
    @Inject(DocumentsNormalizedReadsService)
    private readonly normalizedReads: DocumentsNormalizedReadsService
  ) {}

  /**
   * ФТ-A7.1: интент загрузки подписи руководителя или печати УЦ. Отдельный keyPrefix и
   * allowlist только на PNG/JPEG — рендер умеет вставлять лишь эти форматы, а лимит
   * маленький: факсимиле — это картинка на пару сотен килобайт, не скан журнала.
   */
  @Post('tenant-images/upload-url')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  createTenantImageUploadUrl(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    /* Форма проверяется классом (ревизия 2026-08-26), список типов — ниже, он доменный. */
    const b = assertValidDto(CreateUploadUrlDto, raw);
    const sizeBytes = b.sizeBytes;
    const contentType = b?.contentType ?? 'image/png';
    if (!TENANT_IMAGE_MIMES.has(contentType)) {
      throw new BadRequestException({
        code: 'validation_error',
        message: 'Поддерживаются только PNG и JPEG'
      });
    }
    return this.files.createUploadIntent(
      c.tenantId!,
      { originalName: b?.originalName ?? 'signature.png', contentType, sizeBytes },
      {
        keyPrefix: 'tenant-images',
        mimeAllowlist: TENANT_IMAGE_MIMES,
        maxBytes: 5 * 1024 * 1024
      }
    );
  }

  @Get('tenant-images')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.read')
  async listTenantImages(@CurrentContext() c: RequestContext) {
    const requisites = await this.tenants.getRequisites(c.tenantId!).catch(() => undefined);
    return { images: readTenantDocumentImages(requisites) };
  }

  /** Привязать загруженный файл к слоту (или отвязать, прислав `fileId: null`). */
  @Put('tenant-images/:slot')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  async updateTenantImage(
    @CurrentContext() c: RequestContext,
    @Param('slot') slot: string,
    @Body() raw: unknown
  ) {
    const b = assertValidDto(TenantImageSlotDto, raw);
    if (!(TENANT_IMAGE_SLOTS as readonly string[]).includes(slot)) {
      throw new BadRequestException({
        code: 'validation_error',
        message: `Неизвестный слот «${slot}»: ожидается ${TENANT_IMAGE_SLOTS.join(' или ')}`
      });
    }
    if (b?.widthMm !== undefined && (typeof b.widthMm !== 'number' || b.widthMm <= 0)) {
      throw new BadRequestException({
        code: 'validation_error',
        message: 'widthMm must be a positive number'
      });
    }
    const requisites = await this.tenants.getRequisites(c.tenantId!);
    const images = readTenantDocumentImages(requisites);
    if (b?.fileId) {
      images[slot as TenantImageSlot] = {
        fileId: b.fileId,
        ...(b.widthMm ? { widthMm: b.widthMm } : {})
      };
    } else {
      delete images[slot as TenantImageSlot];
    }
    /* Подпись и печать печатаются в удостоверении — смена слота идёт в журнал (ФТ-G1). */
    const saved = await this.tenants.updateRequisites(
      c.tenantId!,
      { payload: { [TENANT_DOCUMENT_IMAGES_KEY]: images } },
      c
    );
    return { images: readTenantDocumentImages(saved) };
  }

  /**
   * ФТ-A3.1: интент загрузки бланка. Отдельный keyPrefix и allowlist только на DOCX —
   * шаблоны не должны смешиваться с работами слушателей, а рендер понимает лишь DOCX.
   * AV-гейт общий для files-модуля (ФТ-G5).
   */
  @Post('templates/upload-url')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  createTemplateUploadUrl(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const b = assertValidDto(CreateUploadUrlDto, raw);
    const sizeBytes = Number(b?.sizeBytes);
    if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) {
      throw new BadRequestException({
        code: 'validation_error',
        message: 'sizeBytes must be a positive integer'
      });
    }
    const originalName = (b?.originalName ?? 'template.docx').trim() || 'template.docx';
    return this.files.createUploadIntent(
      c.tenantId!,
      { originalName, contentType: TEMPLATE_DOCX_MIME, sizeBytes },
      {
        keyPrefix: 'templates',
        mimeAllowlist: new Set([TEMPLATE_DOCX_MIME]),
        maxBytes: 25 * 1024 * 1024
      }
    );
  }

  /* МГ-F1.1 (срез 18.1): виды документов — общий каталог (паритет с CDOPROF, ТЗ §9.1). */
  @Get('document-kinds')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.read')
  listDocumentKinds() {
    return { items: DOCUMENT_KINDS };
  }

  @Get('templates')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.read')
  listTemplates(@CurrentContext() c: RequestContext, @Query() q: BaseFilter) {
    return this.documentsService.listTemplates(c.tenantId!, capHttpPageSize(q));
  }
  @Post('templates')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  createTemplate(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const b = assertValidDto(CreateTemplateDto, raw);
    return this.documentsService.createTemplate(c.tenantId!, c.userId, b, c);
  }
  @Get('templates/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.read')
  getTemplate(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.documentsService.getTemplate(c.tenantId!, id);
  }
  @Patch('templates/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  patchTemplate(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() raw: unknown
  ) {
    const b = assertValidDto(UpdateTemplateDto, raw);
    return this.documentsService.updateTemplate(c.tenantId!, c.userId, id, b, c);
  }
  @Post('templates/:id/archive')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  archiveTemplate(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.documentsService.archiveTemplate(c.tenantId!, c.userId, id, c);
  }
  @Post('templates/:id/unarchive')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  unarchiveTemplate(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.documentsService.unarchiveTemplate(c.tenantId!, c.userId, id, c);
  }
  @Post('templates/:id/set-current-version')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  setCurrentVersion(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() raw: unknown
  ) {
    const b = assertValidDto(SetCurrentVersionDto, raw);
    return this.documentsService.setCurrentVersion(
      c.tenantId!,
      c.userId,
      id,
      b.templateVersionId,
      c
    );
  }

  @Get('template-versions')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.read')
  listTemplateVersions(@CurrentContext() c: RequestContext, @Query() q: BaseFilter) {
    return this.documentsService.listTemplateVersions(c.tenantId!, capHttpPageSize(q));
  }
  @Post('template-versions')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  async createTemplateVersion(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const b = assertValidDto(CreateTemplateVersionDto, raw);
    // ФТ-A3.1: раньше fileId принимался «на честном слове» — версия могла ссылаться на
    // несуществующий или чужой файл, и это всплывало только при выдаче документа.
    // Проверяем файл сразу: он тенантный, прошёл AV-гейт и читается как DOCX-шаблон.
    await this.inspection.inspect(c.tenantId!, b.fileId);
    return this.documentsService.createTemplateVersion(c.tenantId!, c.userId, b);
  }
  @Get('template-versions/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.read')
  getTemplateVersion(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.documentsService.getTemplateVersion(c.tenantId!, id);
  }
  @Patch('template-versions/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  patchTemplateVersion(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() raw: unknown
  ) {
    const b = assertValidDto(UpdateTemplateVersionDto, raw);
    return this.documentsService.updateTemplateVersion(c.tenantId!, id, b);
  }
  @Post('template-versions/:id/activate')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  activateVersion(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.documentsService.activateTemplateVersion(c.tenantId!, c.userId, id, c);
  }
  /**
   * ФТ-A3.2: разбор загруженного бланка — «найдено / соответствует каталогу / неизвестно».
   * Раньше эндпоинт лишь возвращал ранее сохранённые переменные и сам DOCX не читал.
   */
  @Post('template-versions/:id/parse-variables')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  async parseVariables(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    const version = this.documentsService.getTemplateVersion(c.tenantId!, id);
    const inspection = await this.inspection.inspect(c.tenantId!, version.fileId);
    // ФТ-A8: для протоколов дополнительно сверяем бланк с п. 92 ПП 2464.
    // Мягко: это предупреждение в ответе, загрузка бланка не блокируется.
    const template = this.documentsService.getTemplate(c.tenantId!, version.templateId);
    const compliance =
      template.templateType === 'protocol'
        ? validateProtocolTemplate(inspection.placeholders)
        : undefined;
    return {
      templateVersionId: id,
      ...inspection,
      ...(compliance ? { compliance } : {}),
      declared: this.documentsService.listTemplateVariables(c.tenantId!, {
        templateVersionId: id
      })
    };
  }

  /**
   * ФТ-A3.3: «Сгенерировать пример» — тот же движок, что у боевой выдачи, но на демо-данных.
   * Отдаём PDF потоком: конверт ответа для бинарных тел не применяется (см. @Res в проекте).
   */
  @Post('template-versions/:id/preview')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  async previewVersion(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Res() res: Response
  ) {
    const version = this.documentsService.getTemplateVersion(c.tenantId!, id);
    // ФТ-A7.1: предпросмотр показывает НАСТОЯЩИЕ подпись и печать центра — заглушек тут
    // быть не может, админ проверяет именно как факсимиле встанет на бланк.
    const images = await this.inspection.previewImages(c.tenantId!);
    const pdf = await this.inspection.preview(c.tenantId!, version.fileId, demoVariables(), images);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="preview-${id}.pdf"`);
    res.setHeader('Content-Length', String(pdf.length));
    res.end(pdf);
  }

  @Get('template-variables')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.read')
  listTemplateVariables(@CurrentContext() c: RequestContext, @Query() q: BaseFilter) {
    return this.documentsService.listTemplateVariables(c.tenantId!, capHttpPageSize(q));
  }
  @Post('template-variables')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  createTemplateVariable(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const b = assertValidDto(CreateTemplateVariableDto, raw);
    return this.documentsService.createTemplateVariable(c.tenantId!, c.userId, b, c);
  }
  @Get('template-variables/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.read')
  getTemplateVariable(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.documentsService.getTemplateVariable(c.tenantId!, id);
  }
  @Patch('template-variables/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  patchTemplateVariable(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() raw: unknown
  ) {
    const b = assertValidDto(UpdateTemplateVariableDto, raw);
    return this.documentsService.updateTemplateVariable(c.tenantId!, c.userId, id, b, c);
  }
  @Delete('template-variables/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  deleteTemplateVariable(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.documentsService.deleteTemplateVariable(c.tenantId!, c.userId, id, c);
  }

  @Get('template-bindings')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.read')
  listTemplateBindings(@CurrentContext() c: RequestContext, @Query() q: BaseFilter) {
    return this.documentsService.listTemplateBindings(c.tenantId!, capHttpPageSize(q));
  }
  @Post('template-bindings')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  createTemplateBinding(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const b = assertValidDto(CreateTemplateBindingDto, raw);
    return this.documentsService.createTemplateBinding(c.tenantId!, c.userId, b, c);
  }
  @Get('template-bindings/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.read')
  getTemplateBinding(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.documentsService.getTemplateBinding(c.tenantId!, id);
  }
  @Patch('template-bindings/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  patchTemplateBinding(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() raw: unknown
  ) {
    const b = assertValidDto(UpdateTemplateBindingDto, raw);
    return this.documentsService.updateTemplateBinding(c.tenantId!, c.userId, id, b, c);
  }
  @Delete('template-bindings/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  deleteTemplateBinding(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.documentsService.deleteTemplateBinding(c.tenantId!, c.userId, id, c);
  }

  @Get('documents')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.read')
  @ReadsNormalized('generatedDocuments')
  listDocuments(@CurrentContext() c: RequestContext, @Query() q: BaseFilter) {
    return isNormalizedRead('generatedDocuments')
      ? this.normalizedReads.listDocuments(c.tenantId!, capHttpPageSize(q))
      : this.documentsService.listDocuments(c.tenantId!, capHttpPageSize(q));
  }
  @Get('documents/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.read')
  @ReadsNormalized('generatedDocuments')
  getDocument(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return isNormalizedRead('generatedDocuments')
      ? this.normalizedReads.getDocument(c.tenantId!, id)
      : this.documentsService.getDocument(c.tenantId!, id);
  }
  @Post('documents/generate')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.generate')
  async generateDocument(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    /*
     * Ревизия 2026-08-26: тело было типизировано ИНТЕРФЕЙСОМ, а интерфейс при сборке
     * исчезает — общий проверяющий видел `Object` и пропускал что угодно. Здесь выпускается
     * документ с юридической силой, поэтому вход проверяется явно.
     */
    const b = assertValidDto(GenerateDocumentDto, raw);
    /*
     * ТЗ 8.2 (Р6): недонастроенный центр выпускает бумагу, а не документ — без реквизитов,
     * лицензии, комиссии, бланка или номера он недействителен при проверке (журнал 528).
     */
    await this.issuanceReadiness.assertCanIssue(c.tenantId!);
    const task = this.documentsService.generateDocument(c.tenantId!, c.userId, b, c);
    // ФТ-A1.1: job в очередь. Race «сообщение обогнало сохранение состояния» разруливает
    // worker (retry c backoff), повторная публикация того же taskId безопасна (claim в start).
    await this.enqueue.publishQueuedTasks(c.tenantId!, [task], {
      requestId: c.requestId,
      correlationId: c.correlationId
    });
    return task;
  }
  @Post('documents/generate/batch')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.generate')
  async generateDocumentsBatch(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const b = assertValidDto(GenerateDocumentsBatchDto, raw);
    /* Тот же запрет: массовый выпуск отличается от одиночного только количеством бумаги. */
    await this.issuanceReadiness.assertCanIssue(c.tenantId!);
    const result = this.documentsService.generateDocumentsBatch(c.tenantId!, c.userId, b, c);
    await this.enqueue.publishQueuedTasks(c.tenantId!, result.items, {
      requestId: c.requestId,
      correlationId: c.correlationId
    });
    return result;
  }
  @Post('documents/:id/finalize')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  finalizeDocument(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.documentsService.finalizeDocument(c.tenantId!, c.userId, id, c);
  }
  @Post('documents/:id/sign')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.sign')
  signDocument(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.documentsService.signDocument(c.tenantId!, c.userId, id, c);
  }
  @Post('documents/:id/archive')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  archiveDocument(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.documentsService.archiveDocument(c.tenantId!, c.userId, id, c);
  }
  @Get('documents/:id/download')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.read')
  async downloadDocument(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    // ФТ-G1: скачивание пишется в журнал — документ содержит ПДн слушателя, и центр обязан
    // уметь ответить, кто и когда его выгружал.
    const doc = this.documentsService.getDocumentForDownload(c.tenantId!, id, c.userId, c);
    // Ревизия 2026-08-26 (порция 21): раньше здесь строился адрес «files/:id/download»,
    // которого не существовало ни в одном контроллере, — журнал фиксировал скачивания,
    // которые физически не могли состояться. Теперь отдаётся подписанная ссылка
    // хранилища (внутри — антивирусный гейт).
    return { downloadUrl: await this.files.createDownloadUrl(c.tenantId!, doc.fileId!) };
  }

  @Get('document-tasks')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.read')
  listTasks(@CurrentContext() c: RequestContext, @Query() q: BaseFilter) {
    return this.documentsService.listDocumentTasks(c.tenantId!, capHttpPageSize(q));
  }
  @Get('document-tasks/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.read')
  getTask(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.documentsService.getDocumentTask(c.tenantId!, id);
  }
  @Post('document-tasks/:id/retry')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  async retryTask(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    const task = this.documentsService.retryTask(c.tenantId!, id);
    // Фаза 6 Task 7: РАНЬШЕ «Повторить» только меняло статус на `queued` и на этом всё —
    // сообщение в очередь не уходило, задача висела «в очереди» вечно, а человек был
    // уверен, что перезапустил её. Теперь публикуется настоящий job.
    await this.enqueue.publishQueuedTasks(c.tenantId!, [task], {
      ...(c.requestId ? { requestId: c.requestId } : {}),
      ...(c.correlationId ? { correlationId: c.correlationId } : {})
    });
    return task;
  }

  // --- Карантин упавших задач (ФТ-I1, Фаза 6 Task 7) -------------------------------
  // Очередь `jobs.dead-letter` наполнялась с Фазы 0, но читать её было некому.
  @Get('job-quarantine')
  @UseGuards(PermissionGuard)
  @RequirePermissions('operations.quarantine.read')
  listQuarantine(
    @CurrentContext() c: RequestContext,
    @Query('status') status?: string,
    @Query('limit') limit?: string
  ) {
    return this.quarantine.list(c.tenantId!, {
      ...(status ? { status } : {}),
      ...(limit ? { limit: Number(limit) } : {})
    });
  }

  @Post('job-quarantine/:id/republish')
  @UseGuards(PermissionGuard)
  @RequirePermissions('operations.quarantine.write')
  republishQuarantined(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.quarantine.republish(c.tenantId!, id, c);
  }

  @Post('job-quarantine/:id/discard')
  @UseGuards(PermissionGuard)
  @RequirePermissions('operations.quarantine.write')
  discardQuarantined(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() raw: unknown
  ) {
    const body = assertValidDto(DiscardQuarantinedDto, raw ?? {});
    return this.quarantine.discard(c.tenantId!, id, body.reason, c);
  }
  @Post('document-tasks/:id/cancel')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  cancelTask(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.documentsService.cancelTask(c.tenantId!, id);
  }

  @Get('numbering-rules')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.read')
  listRules(@CurrentContext() c: RequestContext, @Query() q: BaseFilter) {
    return this.documentsService.listNumberingRules(c.tenantId!, capHttpPageSize(q));
  }
  @Post('numbering-rules')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  createRule(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const b = assertValidDto(CreateNumberingRuleDto, raw);
    return this.documentsService.createNumberingRule(c.tenantId!, b);
  }
  @Get('numbering-rules/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.read')
  getRule(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.documentsService.getNumberingRule(c.tenantId!, id);
  }
  @Patch('numbering-rules/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  patchRule(@CurrentContext() c: RequestContext, @Param('id') id: string, @Body() raw: unknown) {
    const b = assertValidDto(UpdateNumberingRuleDto, raw);
    return this.documentsService.updateNumberingRule(c.tenantId!, id, b);
  }
  @Post('numbering-rules/:id/activate')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  activateRule(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.documentsService.activateNumberingRule(c.tenantId!, c.userId, id, c);
  }
  @Post('numbering-rules/:id/deactivate')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  deactivateRule(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.documentsService.deactivateNumberingRule(c.tenantId!, c.userId, id, c);
  }

  // ==========================================================================
  // Pillar A Plan B §5.6 — книга выдачи документов (issuance journal).
  // ==========================================================================

  @Get('admin/documents/issuance-journal')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.read')
  @ReadsNormalized('generatedDocuments')
  async listIssuanceJournal(
    @CurrentContext() c: RequestContext,
    @Query() q: Record<string, string | string[] | undefined>
  ): Promise<IssuedDocumentsPage> {
    const filter = parseIssuanceFilter(q);
    return isNormalizedRead('generatedDocuments')
      ? this.normalizedReads.listIssuedDocuments(c.tenantId!, filter)
      : this.documentsService.listIssuedDocuments(c.tenantId!, filter);
  }

  @Get('admin/documents/issuance-journal.csv')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.read')
  @ReadsNormalized('generatedDocuments')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="issuance-journal.csv"')
  async exportIssuanceJournalCsv(
    @CurrentContext() c: RequestContext,
    @Query() q: Record<string, string | string[] | undefined>
  ): Promise<string> {
    const filter = {
      ...parseIssuanceFilter(q),
      limit: ISSUANCE_JOURNAL_CSV_HARD_CAP,
      offset: 0
    };
    const page = isNormalizedRead('generatedDocuments')
      ? await this.normalizedReads.listIssuedDocuments(c.tenantId!, filter)
      : this.documentsService.listIssuedDocuments(c.tenantId!, filter);
    return renderIssuanceJournalCsv(page.items);
  }

  // ==========================================================================
  // Pillar A Plan B §5.7 — групповые приказы (issueGroupOrder).
  // ==========================================================================

  @Post('admin/documents/group-orders')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  issueGroupOrder(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    /* Ревизия 2026-08-26: тело-интерфейс не проверялось (см. documents.request-dto.ts). */
    const b = assertValidDto(IssueGroupOrderDto, raw);
    return this.documentsService.issueGroupOrder(c.tenantId!, c.userId, b, c);
  }

  // ==========================================================================
  // ФТ-A5 «закрыть группу» (Фаза 1 Task 7a).
  // ==========================================================================

  /** Протокол на группу + удостоверение каждому сдавшему; повтор добивает упавшие. */
  @Post('admin/documents/close-group')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.generate')
  closeGroup(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    /* «Закрыть группу» выпускает протокол и удостоверения — вход проверяется явно. */
    const b = assertValidDto(CloseGroupDto, raw);
    return this.documentsService.closeGroup(c.tenantId!, c.userId, b, c);
  }

  /** Сводка статусов по закрытию группы — прогресс для админа (ФТ-A5.3). */
  @Get('admin/documents/close-group/:groupId')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.read')
  groupClosureStatus(@CurrentContext() c: RequestContext, @Param('groupId') groupId: string) {
    return this.documentsService.getGroupClosureStatus(c.tenantId!, groupId);
  }

  /**
   * ФТ-A5.2: комплект группы одним ZIP. Отдаём потоком — конверт ответа для
   * бинарных тел не применяется (как в предпросмотре PDF выше).
   */
  @Get('admin/documents/close-group/:groupId/package')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.read')
  async groupPackage(
    @CurrentContext() c: RequestContext,
    @Param('groupId') groupId: string,
    @Res() res: Response
  ) {
    const zip = await this.groupPackages.buildGroupZip(c.tenantId!, groupId);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="group-${groupId}.zip"`);
    res.setHeader('Content-Length', String(zip.length));
    res.end(zip);
  }

  // ==========================================================================
  // Pillar A Plan C §5.9 — аннулирование и перевыпуск.
  // ==========================================================================

  @Post('admin/documents/:id/revoke')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  revokeDocument(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() raw: unknown
  ) {
    const b = assertValidDto(DocumentReasonDto, raw);
    return this.documentsService.revokeDocument(c.tenantId!, c.userId, id, b.reason, c);
  }

  @Post('admin/documents/:id/reissue')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.write')
  reissueDocument(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() raw: unknown
  ) {
    const b = assertValidDto(DocumentReasonDto, raw);
    return this.documentsService.reissueDocument(c.tenantId!, c.userId, id, b.reason, c);
  }
}

// ============================================================================
// Pillar A Plan B §5.6 — utilities для книги выдачи. Экспортируются для
// использования в unit-тестах CSV-рендеринга.
// ============================================================================

function parseIssuanceFilter(
  query: Record<string, string | string[] | undefined>
): IssuedDocumentFilter {
  const asArray = (v: string | string[] | undefined): string[] | undefined =>
    v === undefined ? undefined : Array.isArray(v) ? v : [v];
  const asString = (v: string | string[] | undefined): string | undefined =>
    v === undefined ? undefined : Array.isArray(v) ? v[0] : v;
  const asInt = (v: string | string[] | undefined): number | undefined => {
    const s = asString(v);
    if (s === undefined) return undefined;
    const n = Number.parseInt(s, 10);
    return Number.isFinite(n) ? n : undefined;
  };
  return {
    from: asString(query.from),
    to: asString(query.to),
    types: asArray(query.types),
    status: asString(query.status),
    groupOrderDocumentId: asString(query.groupOrderDocumentId),
    limit: asInt(query.limit),
    offset: asInt(query.offset)
  };
}

function csvEscape(value: string): string {
  if (value.includes(';') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Рендерит CSV для книги выдачи с UTF-8 BOM и `;`-разделителем — формат,
 * который Excel в русской локали корректно открывает без manual import wizard'а.
 */
export function renderIssuanceJournalCsv(
  rows: Array<{
    id: string;
    documentNumber?: string;
    documentType?: string;
    status?: string;
    documentDate?: string;
    groupOrderDocumentId?: string;
  }>
): string {
  const body = rows.map((d, idx) =>
    [
      String(idx + 1),
      d.documentDate ?? '',
      csvEscape(d.documentNumber ?? ''),
      d.documentType ?? '',
      d.status ?? '',
      d.id,
      d.groupOrderDocumentId ?? ''
    ].join(';')
  );
  // ﻿ — UTF-8 BOM. Excel в русской локали без BOM по умолчанию пытается
  // декодировать как Windows-1251 и ломает кириллицу.
  return '﻿' + [ISSUANCE_JOURNAL_CSV_HEADER, ...body].join('\r\n');
}
