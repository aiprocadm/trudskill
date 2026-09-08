import { Controller, Delete, Get, Inject, UseGuards } from '@nestjs/common';

import { CurrentContext } from '../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { backendEnv } from '../../env.js';
import { signTelegramLink } from '../../infrastructure/telegram/telegram-link-token.js';
import { TELEGRAM_WEBHOOK_SECRET } from '../../infrastructure/telegram/telegram.provider.js';
import { TELEGRAM_LINKS_REPOSITORY } from '../communication/telegram/telegram-links.repository.js';

import type { RequestContext } from '../../common/context/request-context.js';
import type { TelegramLinksRepository } from '../communication/telegram/telegram-links.repository.js';

/** Сколько живёт ссылка привязки. Пятнадцати минут хватает открыть её на телефоне. */
const LINK_TTL_SECONDS = 15 * 60;

/**
 * `ФТ-F3` — привязка Telegram из личного кабинета.
 *
 * Ручка выдаёт ССЫЛКУ, а не код: код пришлось бы переписывать руками с экрана в телефон, и
 * на этом шаге теряется половина людей. Ссылка открывается одним касанием, а бот получает
 * подписанный токен первым же сообщением.
 *
 * Права не требуются сверх входа: человек привязывает СВОЙ чат к СВОЕЙ учётной записи —
 * идентификатор берётся из сессии, а не из запроса, поэтому привязать чужой аккаунт нечем.
 */
@Controller()
@UseGuards(TenantGuard)
export class TelegramLinkController {
  constructor(
    @Inject(TELEGRAM_LINKS_REPOSITORY) private readonly links: TelegramLinksRepository,
    @Inject(TELEGRAM_WEBHOOK_SECRET) private readonly secret: string
  ) {}

  @Get('me/telegram')
  async status(@CurrentContext() c: RequestContext) {
    const link = await this.links.findByUser(c.tenantId!, c.userId!);
    const enabled = Boolean(this.secret && backendEnv.TELEGRAM_BOT_USERNAME);
    if (!enabled) {
      /* Бот не настроен в этом развёртывании — экран покажет это словами, а не пустотой. */
      return { enabled: false as const, linked: false as const };
    }
    const token = signTelegramLink(
      { tenantId: c.tenantId!, userId: c.userId! },
      this.secret,
      LINK_TTL_SECONDS,
      Date.now()
    );
    return {
      enabled: true as const,
      linked: link !== null,
      linkedAt: link?.linkedAt ?? null,
      linkUrl: `https://t.me/${backendEnv.TELEGRAM_BOT_USERNAME}?start=${token}`
    };
  }

  @Delete('me/telegram')
  async unlink(@CurrentContext() c: RequestContext) {
    /* Канал второй: отказаться от него можно в любой момент и без объяснений. */
    await this.links.unlink(c.tenantId!, c.userId!);
    return { linked: false as const };
  }
}
