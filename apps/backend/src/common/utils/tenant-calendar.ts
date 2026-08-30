/**
 * Календарь центра: «сегодня» и «текущий период» в ЕГО часовом поясе, а не в UTC.
 *
 * Зачем (журнал 300). ТЗ §5 требует поддерживать настройку часового пояса, и настройка в
 * продукте есть — центр выбирает её на экране реквизитов, по умолчанию `Europe/Moscow`.
 * Но календарную дату сервер выводил из UTC-мгновения (`new Date().toISOString().slice(0, 10)`),
 * и настройка не влияла ни на что.
 *
 * Чем это плохо на деле. У центра в Новосибирске (UTC+7) удостоверение, выпущенное 1 января
 * в 06:00 по местному времени, получало дату **31 декабря прошлого года** — и номер из
 * ПРОШЛОГОДНЕЙ серии, потому что период нумерации тоже считался по UTC. В регулируемом
 * реестре это не косметика: у проверяющего дата выдачи оказывается раньше, чем закончилось
 * обучение, а номер — из закрытого года.
 *
 * Арифметика над строками `YYYY-MM-DD` (`addDays`, `addMonths`) часового пояса не касается и
 * живёт отдельно, в `date-math.util.ts`: там нет перехода «мгновение → календарь».
 */

/** Часовой пояс по умолчанию — тот же, что подставляют настройки центра. */
export const DEFAULT_TENANT_TIMEZONE = 'Europe/Moscow';

/** Сколько раз пожаловались на неизвестный пояс — чтобы не спамить в журнал на каждый запрос. */
const complainedAbout = new Set<string>();

/**
 * Части календарной даты в указанном поясе. Неизвестный пояс — не повод падать: центр не
 * должен терять возможность выпустить документ из-за опечатки в настройке. Берём значение
 * по умолчанию и жалуемся ОДИН раз на пояс.
 */
function partsIn(timezone: string, at: Date): { year: number; month: number; day: number } {
  const zone = timezone.trim() || DEFAULT_TENANT_TIMEZONE;
  try {
    return formatParts(zone, at);
  } catch {
    if (!complainedAbout.has(zone)) {
      complainedAbout.add(zone);
      // console.warn — принятый в бэкенде способ жаловаться из мест без DI (см. payments.module).
      console.warn(
        `[tenant-calendar] неизвестный часовой пояс «${zone}» — считаем по ${DEFAULT_TENANT_TIMEZONE}`
      );
    }
    return formatParts(DEFAULT_TENANT_TIMEZONE, at);
  }
}

function formatParts(zone: string, at: Date): { year: number; month: number; day: number } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  // en-CA даёт ровно `YYYY-MM-DD` — разбирать локализованные названия месяцев не приходится.
  const [year, month, day] = formatter.format(at).split('-').map(Number);
  if (!year || !month || !day) {
    throw new Error(`не удалось получить дату в поясе ${zone}`);
  }
  return { year, month, day };
}

const pad = (value: number): string => `${value}`.padStart(2, '0');

/** Календарная дата `YYYY-MM-DD` в часовом поясе центра. */
export function todayIn(timezone: string | undefined, at: Date = new Date()): string {
  const { year, month, day } = partsIn(timezone ?? DEFAULT_TENANT_TIMEZONE, at);
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Ключ периода нумерации в часовом поясе центра: `all`, `2027` или `2027-01`.
 * Именно он попадает в маску номера и решает, к какому году относится документ.
 */
export function periodKeyIn(
  timezone: string | undefined,
  reset: 'none' | 'year' | 'month',
  at: Date = new Date()
): string {
  if (reset === 'none') return 'all';
  const { year, month } = partsIn(timezone ?? DEFAULT_TENANT_TIMEZONE, at);
  return reset === 'year' ? `${year}` : `${year}-${pad(month)}`;
}
