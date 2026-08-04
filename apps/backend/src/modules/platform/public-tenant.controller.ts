import { Controller, Get, Inject, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

import { PlatformTenantsService } from './platform-tenants.service.js';

/**
 * ФТ-D3.2 (Фаза 4 Task 8): публичный резолв арендатора по КОДУ из поддомена.
 *
 * Зачем нужен: из адреса `demo.lms.example.ru` приходит код `demo`, а вход и все
 * защищённые ручки ждут ИДЕНТИФИКАТОР (`tenant_demo`). Без этого сопоставления
 * определение арендатора по адресу оставалось бы украшением.
 *
 * Роут публичный по необходимости: он нужен ДО входа, на странице логина. Раскрытия
 * здесь нет — существование поддомена и так публично, а отдаём мы только то, что и так
 * написано на странице входа: идентификатор, код, название и статус.
 *
 * **Архивный арендатор — 404, а не «archived»:** офбординг означает, что центра больше
 * нет; сообщать «он был здесь» посторонним незачем. Приостановленный отдаётся со своим
 * статусом — его слушателям нужна причина, почему кабинет не пускает.
 *
 * Rate-limit обязателен (ФТ-G2): по коду можно перебирать арендаторов. `@Throttle` без
 * `@UseGuards(ThrottlerGuard)` НЕ применяется — глобального guard в приложении нет.
 */
@Controller('public')
export class PublicTenantController {
  constructor(@Inject(PlatformTenantsService) private readonly service: PlatformTenantsService) {}

  @Get('tenants/by-code/:code')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async byCode(@Param('code') code: string) {
    const tenant = await this.service.findPublicByCode(code);
    if (!tenant) {
      throw new NotFoundException({
        code: 'tenant_not_found',
        message: 'Учебный центр по этому адресу не найден'
      });
    }
    return tenant;
  }
}
