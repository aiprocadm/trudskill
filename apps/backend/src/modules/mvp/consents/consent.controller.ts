import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  UseGuards
} from '@nestjs/common';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

import { type ConsentKind, isConsentKind } from './consent.js';
import { ConsentService } from './consent.service.js';
import { assertValidDto } from '../../../common/app-validation.pipe.js';
import { CurrentContext } from '../../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../../common/guards/tenant.guard.js';
import { RequirePermissions } from '../../iam/permission.decorator.js';
import { PermissionGuard } from '../../iam/permission.guard.js';
import { MvpService } from '../mvp.service.js';

import type { RequestContext } from '../../../common/context/request-context.js';

class SaveConsentDocumentDto {
  @IsString()
  @MinLength(20)
  body!: string;
}

/** МГ-C5.1 (срез 12.1): бумажное согласие — дата подписи и скан из личного дела. */
class MarkPaperConsentDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  signedAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  fileId?: string;
}

/**
 * Раздельные согласия на ПДн и на фото (ФТ-C3.2, Фаза 3 Task 6).
 *
 * Чтение текстов и работа со СВОИМ согласием доступны любому авторизованному
 * пользователю тенанта: согласие даёт сам слушатель, требовать для этого отдельного
 * права бессмысленно. Правка текстов — только под `consent.configure` (администрация).
 */
@Controller('consents')
@UseGuards(TenantGuard)
export class ConsentController {
  constructor(
    @Inject(ConsentService) private readonly consents: ConsentService,
    @Inject(MvpService) private readonly mvpService: MvpService
  ) {}

  private assertKind(kind: string): ConsentKind {
    if (!isConsentKind(kind)) {
      throw new BadRequestException({
        code: 'validation_error',
        message: 'Неизвестный вид согласия'
      });
    }
    return kind;
  }

  /** Тексты действующих согласий — то, что слушатель видит перед галочками. */
  @Get('documents')
  documents(@CurrentContext() c: RequestContext) {
    return this.consents.listDocuments(c.tenantId!);
  }

  @Post('documents/:kind')
  @UseGuards(PermissionGuard)
  @RequirePermissions('consent.configure')
  saveDocument(
    @CurrentContext() c: RequestContext,
    @Param('kind') kind: string,
    @Body() raw: unknown
  ) {
    const body = assertValidDto(SaveConsentDocumentDto, raw);
    return this.consents.saveDocument(c.tenantId!, this.assertKind(kind), body.body, c);
  }

  /** Состояние обоих согласий текущего слушателя. */
  @Get('me')
  me(@CurrentContext() c: RequestContext) {
    const learner = this.mvpService.getLinkedLearnerForUser(c.tenantId!, c.userId ?? '');
    return this.consents.getStatus(c.tenantId!, learner.id);
  }

  @Post('me/:kind/grant')
  grant(@CurrentContext() c: RequestContext, @Param('kind') kind: string) {
    const learner = this.mvpService.getLinkedLearnerForUser(c.tenantId!, c.userId ?? '');
    return this.consents.grant(c.tenantId!, learner.id, this.assertKind(kind), c);
  }

  /**
   * Отзыв СВОЕГО согласия. Отдельный вид отзывается независимо: отказ от фото не
   * отзывает согласие на обработку данных.
   */
  @Post('me/:kind/revoke')
  revoke(@CurrentContext() c: RequestContext, @Param('kind') kind: string) {
    const learner = this.mvpService.getLinkedLearnerForUser(c.tenantId!, c.userId ?? '');
    return this.consents.revoke(c.tenantId!, learner.id, this.assertKind(kind), c);
  }

  /** Состояние согласий конкретного слушателя — для очереди модерации и личного дела. */
  @Get('learners/:learnerId')
  @UseGuards(PermissionGuard)
  @RequirePermissions('identity.read')
  forLearner(@CurrentContext() c: RequestContext, @Param('learnerId') learnerId: string) {
    return this.consents.getStatus(c.tenantId!, learnerId);
  }

  /** МГ-C5.1 (срез 12.1, РМ110): то же состояние для карточки слушателя — под правом карточки. */
  @Get('learners/:learnerId/status')
  @UseGuards(PermissionGuard)
  @RequirePermissions('learners.read')
  statusForCard(@CurrentContext() c: RequestContext, @Param('learnerId') learnerId: string) {
    return this.consents.getStatus(c.tenantId!, learnerId);
  }

  /** Бумажное согласие получено — отмечает сотрудник, который ведёт слушателей (РМ109). */
  @Post('learners/:learnerId/:kind/paper')
  @UseGuards(PermissionGuard)
  @RequirePermissions('learners.write')
  markPaper(
    @CurrentContext() c: RequestContext,
    @Param('learnerId') learnerId: string,
    @Param('kind') kind: string,
    @Body() raw: unknown
  ) {
    const b = assertValidDto(MarkPaperConsentDto, raw);
    return this.consents.markPaper(c.tenantId!, learnerId, this.assertKind(kind), b, c);
  }
}
