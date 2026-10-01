import { Controller, Get, Inject, Query, UseGuards, UseInterceptors } from '@nestjs/common';

import { CalendarEventsQuery } from './calendar.request-dto.js';
import { CalendarService } from './calendar.service.js';
import { assertValidDto } from '../../common/app-validation.pipe.js';
import { CurrentContext } from '../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RequirePermissions } from '../iam/permission.decorator.js';
import { PermissionGuard } from '../iam/permission.guard.js';
import { MvpRequestPersistenceInterceptor } from '../mvp/infrastructure/mvp-request-persistence.interceptor.js';

import type { RequestContext } from '../../common/context/request-context.js';

/** ТЗ перехода §16: календарь центра (0120, РМ21 — право заводится вместе с ручкой). */
@Controller('calendar')
@UseInterceptors(MvpRequestPersistenceInterceptor)
@UseGuards(TenantGuard)
export class CalendarController {
  constructor(@Inject(CalendarService) private readonly calendar: CalendarService) {}

  @Get('events')
  @UseGuards(PermissionGuard)
  @RequirePermissions('calendar.read')
  events(@CurrentContext() c: RequestContext, @Query() raw: unknown) {
    const query = assertValidDto(CalendarEventsQuery, raw);
    return this.calendar.events(c.tenantId!, c, {
      from: query.from,
      to: query.to,
      ...(query.types ? { types: query.types } : {}),
      ...(query.mine !== undefined ? { mine: query.mine } : {}),
      ...(query.groupStatus ? { groupStatus: query.groupStatus } : {}),
      ...(query.counterpartyId ? { counterpartyId: query.counterpartyId } : {}),
      ...(query.directionId ? { directionId: query.directionId } : {}),
      ...(query.q ? { q: query.q } : {})
    });
  }
}
