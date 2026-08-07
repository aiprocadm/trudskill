import { Body, Controller, Inject, Param, Post, UseGuards, UseInterceptors } from '@nestjs/common';

import { CloseGroupChainService } from './close-group-chain.service.js';
import { MvpRequestPersistenceInterceptor } from './infrastructure/mvp-request-persistence.interceptor.js';
import { CloseGroupChainRequest } from './mvp.dto.js';
import { assertValidDto } from '../../common/app-validation.pipe.js';
import { CurrentContext } from '../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RequirePermissions } from '../iam/permission.decorator.js';
import { PermissionGuard } from '../iam/permission.guard.js';

import type { RequestContext } from '../../common/context/request-context.js';

/**
 * ФТ-E3 (Фаза 5 Task 7): цепочка «экзамен → протокол → документы → строки реестра».
 *
 * Отдельный контроллер, а не метод в `MvpController`: цепочке нужен
 * `CloseGroupChainService` (mvp + documents + ot-registry), и вешать эту зависимость
 * на общий контроллер значило бы тащить её во все его тесты-сборки.
 *
 * Права: цепочка ВЫПУСКАЕТ документы и СОЗДАЁТ выгрузку в реестр — требуются оба
 * права сразу; одного `documents.generate` (как у «закрыть группу») мало.
 */
@Controller()
@UseInterceptors(MvpRequestPersistenceInterceptor)
@UseGuards(TenantGuard)
export class CloseGroupChainController {
  constructor(
    @Inject(CloseGroupChainService)
    private readonly chain: CloseGroupChainService
  ) {}

  @Post('groups/:groupId/close-chain')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.generate', 'regulatory.export.write')
  async closeChain(
    @CurrentContext() c: RequestContext,
    @Param('groupId') groupId: string,
    @Body() raw: unknown
  ) {
    const b = assertValidDto(CloseGroupChainRequest, raw);
    return this.chain.runChain(c.tenantId!, c.userId, { ...b, groupId }, c);
  }
}
