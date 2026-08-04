import { convertHtmlToPdf } from '@trudskill/docx-render';

import type {
  RentalBillingProvider,
  RentalInvoiceDraft,
  RentalInvoiceIssueResult
} from './rental-billing.provider.js';

/**
 * ФТ-D5.1: адаптер «счёт + акт» — рабочий по умолчанию (решение по вопросу №3).
 *
 * Печать идёт нашим движком: HTML → Gotenberg → PDF (тот же конвертер, что у личного
 * дела слушателя, §5.213). Бланк владельца НЕ нужен — счёт собирается из данных, а не
 * из загруженного шаблона: у счёта нет регулируемой формы, в отличие от удостоверения.
 *
 * Ошибка печати НЕ бросается наружу: счёт уже создан в БД и обязательство платить
 * существует независимо от того, удалось ли сформировать PDF (перевыпустить печатную
 * форму можно повторным запросом).
 */

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

/**
 * Копейки → «12 345,00 ₽»: бухгалтерии нужны рубли с копейками, а не 1234500.
 *
 * Разряды группируются вручную, БЕЗ `toLocaleString('ru-RU')`: результат Intl зависит
 * от сборки ICU (на small-icu Node молча отдаёт формат en-US — «15,000.00» в рублёвом
 * счёте), да и разделитель у него неразрывный пробел, невидимо отличающийся от обычного.
 * Печатная форма денежного документа не имеет права зависеть от сборки рантайма.
 */
export const formatKopecks = (kopecks: number, currency = 'RUB'): string => {
  const sign = kopecks < 0 ? '−' : '';
  const abs = Math.abs(Math.trunc(kopecks));
  const rubles = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const cents = String(abs % 100).padStart(2, '0');
  const symbol = currency === 'RUB' ? '₽' : escapeHtml(currency);
  return `${sign}${rubles},${cents} ${symbol}`;
};

const formatDate = (iso: string): string => {
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}.${month}.${year}`;
};

/** Чистая функция: разметку счёта можно проверить тестом без Gotenberg. */
export const renderInvoiceHtml = (draft: RentalInvoiceDraft): string => `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>Счёт ${escapeHtml(draft.number)}</title>
<style>
  body { font-family: DejaVu Sans, Arial, sans-serif; font-size: 12pt; margin: 24mm 18mm; color: #111; }
  h1 { font-size: 16pt; margin-bottom: 4mm; }
  table { width: 100%; border-collapse: collapse; margin-top: 6mm; }
  th, td { border: 1px solid #999; padding: 3mm; text-align: left; }
  .total { font-weight: bold; }
  .muted { color: #555; font-size: 10pt; }
</style></head>
<body>
  <h1>Счёт № ${escapeHtml(draft.number)} от ${formatDate(draft.dueAt)}</h1>
  <p><strong>Плательщик:</strong> ${escapeHtml(draft.tenantName)}</p>
  <p><strong>Период аренды:</strong> ${formatDate(draft.periodStart)} — ${formatDate(draft.periodEnd)}</p>
  <p><strong>Оплатить до:</strong> ${formatDate(draft.dueAt)}</p>
  <table>
    <thead><tr><th>Наименование</th><th>Сумма</th></tr></thead>
    <tbody>
      <tr>
        <td>Аренда системы дистанционного обучения${
          draft.planName ? `, тариф «${escapeHtml(draft.planName)}»` : ''
        }</td>
        <td>${formatKopecks(draft.amountKopecks, draft.currency)}</td>
      </tr>
      <tr class="total"><td>Итого к оплате</td><td>${formatKopecks(
        draft.amountKopecks,
        draft.currency
      )}</td></tr>
    </tbody>
  </table>
  <p class="muted">Счёт сформирован автоматически. Оплата подтверждается платформой после
  поступления средств; после подтверждения формируется акт за тот же период.</p>
</body></html>`;

export class ManualRentalBillingProvider implements RentalBillingProvider {
  readonly code = 'manual' as const;

  constructor(
    private readonly gotenbergUrl: string,
    private readonly convert: typeof convertHtmlToPdf = convertHtmlToPdf
  ) {}

  async issue(draft: RentalInvoiceDraft): Promise<RentalInvoiceIssueResult | null> {
    try {
      const pdf = await this.convert(renderInvoiceHtml(draft), {
        gotenbergUrl: this.gotenbergUrl
      });
      return {
        document: {
          fileName: `invoice-${draft.number}.pdf`,
          contentType: 'application/pdf',
          content: pdf
        }
      };
    } catch {
      // Печать — удобство, обязательство платить — факт: счёт остаётся выставленным.
      return null;
    }
  }
}
