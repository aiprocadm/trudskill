import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  TemplateRenderError,
  convertDocxToPdf,
  detectImageContentType,
  extractTemplateTags,
  renderDocx
} from '@trudskill/docx-render';

import { collectDocumentImageRefs } from './document-images.js';
import {
  type VariableCatalogEntry,
  classifyPlaceholders,
  extraLearnerVariableEntries,
  isImageVariable
} from './variable-catalog.js';
import { backendEnv } from '../../env.js';
import { S3StorageClient } from '../../infrastructure/storage/s3-storage.client.js';
import { FilesService } from '../files/files.service.js';
import { learnerExtraFieldsFrom } from '../mvp/learners/learner-extra-fields.js';
import { tenantImageFileId } from '../tenant/tenant-document-images.js';
import { TenantService } from '../tenant/tenant.service.js';

import type { DocxImage, TemplateTag } from '@trudskill/docx-render';
import type { Readable } from 'node:stream';

/**
 * Разбор загруженного бланка и предпросмотр (ФТ-A3.2/A3.3, Фаза 1 Task 5).
 *
 * Админ загружает свой DOCX и должен СРАЗУ увидеть: какие плейсхолдеры распознаны, какие
 * система не знает (опечатка в имени), и как бланк выглядит заполненным. Движок рендера тот
 * же, что у фоновой выдачи (`@trudskill/docx-render`) — предпросмотр не может «выглядеть
 * иначе», чем реальный документ.
 */

export interface TemplateInspection {
  /** Все плейсхолдеры в порядке появления в бланке. */
  placeholders: string[];
  /** Распознанные — с описанием из каталога, для таблицы в админке. */
  known: VariableCatalogEntry[];
  /** Незнакомые: опечатка или переменная, которой в системе нет. */
  unknown: string[];
  /** Теги-картинки `{%…}`, найденные в бланке (ФТ-A7.1). */
  imagePlaceholders: string[];
  /**
   * Мягкие замечания по синтаксису — например, подпись вставили как обычный тег:
   * тогда в документе напечатается идентификатор файла вместо картинки.
   */
  warnings: string[];
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
  }
  return Buffer.concat(chunks);
}

@Injectable()
export class TemplateInspectionService {
  constructor(
    @Inject(FilesService) private readonly files: FilesService,
    @Inject(S3StorageClient) private readonly storage: S3StorageClient,
    @Inject(TenantService) private readonly tenants: TenantService
  ) {}

  private async extraKnown(tenantId: string): Promise<VariableCatalogEntry[]> {
    try {
      const stored = await this.tenants.getSettings(tenantId);
      return extraLearnerVariableEntries(learnerExtraFieldsFrom(stored.payload));
    } catch {
      // Настроек у центра может не быть — тогда именованных полей нет, и это не ошибка проверки.
      return [];
    }
  }

  /** Читает DOCX по fileId (через AV-гейт files-модуля) и раскладывает его плейсхолдеры. */
  async inspect(tenantId: string, fileId: string): Promise<TemplateInspection> {
    const docx = await this.readDocx(tenantId, fileId);
    let tags: TemplateTag[];
    try {
      tags = extractTemplateTags(docx);
    } catch (error) {
      throw new BadRequestException({
        code: 'template_unreadable',
        message:
          error instanceof TemplateRenderError
            ? `Файл не читается как DOCX-шаблон: ${error.problems.join('; ')}`
            : 'Файл не читается как DOCX-шаблон'
      });
    }
    const placeholders = tags.map((tag) => tag.name);
    // МГ-C1.3 (РМ86): именованные поля центра для проверки шаблона — известные переменные.
    const { known, unknown } = classifyPlaceholders(placeholders, await this.extraKnown(tenantId));
    // ФТ-A7.1: картинка, вставленная обычным тегом, молча напечатала бы UUID файла —
    // самая вероятная ошибка при первой настройке бланка, поэтому предупреждаем явно.
    const warnings = tags
      .filter((tag) => tag.kind === 'value' && isImageVariable(tag.name))
      .map(
        (tag) =>
          `«${tag.name}» — это картинка: вставьте её как {%${tag.name}}, иначе в документе` +
          ' напечатается идентификатор файла'
      );
    return {
      placeholders,
      known,
      unknown,
      imagePlaceholders: tags.filter((tag) => tag.kind === 'image').map((tag) => tag.name),
      warnings
    };
  }

  /**
   * Предпросмотр: подставляет демо-значения и отдаёт PDF — тем же путём, что боевая выдача.
   * @returns PDF-буфер; ошибки шаблона превращаются в 400 с текстом для админа (ФТ-A1.5).
   */
  async preview(
    tenantId: string,
    fileId: string,
    variables: Record<string, unknown>,
    images: Record<string, DocxImage> = {}
  ): Promise<Buffer> {
    const docx = await this.readDocx(tenantId, fileId);
    let rendered: Buffer;
    try {
      rendered = renderDocx(docx, variables, { images });
    } catch (error) {
      throw new BadRequestException({
        code: 'template_render_failed',
        message:
          error instanceof TemplateRenderError
            ? `Не удалось заполнить бланк: ${error.problems.join('; ')}`
            : 'Не удалось заполнить бланк'
      });
    }
    try {
      return await convertDocxToPdf(rendered, { gotenbergUrl: backendEnv.GOTENBERG_URL });
    } catch (error) {
      // Предпросмотр — интерактивная операция: ретраить нечего, показываем причину админу.
      throw new BadRequestException({
        code: 'preview_conversion_failed',
        message: error instanceof Error ? error.message : 'Не удалось получить PDF'
      });
    }
  }

  /**
   * Картинки тенанта для предпросмотра (ФТ-A7.1): админ обязан увидеть, как реально
   * встанут подпись и печать, — иначе первый настоящий документ станет сюрпризом.
   * Не загружены или битые — молча пропускаем: предпросмотр не место для отказов.
   */
  async previewImages(tenantId: string): Promise<Record<string, DocxImage>> {
    const requisites = await this.tenants.getRequisites(tenantId).catch(() => undefined);
    const refs = collectDocumentImageRefs(
      {
        'tenant.signature_image': tenantImageFileId(requisites, 'signature'),
        'tenant.stamp_image': tenantImageFileId(requisites, 'stamp')
      },
      requisites
    );
    const images: Record<string, DocxImage> = {};
    for (const ref of refs) {
      const data = await this.readFile(tenantId, ref.fileId).catch(() => undefined);
      const contentType = data ? detectImageContentType(data) : undefined;
      if (!data || !contentType) continue;
      images[ref.name] = { data, contentType, widthMm: ref.widthMm };
    }
    return images;
  }

  private async readDocx(tenantId: string, fileId: string): Promise<Buffer> {
    return this.readFile(tenantId, fileId);
  }

  /** Байты файла тенанта через AV-гейт files-модуля. */
  private async readFile(tenantId: string, fileId: string): Promise<Buffer> {
    const meta = await this.files.getReadableFile(tenantId, fileId);
    return streamToBuffer(await this.storage.getObjectStream({ key: meta.storageKey }));
  }
}
