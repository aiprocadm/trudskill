import { YookassaPaymentProvider } from '../payments/yookassa-payment.provider.js';

import type {
  RentalBillingProvider,
  RentalInvoiceDraft,
  RentalInvoiceIssueResult
} from './rental-billing.provider.js';
import type { YookassaConfig } from '../payments/yookassa-payment.provider.js';

/**
 * `ФТ-D5.2` — автоплатёж картой за аренду: ВТОРОЙ адаптер поверх того же шва.
 *
 * Что меняется для человека. При `manual` платформа печатает счёт, отправляет его почтой и
 * ждёт платёжку; отметку «оплачено» ставит сотрудник платформы руками — а значит, между
 * приходом денег и снятием приостановки стоит человек, который может быть в отпуске. Здесь
 * счёт сразу получает ссылку на оплату картой, а отметка приходит уведомлением банка.
 *
 * **Почему обёртка вокруг адаптера платежей, а не свой HTTP-клиент.** Интерфейсы двух
 * историй денег разделены сознательно (`D5.3`): аренда — это платформа берёт с учебного
 * центра, а `payments` — центр берёт со слушателя; общий интерфейс склеил бы их. Но
 * ТРАНСПОРТ у них один: тот же банк, та же авторизация, та же ключевая мера безопасности —
 * уведомление не принимается на веру, а перепроверяется запросом к API. Написать это второй
 * раз значило бы завести второе место, где можно ошибиться в проверке подлинности денег.
 *
 * **Свой магазин, а не магазин центра.** Реквизиты берутся из `RENTAL_YOOKASSA_*`: платит
 * учебный центр платформе, и деньги идут на счёт платформы. Взять сюда ключи магазина
 * центра значило бы, что центр платит сам себе.
 */
export class YookassaRentalBillingProvider implements RentalBillingProvider {
  readonly code = 'yookassa' as const;

  private readonly payments: YookassaPaymentProvider;

  constructor(cfg: YookassaConfig, fetchImpl: typeof fetch = globalThis.fetch) {
    this.payments = new YookassaPaymentProvider(cfg, fetchImpl);
  }

  /**
   * Счёт УЖЕ создан в базе к моменту вызова, поэтому здесь нельзя бросать: недоступный банк
   * не должен отменять обязательство платить. Отказ возвращается как `null` — счёт остаётся,
   * просто без ссылки на оплату, и его всегда можно оплатить по реквизитам.
   */
  async issue(draft: RentalInvoiceDraft): Promise<RentalInvoiceIssueResult | null> {
    try {
      const payment = await this.payments.createPayment({
        /*
         * Идентификатор счёта идёт ключом идемпотентности: повторная выдача того же счёта
         * (перезапуск планировщика, повтор запроса) не создаст второй платёж в банке.
         */
        orderId: draft.invoiceId,
        tenantId: draft.tenantId,
        amount: draft.amountKopecks,
        currency: draft.currency,
        description: `Аренда СДО, счёт ${draft.number} за ${draft.periodStart}—${draft.periodEnd}`
      });
      return {
        providerInvoiceId: payment.providerPaymentId,
        ...(payment.confirmationUrl ? { paymentUrl: payment.confirmationUrl } : {})
      };
    } catch {
      // Банк недоступен — счёт уже создан, и отменять обязательство платить нельзя (см. выше).
      return null;
    }
  }

  /**
   * Разбор уведомления банка: какой счёт оплачен.
   *
   * Возвращает идентификатор платежа В БАНКЕ, а не наш: по нему счёт и находится
   * (`provider_invoice_id`). Тело уведомления на веру не принимается — под капотом идёт
   * повторный запрос к API за настоящим состоянием платежа.
   */
  async parsePaidNotification(
    raw: Buffer,
    headers: Record<string, string | undefined>
  ): Promise<{ providerInvoiceId: string } | null> {
    const event = await this.payments.parseWebhook(raw, headers);
    if (!event || event.status !== 'succeeded') return null;
    return { providerInvoiceId: event.providerPaymentId };
  }
}
