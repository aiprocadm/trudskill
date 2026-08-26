import { Body, Controller, Delete, Get, Inject, Post, Query, UseGuards } from '@nestjs/common';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

import { MAX_PHOTO_MAX_AGE_HOURS, MIN_PHOTO_MAX_AGE_HOURS } from './identity-policy.js';
import { IdentityPolicyService } from './identity-policy.service.js';
import { assertValidDto } from '../../../common/app-validation.pipe.js';
import { CurrentContext } from '../../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../../common/guards/tenant.guard.js';
import { RequirePermissions } from '../../iam/permission.decorator.js';
import { PermissionGuard } from '../../iam/permission.guard.js';

import type { IdentityPolicyScope } from './identity-policy.js';
import type { RequestContext } from '../../../common/context/request-context.js';

const SCOPES = ['tenant', 'direction', 'course'] as const;

class SaveIdentityPolicyDto {
  @IsIn(SCOPES)
  scope!: IdentityPolicyScope;

  @IsOptional()
  @IsString()
  @MinLength(1)
  scopeId?: string;

  @IsInt()
  @Min(0)
  @Max(3)
  level!: number;

  @IsOptional()
  @IsBoolean()
  requirePhotoBeforeExam?: boolean;

  /**
   * ФТ-C1.2: сколько часов подтверждение с фото считается действительным.
   * Не задано — умолчание 24 часа (ответ владельца от 2026-07-29).
   */
  @IsOptional()
  @IsInt()
  @Min(MIN_PHOTO_MAX_AGE_HOURS)
  @Max(MAX_PHOTO_MAX_AGE_HOURS)
  photoMaxAgeHours?: number;
}

/**
 * Настройка политики идентификации (ФТ-C1, Фаза 3 Task 1).
 *
 * Право `identity.configure` выдано только администрации центра: ослабление политики
 * означает допуск к экзамену без подтверждения личности — это не решение методиста.
 */
@Controller('identity-policies')
@UseGuards(TenantGuard)
export class IdentityPolicyController {
  constructor(@Inject(IdentityPolicyService) private readonly policies: IdentityPolicyService) {}

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermissions('identity.configure')
  async list(@CurrentContext() c: RequestContext) {
    const items = await this.policies.list(c.tenantId!);
    return { items, total: items.length };
  }

  /** Действующая политика для курса — что реально применится к слушателю. */
  @Get('effective')
  @UseGuards(PermissionGuard)
  @RequirePermissions('identity.configure')
  effective(
    @CurrentContext() c: RequestContext,
    @Query('courseId') courseId?: string,
    @Query('directionId') directionId?: string
  ) {
    return this.policies.effectiveForCourse(c.tenantId!, courseId, directionId);
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermissions('identity.configure')
  save(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const body = assertValidDto(SaveIdentityPolicyDto, raw);
    return this.policies.save(c.tenantId!, body, c);
  }

  @Delete()
  @UseGuards(PermissionGuard)
  @RequirePermissions('identity.configure')
  async remove(
    @CurrentContext() c: RequestContext,
    @Query('scope') scope: string,
    @Query('scopeId') scopeId?: string
  ) {
    if (!(SCOPES as readonly string[]).includes(scope)) {
      return { deleted: false };
    }
    return {
      deleted: await this.policies.remove(c.tenantId!, scope as IdentityPolicyScope, scopeId, c)
    };
  }
}
