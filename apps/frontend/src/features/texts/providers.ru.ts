/**
 * Названия поставщиков услуг на русском (ТЗ «Стабилизация, UX и развитие», 4.2 / Я2).
 *
 * **Как было.** Список площадок вебинаров печатал коды как есть: `noop`, `fake`, `jitsi`,
 * `pruffme`, `bbb`; оплата подписывала «Отключено (noop)» и «Тестовый (fake)» — код в скобках;
 * СМС и видео звали то же самое своими словами («Не отправлять СМС», «Видео выключено»,
 * «Проверочный (только для тестового стенда)»). Четыре списка — четыре языка для двух понятий.
 *
 * **Что закреплено.** Техническое значение остаётся в коде и в запросах к серверу, на экран
 * попадает только имя отсюда. Общие коды (`noop`, `fake`) называются одинаково во всех списках
 * словами из ТЗ; остальные — именем сервиса, как его знает человек.
 *
 * Второй файл-ресурс по 16.4 (первый — `roles.ru.ts`).
 */

export const PROVIDER_NAMES_RU = {
  noop: 'Отключено',
  fake: 'Тестовый режим',
  /* вебинары */
  jitsi: 'Jitsi',
  pruffme: 'Pruffme',
  zoom: 'Zoom',
  bbb: 'BigBlueButton',
  /* СМС */
  smsc: 'SMSC.ru',
  smsru: 'SMS.ru',
  mts: 'МТС Коммуникатор',
  /* видео */
  selfhosted: 'Своё хранилище центра',
  kinescope: 'Kinescope',
  vk: 'VK Видео',
  /* оплата */
  yookassa: 'ЮKassa',
  tinkoff: 'Т-Касса',
  cloudpayments: 'CloudPayments',
  robokassa: 'Robokassa'
} as const satisfies Record<string, string>;

export type ProviderCode = keyof typeof PROVIDER_NAMES_RU;

const isKnown = (code: string): code is ProviderCode => code in PROVIDER_NAMES_RU;

/** Имя поставщика по коду; неизвестный код возвращается как есть — сторож его не пропустит. */
export const providerNameRu = (code: string): string =>
  isKnown(code) ? PROVIDER_NAMES_RU[code] : code;

/**
 * Подписи для одного списка: свой набор кодов → имена из общего словаря. Тип не даст
 * завести в список код, которого нет в словаре.
 */
export const providerLabels = <C extends ProviderCode>(codes: readonly C[]): Record<C, string> => {
  const labels = {} as Record<C, string>;
  for (const code of codes) labels[code] = PROVIDER_NAMES_RU[code];
  return labels;
};
