import type { RentalInvoiceDto } from './api';

/**
 * ФТ-D5.1: чистая логика счетов аренды (конвенция пакета — логика вне React,
 * RTL в проекте нет). Форматирование денег зеркалит серверную печатную форму:
 * группировка вручную, без Intl — на small-icu сборке он молча даёт формат en-US.
 */

export const INVOICE_STATUS_LABELS: Record<RentalInvoiceDto['status'], string> = {
  issued: 'Выставлен',
  paid: 'Оплачен',
  cancelled: 'Отменён'
};

export const formatKopecks = (kopecks: number, currency = 'RUB'): string => {
  const sign = kopecks < 0 ? '−' : '';
  const abs = Math.abs(Math.trunc(kopecks));
  const rubles = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const cents = String(abs % 100).padStart(2, '0');
  return `${sign}${rubles},${cents} ${currency === 'RUB' ? '₽' : currency}`;
};

/** Рубли из формы → копейки. «15 000,50» и «15000.50» одинаково валидны. */
export const parseRublesToKopecks = (input: string): number | null => {
  const normalized = input.replaceAll(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
};

/** Просрочен ли счёт на сегодня — для подсветки в списке (grace считает сервер). */
export const isOverdue = (invoice: RentalInvoiceDto, today: string): boolean =>
  invoice.status === 'issued' && invoice.dueAt.slice(0, 10) < today.slice(0, 10);

export const formatIsoDate = (iso: string): string => {
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}.${month}.${year}`;
};
