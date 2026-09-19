import { describe, expect, it } from 'vitest';

import { safeSenderName, senderFrom } from './sender-name.js';

/**
 * Имя отправителя письма — название учебного центра (ТЗ 13.3, решение владельца Р14).
 *
 * **Что было.** Все письма уходили от одного платформенного адреса: слушатель получал письмо
 * от незнакомого сервиса, а не от своего центра. Для письма со ссылкой на вход это прямо
 * мешает работе — такие письма открывают хуже (журнал 556).
 *
 * **Граница решения.** Меняется только ВИДИМОЕ имя. Адрес остаётся платформенным: свой домен и
 * свой SMTP — возможность старшего тарифа по тому же Р14, и подменять адрес без них нельзя,
 * письмо уйдёт в спам (подписи SPF/DKIM принадлежат платформе).
 */

describe('имя центра в отправителе письма (ТЗ 13.3)', () => {
  it('имя центра встаёт перед платформенным адресом', () => {
    expect(senderFrom('noreply@trudskill.ru', 'УЦ «Мост»')).toBe(
      'УЦ «Мост» <noreply@trudskill.ru>'
    );
  });

  it('адрес не меняется — меняется только имя', () => {
    /* Подмена адреса без своего домена и SMTP отправила бы письмо в спам. */
    const from = senderFrom('noreply@trudskill.ru', 'Центр «Заря»');
    expect(from).toContain('<noreply@trudskill.ru>');
    expect(from, 'чужого домена в адресе быть не должно').not.toMatch(/@(?!trudskill\.ru)/);
  });

  it('уже указанное имя в настройке заменяется, а не удваивается', () => {
    /* Два имени в одном заголовке — ошибка формата, а не удвоенная вежливость. */
    expect(senderFrom('Trudskill <noreply@trudskill.ru>', 'УЦ «Мост»')).toBe(
      'УЦ «Мост» <noreply@trudskill.ru>'
    );
  });

  it('без названия центра письмо уходит от платформы, как и раньше', () => {
    /*
     * Молчаливая подстановка пустого имени дала бы заголовок `<> <noreply@…>`, который часть
     * почтовых серверов отвергает: письмо не дошло бы вообще.
     */
    expect(senderFrom('noreply@trudskill.ru', undefined)).toBe('noreply@trudskill.ru');
    expect(senderFrom('noreply@trudskill.ru', '   ')).toBe('noreply@trudskill.ru');
  });
});

describe('имя центра безопасно для заголовка письма (ТЗ 13.3)', () => {
  it('перевод строки не даёт подставить лишние заголовки', () => {
    /*
     * Название центра вводит человек. Перевод строки в заголовке письма — классический способ
     * дописать свои заголовки (подмена получателя, скрытая копия). Здесь он просто не выживает.
     */
    const injected = safeSenderName('УЦ «Мост»\r\nBcc: chужой@example.com');
    expect(injected).not.toMatch(/[\r\n]/);
    expect(injected).toContain('УЦ «Мост»');

    const from = senderFrom('noreply@trudskill.ru', 'Центр\nBcc: someone@example.com');
    expect(from).not.toMatch(/[\r\n]/);
  });

  it('угловые скобки и кавычки не ломают разбор заголовка', () => {
    expect(safeSenderName('Центр <hack@example.com>')).not.toMatch(/[<>]/);
    expect(safeSenderName('Центр "Кавычки"')).not.toContain('"');
  });

  it('слишком длинное название обрезается, а не рвёт заголовок', () => {
    /* Почтовые программы обрезают длинный заголовок сами — и человек видит обрывок. */
    const long = 'Очень длинное название учебного центра '.repeat(5);
    const name = safeSenderName(long)!;
    expect(name.length).toBeLessThanOrEqual(78);
    expect(name.endsWith('…'), 'обрезка должна быть видна').toBe(true);
  });

  it('пустое и пробельное название — это отсутствие имени', () => {
    expect(safeSenderName(undefined)).toBeNull();
    expect(safeSenderName('')).toBeNull();
    expect(safeSenderName('   \n  ')).toBeNull();
  });
});
