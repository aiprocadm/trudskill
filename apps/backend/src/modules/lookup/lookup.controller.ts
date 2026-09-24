import { Body, Controller, Get, Inject, Post, Query, UseGuards } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';

import { LookupService } from './lookup.service.js';
import { assertValidDto } from '../../common/app-validation.pipe.js';
import { CurrentContext } from '../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RequirePermissions } from '../iam/permission.decorator.js';
import { PermissionGuard } from '../iam/permission.guard.js';

import type { RequestContext } from '../../common/context/request-context.js';

export class CreatePositionRequest {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;
}

/**
 * Справочники личного дела (МГ-C1.2): должности центра — подсказки и создание; уровни
 * образования и страны — глобальные списки без арендатора (одинаковы для всех центров).
 * Права — те же, что у карточки слушателя: читать — `learners.read`, создавать — `learners.write`.
 */
@Controller('lookup')
@UseGuards(TenantGuard, PermissionGuard)
export class LookupController {
  constructor(@Inject(LookupService) private readonly lookup: LookupService) {}

  @Get('positions')
  @RequirePermissions('learners.read')
  async listPositions(@CurrentContext() c: RequestContext, @Query('q') q?: string) {
    const items = await this.lookup.listPositions(c.tenantId!, q ?? '');
    return { items: items.map((row) => ({ id: row.id, name: row.name })) };
  }

  /** Явное создание должности из дровера (РМ83 — обычно она создаётся сама при сохранении карточки). */
  @Post('positions')
  @RequirePermissions('learners.write')
  async createPosition(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const b = assertValidDto(CreatePositionRequest, raw);
    const { names } = await this.lookup.rememberPositions(c.tenantId!, [b.name], c.userId);
    return { name: names[0] ?? b.name.trim() };
  }

  @Get('education-levels')
  @RequirePermissions('learners.read')
  async listEducationLevels() {
    const items = await this.lookup.listEducationLevels();
    return { items: items.map((row) => ({ code: row.code, name: row.name })) };
  }

  @Get('countries')
  @RequirePermissions('learners.read')
  async listCountries() {
    const items = await this.lookup.listCountries();
    return { items: items.map((row) => ({ code: row.code, name: row.name })) };
  }
}
