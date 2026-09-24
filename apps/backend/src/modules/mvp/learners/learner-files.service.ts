import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { LEARNER_FILE_MIME_ALLOWLIST } from './learner-files-settings.js';
import { LearnerFilesSettingsService } from './learner-files-settings.service.js';
import {
  LEARNER_FILES_REPOSITORY,
  type LearnerFileRow,
  type LearnerFilesRepository
} from './learner-files.repository.js';
import { AuditService } from '../../audit/audit.service.js';
import {
  FilesService,
  type UploadIntent,
  type UploadIntentInput
} from '../../files/files.service.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import { MVP_STATE } from '../infrastructure/mvp-state.token.js';

import type { RequestContext } from '../../../common/context/request-context.js';

export interface LearnerFilesList {
  items: LearnerFileRow[];
  /** Предел центра — карточка показывает «3 из 10» и объясняет, когда добавить нельзя. */
  limit: number;
}

/**
 * Файлы личного дела слушателя (ТЗ перехода §6.4 МГ-C2.1; срез 9.2, РМ94–РМ96): согласия и
 * сканы до N файлов на слушателя. Загрузка — как у всех файлов платформы: подписанная ссылка
 * на прямую отправку в хранилище, затем «прикрепить» по идентификатору; скачивание идёт через
 * антивирусный гейт `FilesService` (непроверенный или заражённый файл не отдаётся).
 */
@Injectable()
export class LearnerFilesService {
  private readonly logger = new Logger(LearnerFilesService.name);

  constructor(
    @Inject(MVP_STATE) private readonly state: InMemoryMvpState,
    @Inject(LEARNER_FILES_REPOSITORY) private readonly repo: LearnerFilesRepository,
    @Inject(FilesService) private readonly files: FilesService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(LearnerFilesSettingsService) private readonly settings: LearnerFilesSettingsService
  ) {}

  private assertLearner(tenantId: string, learnerId: string): void {
    const learner = this.state.learners.find((l) => l.tenantId === tenantId && l.id === learnerId);
    if (!learner) {
      throw new NotFoundException({ code: 'learner_not_found', message: 'Слушатель не найден' });
    }
  }

  private async assertBelowLimit(tenantId: string, learnerId: string): Promise<void> {
    const { maxCount } = await this.settings.forTenant(tenantId);
    const current = await this.repo.list(tenantId, learnerId);
    if (current.length >= maxCount) {
      throw new BadRequestException({
        code: 'learner_files_limit_reached',
        message: `Файлов у слушателя не больше ${maxCount}. Удалите ненужный файл, чтобы добавить новый.`
      });
    }
  }

  async list(tenantId: string, learnerId: string): Promise<LearnerFilesList> {
    this.assertLearner(tenantId, learnerId);
    const [{ maxCount }, items] = await Promise.all([
      this.settings.forTenant(tenantId),
      this.repo.list(tenantId, learnerId)
    ]);
    return { items, limit: maxCount };
  }

  /** Шаг 1 загрузки: подписанная ссылка. Лимит проверяется здесь, чтобы отказ пришёл до отправки байтов. */
  async createUploadIntent(
    tenantId: string,
    learnerId: string,
    input: UploadIntentInput
  ): Promise<UploadIntent> {
    this.assertLearner(tenantId, learnerId);
    await this.assertBelowLimit(tenantId, learnerId);
    const { maxBytes } = await this.settings.forTenant(tenantId);
    return this.files.createUploadIntent(tenantId, input, {
      keyPrefix: 'learner-files',
      mimeAllowlist: LEARNER_FILE_MIME_ALLOWLIST,
      maxBytes
    });
  }

  /** Шаг 2: файл загружен — привязываем к слушателю и отправляем на проверку антивирусом. */
  async attach(
    tenantId: string,
    learnerId: string,
    fileId: string,
    actorId: string | undefined,
    ctx: RequestContext
  ): Promise<LearnerFileRow> {
    this.assertLearner(tenantId, learnerId);
    const status = await this.files.getAntivirusStatus(tenantId, fileId);
    if (status === null) {
      throw new NotFoundException({ code: 'file_not_found', message: 'Файл не найден' });
    }
    await this.assertBelowLimit(tenantId, learnerId);
    await this.repo.attach(tenantId, learnerId, fileId);
    /* Проверка идёт в фоне; до вердикта скачать файл всё равно нельзя — гейт `FilesService`. */
    void this.files.scanFile(tenantId, fileId, actorId).catch((error: unknown) => {
      this.logger.warn(`Antivirus scan failed tenant=${tenantId} file=${fileId}: ${String(error)}`);
    });
    this.audit.write({
      tenantId,
      ...(actorId ? { actorId } : {}),
      action: 'learning.learner_file_attached',
      entityType: 'learning.learner',
      entityId: learnerId,
      newValues: { fileId },
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });
    const row = await this.repo.get(tenantId, learnerId, fileId);
    if (!row) {
      throw new NotFoundException({ code: 'file_not_found', message: 'Файл не найден' });
    }
    return row;
  }

  async downloadUrl(tenantId: string, learnerId: string, fileId: string): Promise<{ url: string }> {
    this.assertLearner(tenantId, learnerId);
    const row = await this.repo.get(tenantId, learnerId, fileId);
    if (!row) {
      throw new NotFoundException({ code: 'file_not_found', message: 'Файл не найден' });
    }
    return { url: await this.files.createDownloadUrl(tenantId, fileId) };
  }

  async remove(
    tenantId: string,
    learnerId: string,
    fileId: string,
    actorId: string | undefined,
    ctx: RequestContext
  ): Promise<void> {
    this.assertLearner(tenantId, learnerId);
    const row = await this.repo.get(tenantId, learnerId, fileId);
    if (!row) {
      throw new NotFoundException({ code: 'file_not_found', message: 'Файл не найден' });
    }
    await this.repo.detach(tenantId, learnerId, fileId);
    await this.files.deleteFile(tenantId, fileId, actorId);
    this.audit.write({
      tenantId,
      ...(actorId ? { actorId } : {}),
      action: 'learning.learner_file_removed',
      entityType: 'learning.learner',
      entityId: learnerId,
      oldValues: { fileId },
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });
  }
}
