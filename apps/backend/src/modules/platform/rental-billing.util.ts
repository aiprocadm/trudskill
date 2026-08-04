/**
 * ФТ-D5.1: grace-период считается в РАБОЧИХ днях (решение владельца: 10, настраивается
 * в тарифе). Календарные не годятся: счёт со сроком в пятницу дал бы центру на два дня
 * меньше реального времени на оплату — бухгалтерия в выходные не работает.
 *
 * Производственный календарь РФ (переносы праздников) сознательно НЕ подключаем:
 * он меняется постановлением каждый год и требует источника данных. Ошибка в нашу
 * пользу здесь недопустима, а в пользу арендатора — терпима, поэтому считаем только
 * субботу и воскресенье. Праздники дают центру НЕСКОЛЬКО ЛИШНИХ дней — это безопасно.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const isWeekend = (date: Date): boolean => {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
};

/** `2026-08-04` + N рабочих дней → `YYYY-MM-DD`. N = 0 возвращает исходную дату. */
export const addWorkingDays = (isoDate: string, workingDays: number): string => {
  const date = new Date(`${isoDate.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`addWorkingDays: некорректная дата "${isoDate}"`);
  }
  let left = Math.max(0, Math.trunc(workingDays));
  while (left > 0) {
    date.setTime(date.getTime() + MS_PER_DAY);
    if (!isWeekend(date)) left -= 1;
  }
  return date.toISOString().slice(0, 10);
};

/**
 * Просрочен ли счёт настолько, что кабинет пора приостанавливать.
 * Ровно в день окончания grace кабинет ещё живёт — приостановка со следующего дня:
 * «последний день» в переписке с бухгалтерией означает «включительно».
 */
export const isGraceExpired = (dueAt: string, graceWorkingDays: number, today: string): boolean =>
  today.slice(0, 10) > addWorkingDays(dueAt, graceWorkingDays);
