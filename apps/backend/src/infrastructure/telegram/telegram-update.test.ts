import { describe, expect, it } from 'vitest';

import { readTelegramMessage } from './telegram-update.js';

describe('ФТ-F3 · разбор обновления Telegram', () => {
  it('берёт чат и текст из настоящего обновления с лишними полями', () => {
    /* У настоящего обновления полей много — лишние не должны мешать. */
    expect(
      readTelegramMessage({
        update_id: 42,
        message: {
          message_id: 7,
          date: 1770000000,
          from: { id: 555, is_bot: false, first_name: 'Иван' },
          chat: { id: 555, type: 'private', first_name: 'Иван' },
          text: '  Моё обучение  ',
          entities: []
        }
      })
    ).toEqual({ chatId: '555', text: 'Моё обучение' });
  });

  it('групповой чат с отрицательным номером читается как есть', () => {
    expect(readTelegramMessage({ message: { chat: { id: -100123 }, text: '/study' } })).toEqual({
      chatId: '-100123',
      text: '/study'
    });
  });

  it('обновление без текста (фото, вход в чат) пропускается', () => {
    expect(readTelegramMessage({ message: { chat: { id: 555 }, photo: [] } })).toBeNull();
    expect(readTelegramMessage({ message: { chat: { id: 555 }, text: '   ' } })).toBeNull();
  });

  it('мусор вместо тела не роняет разбор', () => {
    for (const junk of [null, undefined, 'строка', 42, {}, { message: null }, { message: {} }]) {
      expect(readTelegramMessage(junk), String(junk)).toBeNull();
    }
  });

  it('чат без идентификатора пропускается — писать некуда', () => {
    expect(readTelegramMessage({ message: { chat: {}, text: 'привет' } })).toBeNull();
    expect(readTelegramMessage({ message: { chat: { id: '' }, text: 'привет' } })).toBeNull();
  });
});
