/**
 * Нормализация телефона к E.164 (ФТ-C1.3, Фаза 3 Task 5).
 *
 * Телефоны в СДО вводят люди и грузят Excel'ем, поэтому в базе лежит что угодно:
 * `8 (999) 123-45-67`, `+7 999 1234567`, `79991234567`. Оператор не станет это разбирать —
 * он молча не доставит сообщение, а мы посчитаем отправку успешной. Поэтому мусор лучше
 * отсеять здесь и честно вернуть `null`, чем отправить в никуда.
 */

/** Максимум E.164 — 15 цифр; минимум осмысленного международного номера — 10. */
const MIN_DIGITS = 10;
const MAX_DIGITS = 15;

export function normalizePhone(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const hadPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  // Российские записи: 8XXXXXXXXXX — та же самая «семёрка», просто набранная по-старому.
  // Делаем это ТОЛЬКО без ведущего «+»: «+8…» — это уже другая страна, не наше дело.
  if (!hadPlus && digits.length === 11 && digits.startsWith('8')) {
    return `+7${digits.slice(1)}`;
  }

  // Десять цифр без кода страны — почти всегда российский номер, записанный без «8».
  // Это ДОПУЩЕНИЕ, а не факт: за пределами РФ оно неверно. Оно оправдано тем, что
  // альтернатива — не отправить ничего, а тенанты у нас российские учебные центры.
  if (!hadPlus && digits.length === MIN_DIGITS) {
    return `+7${digits}`;
  }

  if (digits.length < MIN_DIGITS || digits.length > MAX_DIGITS) return null;
  return `+${digits}`;
}
