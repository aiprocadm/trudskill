import { Body, Controller, Delete, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MinLength,
  ValidateNested
} from 'class-validator';

import { VideoService } from './video.service.js';
import { assertValidDto } from '../../../common/app-validation.pipe.js';
import { CurrentContext } from '../../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../../common/guards/tenant.guard.js';
import { RequirePermissions } from '../../iam/permission.decorator.js';
import { PermissionGuard } from '../../iam/permission.guard.js';

import type { RequestContext } from '../../../common/context/request-context.js';

class CreateVideoAssetDto {
  @IsString()
  @MinLength(1)
  fileName!: string;

  @IsInt()
  @IsPositive()
  sizeBytes!: number;

  @IsString()
  @MinLength(1)
  contentType!: string;
}

class PartUrlDto {
  @IsInt()
  @IsPositive()
  partNumber!: number;
}

class UploadedPartDto {
  @IsInt()
  @IsPositive()
  partNumber!: number;

  @IsString()
  @MinLength(1)
  etag!: string;
}

class CompleteUploadDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UploadedPartDto)
  parts?: UploadedPartDto[];
}

class AttachMaterialDto {
  @IsString()
  @MinLength(1)
  materialId!: string;
}

class FailAssetDto {
  @IsString()
  @MinLength(1)
  message!: string;
}

/**
 * Загрузка видео методистом (ФТ-B1.1, Фаза 2 Task 2).
 *
 * `video.write` — загрузка и управление, `video.read` — только чтение статуса
 * (права заведены миграцией `0063`; слушателю выдан лишь `read`).
 */
@Controller('video-assets')
@UseGuards(TenantGuard)
export class VideoController {
  constructor(@Inject(VideoService) private readonly video: VideoService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermissions('video.write')
  create(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const body = assertValidDto(CreateVideoAssetDto, raw);
    return this.video.createAsset(c.tenantId!, body);
  }

  @Post(':id/part-url')
  @UseGuards(PermissionGuard)
  @RequirePermissions('video.write')
  partUrl(@CurrentContext() c: RequestContext, @Param('id') id: string, @Body() raw: unknown) {
    const body = assertValidDto(PartUrlDto, raw);
    return this.video.createPartUrl(c.tenantId!, id, body.partNumber);
  }

  @Post(':id/complete')
  @UseGuards(PermissionGuard)
  @RequirePermissions('video.write')
  complete(@CurrentContext() c: RequestContext, @Param('id') id: string, @Body() raw: unknown) {
    const body = assertValidDto(CompleteUploadDto, raw);
    return this.video.completeUpload(c.tenantId!, id, body.parts ?? []);
  }

  @Post(':id/attach')
  @UseGuards(PermissionGuard)
  @RequirePermissions('video.write')
  attach(@CurrentContext() c: RequestContext, @Param('id') id: string, @Body() raw: unknown) {
    const body = assertValidDto(AttachMaterialDto, raw);
    return this.video.attachToMaterial(c.tenantId!, id, body.materialId);
  }

  /** Отметить обработку неудавшейся — до Task 10 этим пользуются dev и тесты. */
  @Post(':id/fail')
  @UseGuards(PermissionGuard)
  @RequirePermissions('video.write')
  fail(@CurrentContext() c: RequestContext, @Param('id') id: string, @Body() raw: unknown) {
    const body = assertValidDto(FailAssetDto, raw);
    return this.video.markFailed(c.tenantId!, id, body.message);
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermissions('video.read')
  list(@CurrentContext() c: RequestContext, @Query('materialId') materialId?: string) {
    if (!materialId) return { items: [] };
    return this.video
      .listByMaterial(c.tenantId!, materialId)
      .then((items) => ({ items, total: items.length }));
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('video.read')
  get(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.video.getAsset(c.tenantId!, id);
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('video.write')
  async remove(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    await this.video.deleteAsset(c.tenantId!, id);
    return { deleted: true };
  }
}
