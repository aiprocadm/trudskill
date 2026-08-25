/**
 * Русское склонение после числа: «1 строка», «2 строки», «5 строк».
 *
 * Дефект, из-за которого понадобилось: экраны писали «Показаны первые 1 строк» и
 * «Что в файле: 21 строк». Мелочь на вид, но именно из таких мелочей складывается
 * ощущение «программа со мной не разговаривает, а отчитывается».
 *
 * Правило склонения жило в проекте ровно в одном месте — для баллов
 * (`assessment-admin/format.ts`). Второе такое же на соседнем экране разъехалось бы с
 * первым, поэтому правило вынесено сюда, а не скопировано.
 */

/**
 * Формы: для 1, для 2–4, для 5 и больше.
 *
 * `plural(1, ['строка', 'строки', 'строк'])` → «строка».
 */
export const plural = (count: number, forms: [string, string, string]): string => {
  const abs = Math.abs(count);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  // 11–14 — исключение: «11 строк», а не «11 строка», хотя последняя цифра единица.
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
};

/** «5 строк» — число вместе со словом в нужной форме. */
export const withPlural = (count: number, forms: [string, string, string]): string =>
  `${count} ${plural(count, forms)}`;

/** Готовые наборы для того, что считают чаще всего. */
export const FORMS = {
  row: ['строка', 'строки', 'строк'] as [string, string, string],
  learner: ['слушатель', 'слушателя', 'слушателей'] as [string, string, string],
  group: ['группа', 'группы', 'групп'] as [string, string, string],
  document: ['документ', 'документа', 'документов'] as [string, string, string],
  question: ['вопрос', 'вопроса', 'вопросов'] as [string, string, string]
};
