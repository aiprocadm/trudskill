import { Body, Controller, Get, Inject, Post, UseGuards } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';

import { SimpleSignatureService } from './simple-signature.service.js';
import { assertValidDto } from '../../../common/app-validation.pipe.js';
import { CurrentContext } from '../../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../../common/guards/tenant.guard.js';
import { RequirePermissions } from '../../iam/permission.decorator.js';
import { PermissionGuard } from '../../iam/permission.guard.js';

import type { RequestContext } from '../../../common/context/request-context.js';

class SaveAgreementDto {
  @IsString()
  @MinLength(20)
  body!: string;
}

/**
 * Соглашение об электронном взаимодействии (ФТ-C1.1, Фаза 3 Task 3).
 *
 * Чтение и принятие доступны любому авторизованному пользователю тенанта: соглашение
 * подписывает сам слушатель, и требовать для этого отдельного права бессмысленно.
 * Правка текста — только под `esignature.configure` (администрация центра).
 */
@Controller('esignature')
@UseGuards(TenantGuard)
export class SimpleSignatureController {
  constructor(
    @Inject(SimpleSignatureService) private readonly signatures: SimpleSignatureService
  ) {}

  /** Текст действующего соглашения — то, что показывается на экране принятия. */
  @Get('agreement')
  async agreement(@CurrentContext() c: RequestContext) {
    const agreement = await this.signatures.getAgreement(c.tenantId!);
    return agreement ?? { body: null, version: null };
  }

  /** Нужно ли показать экран принятия этому пользователю. */
  @Get('status')
  status(@CurrentContext() c: RequestContext) {
    return this.signatures.getStatus(c.tenantId!, c.userId ?? '');
  }

  @Post('accept')
  accept(@CurrentContext() c: RequestContext) {
    return this.signatures.accept(c.tenantId!, c.userId ?? '', c);
  }

  @Post('agreement')
  @UseGuards(PermissionGuard)
  @RequirePermissions('esignature.configure')
  save(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const body = assertValidDto(SaveAgreementDto, raw);
    return this.signatures.saveAgreement(c.tenantId!, body.body);
  }
}
