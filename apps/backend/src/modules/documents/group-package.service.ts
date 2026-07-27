import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import AdmZip from 'adm-zip';

import { DocumentsService } from './documents.service.js';
import { S3StorageClient } from '../../infrastructure/storage/s3-storage.client.js';
import { FilesService } from '../files/files.service.js';

import type { GeneratedDocumentEntity } from './documents.types.js';
import type { Readable } from 'node:stream';

/**
 * ФТ-A5.2 — выгрузка комплекта закрытой группы одним ZIP (Фаза 1 Task 7b).
 *
 * Админ УЦ отдаёт пачку в бумажный архив или заказчику: ходить по 25 документам
 * поштучно нереально. Собираем только готовые PDF — упавшие и ещё не отрендеренные
 * в архив не попадают (их состояние видно в сводке `getGroupClosureStatus`).
 */
@Injectable()
export class GroupPackageService {
  constructor(
    @Inject(DocumentsService) private readonly documents: DocumentsService,
    @Inject(FilesService) private readonly files: FilesService,
    @Inject(S3StorageClient) private readonly storage: S3StorageClient
  ) {}

  async buildGroupZip(tenantId: string, groupId: string): Promise<Buffer> {
    const documents = this.documents
      .listGroupDocuments(tenantId, groupId)
      // Документ без PDF — это либо задача до ФТ-A1.3, либо DOCX-only выпуск;
      // тянуть его из хранилища нечем, и молча класть DOCX под именем .pdf нельзя.
      .filter((doc) => Boolean(doc.pdfFileId));

    if (documents.length === 0) {
      throw new BadRequestException({
        code: 'group_package_empty',
        message: `No documents ready for group ${groupId}`
      });
    }

    const zip = new AdmZip();
    const used = new Set<string>();
    for (const doc of documents) {
      const body = await this.readPdf(tenantId, doc.pdfFileId!);
      zip.addFile(this.entryName(doc, used), body);
    }
    return zip.toBuffer();
  }

  /**
   * Имя внутри архива — по номеру документа: пачку должно быть можно разобрать
   * без обращения к базе. Совпадения разводим суффиксом, иначе adm-zip молча
   * положит две записи с одинаковым именем.
   */
  private entryName(doc: GeneratedDocumentEntity, used: Set<string>): string {
    const base = (doc.documentNumber ?? doc.id).replace(/[^\w.-]+/gu, '_');
    let name = `${base}.pdf`;
    let counter = 2;
    while (used.has(name)) {
      name = `${base}(${counter}).pdf`;
      counter += 1;
    }
    used.add(name);
    return name;
  }

  private async readPdf(tenantId: string, fileId: string): Promise<Buffer> {
    const meta = await this.files.getReadableFile(tenantId, fileId);
    const stream = await this.storage.getObjectStream({ key: meta.storageKey });
    return streamToBuffer(stream);
  }
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  return Buffer.concat(chunks);
}
