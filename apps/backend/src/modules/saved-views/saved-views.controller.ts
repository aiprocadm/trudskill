import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards
} from '@nestjs/common';
import { IsArray, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { SavedViewsService } from './saved-views.service.js';
import { assertValidDto } from '../../common/app-validation.pipe.js';
import { CurrentContext } from '../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RequirePermissions } from '../iam/permission.decorator.js';
import { PermissionGuard } from '../iam/permission.guard.js';

import type { RequestContext } from '../../common/context/request-context.js';

export class CreateSavedViewRequest {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  entity!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsObject()
  filters!: Record<string, string>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  columns?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  sort?: string;
}

/**
 * Сохранённые представления реестров (МГ-H4.1, срез 11.3, РМ106–РМ108). Своё представление —
 * любому сотруднику, который видит центр (`tenant.read`); общее для всего центра — тому, кто
 * вправе менять его настройки (`tenant.settings.write`).
 */
@Controller('saved-views')
@UseGuards(TenantGuard, PermissionGuard)
export class SavedViewsController {
  constructor(@Inject(SavedViewsService) private readonly views: SavedViewsService) {}

  @Get()
  @RequirePermissions('tenant.read')
  list(@CurrentContext() c: RequestContext, @Query('entity') entity?: string) {
    return this.views.list(c.tenantId!, (entity ?? '').trim(), c.userId ?? '');
  }

  @Post()
  @RequirePermissions('tenant.read')
  createOwn(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const b = assertValidDto(CreateSavedViewRequest, raw);
    return this.views.create(c.tenantId!, c.userId ?? '', b, 'private', c);
  }

  /** Общее представление центра — видят все сотрудники; заводит администратор настроек. */
  @Post('shared')
  @RequirePermissions('tenant.settings.write')
  createShared(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const b = assertValidDto(CreateSavedViewRequest, raw);
    return this.views.create(c.tenantId!, c.userId ?? '', b, 'tenant', c);
  }

  @Delete(':id')
  @RequirePermissions('tenant.read')
  async remove(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    await this.views.remove(c.tenantId!, c.userId ?? '', id, false, c);
    return { removed: true };
  }

  /** Удалить общее представление — тем же правом, что оно заводится. */
  @Delete('shared/:id')
  @RequirePermissions('tenant.settings.write')
  async removeShared(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    await this.views.remove(c.tenantId!, c.userId ?? '', id, true, c);
    return { removed: true };
  }
}
