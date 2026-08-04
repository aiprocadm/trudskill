/**
 * Шов биллинга аренды (ФТ-D5.1, Фаза 4 Task 6) — по форме `SmsProvider` (Фаза 3 Task 5)
 * и `WebinarProvider` (`0055`).
 *
 * Решение по открытому вопросу №3: в РФ B2B-аренда живёт на «счёт + акт», поэтому
 * рабочий адаптер — `manual`: счёт печатается нашим движком, оплата отмечается руками
 * платформой. Автосписания ЮKassa — это ВТОРОЙ адаптер поверх этого же шва
 * (`yookassa-payment.provider.ts` уже есть в `payments`), а не переделка модели.
 *
 * **D5.3:** шов сознательно НЕ переиспользует `PaymentProvider` модуля `payments` —
 * там заказы слушателей на обучение: другой плательщик, другой получатель и другие
 * последствия неоплаты. Общий интерфейс склеил бы две несвязанные истории денег.
 */

export type RentalBillingProviderCode = 'noop' | 'manual' | 'yookassa';

export interface RentalInvoiceDraft {
  invoiceId: string;
  tenantId: string;
  tenantName: string;
  number: string;
  periodStart: string;
  periodEnd: string;
  amountKopecks: number;
  currency: string;
  dueAt: string;
  planName?: string | undefined;
}

export interface RentalInvoiceIssueResult {
  /** Идентификатор счёта на стороне провайдера (у `manual` его нет). */
  providerInvoiceId?: string;
  /** Ссылка на оплату — появится у автоплатёжного адаптера; у `manual` оплата офлайн. */
  paymentUrl?: string;
  /** Печатная форма счёта (PDF). У спящего адаптера отсутствует. */
  document?: { fileName: string; contentType: string; content: Buffer };
}

export interface RentalBillingProvider {
  readonly code: RentalBillingProviderCode;
  /**
   * `null` = адаптер спит или не настроен. Никогда не бросает: счёт УЖЕ создан в БД
   * к моменту вызова, и сбой печати не должен отменять обязательство платить.
   */
  issue(draft: RentalInvoiceDraft): Promise<RentalInvoiceIssueResult | null>;
}

export const RENTAL_BILLING_PROVIDER_REGISTRY = Symbol('RENTAL_BILLING_PROVIDER_REGISTRY');

export type RentalBillingProviderRegistry = Map<RentalBillingProviderCode, RentalBillingProvider>;

/** Спящий адаптер: счёт существует в системе, печатной формы нет. */
export class NoopRentalBillingProvider implements RentalBillingProvider {
  readonly code = 'noop' as const;

  async issue(): Promise<RentalInvoiceIssueResult | null> {
    return null;
  }
}
