import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  TemplateRenderError,
  convertDocxToPdf,
  extractPlaceholders,
  renderDocx
} from '@trudskill/docx-render';

import { type VariableCatalogEntry, classifyPlaceholders } from './variable-catalog.js';
import { backendEnv } from '../../env.js';
import { S3StorageClient } from '../../infrastructure/storage/s3-storage.client.js';
import { FilesService } from '../files/files.service.js';

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
    @Inject(S3StorageClient) private readonly storage: S3StorageClient
  ) {}

  /** Читает DOCX по fileId (через AV-гейт files-модуля) и раскладывает его плейсхолдеры. */
  async inspect(tenantId: string, fileId: string): Promise<TemplateInspection> {
    const docx = await this.readDocx(tenantId, fileId);
    let placeholders: string[];
    try {
      placeholders = extractPlaceholders(docx);
    } catch (error) {
      throw new BadRequestException({
        code: 'template_unreadable',
        message:
          error instanceof TemplateRenderError
            ? `Файл не читается как DOCX-шаблон: ${error.problems.join('; ')}`
            : 'Файл не читается как DOCX-шаблон'
      });
    }
    const { known, unknown } = classifyPlaceholders(placeholders);
    return { placeholders, known, unknown };
  }

  /**
   * Предпросмотр: подставляет демо-значения и отдаёт PDF — тем же путём, что боевая выдача.
   * @returns PDF-буфер; ошибки шаблона превращаются в 400 с текстом для админа (ФТ-A1.5).
   */
  async preview(
    tenantId: string,
    fileId: string,
    variables: Record<string, unknown>
  ): Promise<Buffer> {
    const docx = await this.readDocx(tenantId, fileId);
    let rendered: Buffer;
    try {
      rendered = renderDocx(docx, variables);
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

  private async readDocx(tenantId: string, fileId: string): Promise<Buffer> {
    const meta = await this.files.getReadableFile(tenantId, fileId);
    return streamToBuffer(await this.storage.getObjectStream({ key: meta.storageKey }));
  }
}
