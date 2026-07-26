/**
 * Дата прописью по-русски для бланков (ФТ-A2.3, переменная `document.issue_date_words`).
 *
 * Формат — как в приказах и протоколах: «26 июля 2026 г.». Месяц в родительном падеже.
 * Своя таблица месяцев, а не `Intl.DateTimeFormat`: вывод ICU зависит от версии данных
 * локали в рантайме, а номер и дата документа должны совпадать во всех выдачах
 * (детерминизм ФТ-A1.4 — перевыпуск обязан дать тот же файл).
 */

const MONTHS_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря'
] as const;

/**
 * @param isoDate дата в ISO (`2026-07-26` или полный timestamp).
 * @returns «26 июля 2026 г.»; пустая строка, если дата не распознана — бланк не должен
 * падать из-за пустого поля, отсутствующие значения везде рендерятся пустыми.
 */
export function formatRussianDateWords(isoDate: string | undefined | null): string {
  if (!isoDate) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate.trim());
  if (!match) return '';
  const [, year, month, day] = match;
  const monthIndex = Number(month) - 1;
  const monthName = MONTHS_GENITIVE[monthIndex];
  if (!monthName) return '';
  const dayNumber = Number(day);
  if (dayNumber < 1 || dayNumber > 31) return '';
  return `${dayNumber} ${monthName} ${year} г.`;
}
