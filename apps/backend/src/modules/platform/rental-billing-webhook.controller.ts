import { Controller, Headers, Inject, Logger, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

import { RentalBillingService } from './rental-billing.service.js';
import {
  RENTAL_BILLING_PROVIDER_REGISTRY,
  type RentalBillingProviderRegistry
} from '../../infrastructure/rental-billing/rental-billing.provider.js';

import type { RequestContext } from '../../common/context/request-context.js';
import type { Request, Response } from 'express';

/**
 * `ФТ-D5.2` — уведомление банка об оплате аренды.
 *
 * Ручка ПУБЛИЧНАЯ: банк не присылает ни токена, ни арендатора. Подлинность проверяет сам
 * адаптер — он не верит телу запроса, а переспрашивает у банка настоящее состояние платежа.
 *
 * Отдельная ручка, а не общая с оплатой обучения (`/payments/webhook/:code`) — по `D5.3`: там
 * слушатель платит учебному центру, здесь центр платит платформе. Разные плательщики, разные
 * получатели, разные последствия неоплаты; одна ручка на двоих означала бы, что ошибка в
 * поиске «чей это платёж» переносит деньги между несвязанными историями.
 *
 * Ответ пишется в поток напрямую (`@Res`), минуя общий конверт `{ data, meta }`: банк ждёт
 * короткого подтверждения и на незнакомый формат отвечает бесконечными повторами.
 */
@Controller('platform')
export class RentalBillingWebhookController {
  private readonly logger = new Logger(RentalBillingWebhookController.name);

  constructor(
    @Inject(RentalBillingService) private readonly billing: RentalBillingService,
    @Inject(RENTAL_BILLING_PROVIDER_REGISTRY)
    private readonly providers: RentalBillingProviderRegistry
  ) {}

  @Post('rental-billing/webhook')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async handle(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers() headers: Record<string, string>,
    @Res() res: Response
  ): Promise<void> {
    const ack = () => res.status(200).json({ ok: true });
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));

    for (const provider of this.providers.values()) {
      if (!provider.parsePaidNotification) continue;
      const event = await provider.parsePaidNotification(raw, headers);
      if (!event) continue;

      const context = {
        requestId: `rental-webhook-${Date.now()}`,
        correlationId: event.providerInvoiceId
      } as RequestContext;
      const invoice = await this.billing.markPaidByProviderPayment(
        event.providerInvoiceId,
        context
      );
      if (!invoice) {
        /*
         * Платёж не наш или счёт удалён. Отвечаем «принято» — иначе банк будет слать это
         * вечно, — но пишем в журнал: молчание здесь означало бы, что оплаты перестали
         * подтверждаться, а узнать об этом неоткуда.
         */
        this.logger.warn(
          `rental.webhook ignored: платёж ${event.providerInvoiceId} не найден среди счетов аренды`
        );
      }
      ack();
      return;
    }

    /* Ни один адаптер не признал уведомление своим: чужой запрос или сменившийся формат. */
    this.logger.warn('rental.webhook ignored: уведомление не разобрал ни один адаптер');
    ack();
  }
}
