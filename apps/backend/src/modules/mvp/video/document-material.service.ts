import { Inject, Injectable, PreconditionFailedException } from '@nestjs/common';

import { VideoAccessService } from './video-access.service.js';
import { FilesService } from '../../files/files.service.js';
import { MvpService } from '../mvp.service.js';

import type { RequestContext } from '../../../common/context/request-context.js';
import type { UpdateMaterialProgressRequest } from '../mvp.dto.js';

/**
 * Документы урока: просмотр и фиксация открытия (ФТ-B4.1, Фаза 2 Task 9).
 *
 * Две вещи, которых не было:
 *   1. **Файл вообще не отдавался** — `PdfViewer` всегда получал `pdfUrl={null}`, ровно
 *      как видео до Task 4. Смотреть было нечего.
 *   2. **Открытие не фиксировалось.** Для документа «ознакомлен» не должно зависеть от
 *      того, докрутил ли слушатель до последней страницы: во встроенном вьювере это
 *      технически не отследить, а требование ТЗ — зафиксировать факт открытия.
 *
 * Доступ проверяется той же цепочкой, что у видео (`VideoAccessService`): ссылку на
 * материал получает только слушатель с зачислением на курс, где этот материал лежит.
 */

/** Ссылка на документ живёт столько же, сколько ссылка на видео. */
export const DOCUMENT_URL_TTL_SECONDS = 600;

/** Типы материалов, которые открываются как документ. */
const DOCUMENT_TYPES = ['file'] as const;

export interface DocumentMaterialView {
  url: string;
  expiresInSeconds: number;
  /** Засчитан ли материал открытием (см. правило про `minViewSeconds`). */
  completedByOpening: boolean;
}

@Injectable()
export class DocumentMaterialService {
  constructor(
    @Inject(VideoAccessService) private readonly access: VideoAccessService,
    @Inject(FilesService) private readonly files: FilesService,
    @Inject(MvpService) private readonly mvp: MvpService
  ) {}

  async open(
    tenantId: string,
    actorId: string | undefined,
    materialId: string,
    enrollmentId: string,
    ctx: RequestContext
  ): Promise<DocumentMaterialView> {
    const { material } = this.access.assertLearnerMayWatch(
      tenantId,
      actorId,
      materialId,
      enrollmentId,
      ctx,
      DOCUMENT_TYPES
    );
    if (!material.fileId) {
      throw new PreconditionFailedException({
        code: 'domain_rule_violation',
        message: 'К этому материалу не приложен файл'
      });
    }

    const url = await this.files.createDownloadUrl(tenantId, material.fileId);

    /*
     * Правило зачёта. Если методист не задал минимальное время (обычный случай для
     * документа), открытие И ЕСТЬ ознакомление — засчитываем. Если время задано явно,
     * методист хотел именно выдержку по времени: открытие фиксируем, но материал не
     * закрываем — иначе мы бы молча отменили его настройку.
     */
    const completedByOpening = material.minViewSeconds <= 0;
    this.mvp.upsertMaterialProgress(
      tenantId,
      actorId,
      materialId,
      {
        enrollmentId,
        studiedSeconds: completedByOpening ? 0 : 1
      } as UpdateMaterialProgressRequest,
      ctx
    );

    return { url, expiresInSeconds: DOCUMENT_URL_TTL_SECONDS, completedByOpening };
  }
}
