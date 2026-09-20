import type { TenantBranding } from '../tenant/tenant-branding.js';

/**
 * Фирменное оформление письма: логотип и цвет учебного центра
 * (ТЗ «Стабилизация, UX и развитие», 11.2 пункт 2, парная задача к 13.3 / решение Р14).
 *
 * **Что было (журнал 597).** Письма уходили голым текстом. Слушатель получал сообщение,
 * неотличимое от рассылки любой другой системы: ни названия центра в оформлении, ни его
 * цвета. Для арендной модели это существенно — центр платит за то, чтобы его узнавали.
 *
 * **Письмо — не веб-страница, и привычные приёмы здесь не работают.** Три ограничения
 * определили всё устройство этого файла:
 *
 * 1. **Почтовые программы вырезают отдельные таблицы стилей.** Поэтому оформление пишется
 *    прямо в тегах, атрибутом `style`. Это не небрежность — иначе письмо придёт голым.
 * 2. **Современную раскладку понимают не все.** Каркас делается таблицами: это единственное,
 *    что одинаково работает и в свежем почтовом клиенте, и в старом корпоративном.
 * 3. **Картинки по умолчанию НЕ показываются.** У большинства получателей логотип просто не
 *    загрузится, поэтому письмо обязано читаться без него: название центра стоит текстом
 *    рядом, а не только внутри картинки.
 *
 * **Текстовая часть остаётся всегда.** Письмо уходит двумя частями — простой текст и
 * оформленная. Часть клиентов (и программы чтения с экрана) показывают именно первую, и
 * отказ от неё означал бы пустое письмо у части людей.
 */

/** Цвет по умолчанию — тот же, что у темы интерфейса, когда центр свой не выбрал. */
const DEFAULT_BRAND_COLOR = '#3b4fe4';

/** Ширина письма. 600 точек — то, что помещается в область просмотра почти всех программ. */
const LETTER_WIDTH = 600;

/**
 * Читаемый цвет текста на фирменном фоне.
 *
 * **Та же задача, что у кнопок в 13.3, и та же ловушка.** Цвет центра может оказаться жёлтым;
 * белый текст на жёлтом нечитаем. Поэтому цвет надписи не прибивается к белому, а считается
 * от яркости фона.
 *
 * Формула яркости — упрощённая (без гамма-коррекции): для выбора между чёрным и белым её
 * достаточно, а точный расчёт контраста живёт в пакете интерфейса, куда серверу ходить
 * незачем.
 */
export const readableOn = (hexColor: string): string => {
  const hex = hexColor.replace('#', '');
  if (hex.length !== 6) return '#ffffff';
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  if (![r, g, b].every(Number.isFinite)) return '#ffffff';
  /* Коэффициенты — доля каждого канала в воспринимаемой яркости; глаз чувствительнее к зелёному. */
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 150 ? '#0f172a' : '#ffffff';
};

/**
 * Экранирование значений, попадающих в письмо.
 *
 * Название центра и текст письма приходят из данных, а не из кода: без экранирования угловая
 * скобка в названии («ООО <Альфа>») сломала бы вёрстку письма, а подставленное значение
 * стало бы разметкой.
 */
export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Простой текст письма — в абзацы.
 *
 * Пустая строка разделяет абзацы, одиночный перенос остаётся переносом. Так текст,
 * написанный для простой части, читается и в оформленной, и шаблоны не приходится держать в
 * двух видах — иначе они разойдутся при первой же правке.
 */
const paragraphs = (body: string): string =>
  body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(
      (block) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#0f172a;">${escapeHtml(
          block
        ).replace(/\n/g, '<br />')}</p>`
    )
    .join('');

export interface BrandedLetterInput {
  /** Тема письма — она же заголовок внутри. */
  subject: string;
  /** Готовый текст письма (простая часть), уже с подставленными значениями. */
  body: string;
  branding?: TenantBranding | undefined;
  /** Название центра; берётся из бренда, если там задано. */
  tenantName?: string | undefined;
}

/**
 * Собрать оформленное письмо.
 *
 * Возвращает готовую разметку. Простая текстовая часть собирается отдельно и не подменяется:
 * она уходит вместе с этой.
 */
export const brandedLetter = (input: BrandedLetterInput): string => {
  const color =
    input.branding?.brandColor && /^#[0-9a-f]{6}$/i.test(input.branding.brandColor)
      ? input.branding.brandColor
      : DEFAULT_BRAND_COLOR;
  const onColor = readableOn(color);
  const name = input.branding?.displayName ?? input.tenantName ?? '';
  const logo = input.branding?.logoUrl;

  /*
   * Логотип и название СТОЯТ РЯДОМ, а не заменяют друг друга. Картинка не загрузится у
   * большинства получателей — почтовые программы блокируют их по умолчанию; название текстом
   * это единственное, что человек увидит наверняка. Подпись `alt` дублирует его для тех, кто
   * читает письмо голосом.
   */
  const header = [
    logo
      ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(name || 'Логотип учебного центра')}" ` +
        `width="120" style="display:block;border:0;max-width:120px;height:auto;margin:0 auto 8px;" />`
      : '',
    name
      ? `<div style="font-size:16px;font-weight:600;color:${onColor};">${escapeHtml(name)}</div>`
      : ''
  ]
    .filter(Boolean)
    .join('');

  return [
    '<!DOCTYPE html>',
    '<html lang="ru"><head><meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>${escapeHtml(input.subject)}</title></head>`,
    '<body style="margin:0;padding:0;background:#f1f5f9;">',
    /* Таблица, а не блоки: единственный каркас, одинаково понятный всем почтовым программам. */
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" ' +
      'style="background:#f1f5f9;padding:24px 12px;"><tr><td align="center">',
    `<table role="presentation" width="${LETTER_WIDTH}" cellpadding="0" cellspacing="0" ` +
      `style="width:100%;max-width:${LETTER_WIDTH}px;background:#ffffff;border-radius:12px;overflow:hidden;">`,
    header
      ? `<tr><td style="background:${color};padding:20px;text-align:center;">${header}</td></tr>`
      : '',
    '<tr><td style="padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">',
    `<h1 style="margin:0 0 16px;font-size:19px;line-height:1.3;color:#0f172a;">${escapeHtml(
      input.subject
    )}</h1>`,
    paragraphs(input.body),
    '</td></tr>',
    /*
     * Подвал говорит, ОТ КОГО письмо и что отвечать на него не нужно. Без этого человек
     * отвечает на служебный адрес, и его вопрос не читает никто.
     */
    '<tr><td style="padding:0 24px 24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">',
    '<hr style="border:0;border-top:1px solid #e2e8f0;margin:0 0 12px;" />',
    `<p style="margin:0;font-size:12px;line-height:1.5;color:#64748b;">${
      name ? `Письмо отправлено автоматически от имени: ${escapeHtml(name)}. ` : ''
    }Отвечать на него не нужно — по вопросам обращайтесь в учебный центр.</p>`,
    '</td></tr>',
    '</table></td></tr></table></body></html>'
  ]
    .filter(Boolean)
    .join('');
};
