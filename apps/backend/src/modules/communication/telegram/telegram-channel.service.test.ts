import { describe, expect, it, vi } from 'vitest';

import { TelegramChannelService } from './telegram-channel.service.js';

import type { TelegramLinksRepository } from './telegram-links.repository.js';
import type { TelegramProvider } from '../../../infrastructure/telegram/telegram.provider.js';

const linksWith = (link: unknown): TelegramLinksRepository =>
  ({
    findByUser: vi.fn().mockResolvedValue(link),
    findByChat: vi.fn(),
    link: vi.fn(),
    unlink: vi.fn()
  }) as unknown as TelegramLinksRepository;

const LINK = { tenantId: 't1', userId: 'u1', chatId: '555', linkedAt: '2026-09-08T00:00:00.000Z' };

describe('ФТ-F3 · третий канал доставки', () => {
  it('сообщение уходит в привязанный чат', async () => {
    const send = vi.fn().mockResolvedValue(true);
    const service = new TelegramChannelService(
      { code: 'bot-api', send } as TelegramProvider,
      linksWith(LINK)
    );

    await expect(service.notify('t1', 'u1', 'Текст')).resolves.toBe(true);
    expect(send).toHaveBeenCalledWith('555', 'Текст');
  });

  it('без привязки канал молчит — это нормальное состояние, а не ошибка', async () => {
    const send = vi.fn();
    const service = new TelegramChannelService(
      { code: 'bot-api', send } as TelegramProvider,
      linksWith(null)
    );

    await expect(service.notify('t1', 'u1', 'Текст')).resolves.toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('спящий бот не ходит в хранилище вовсе', async () => {
    const links = linksWith(LINK);
    const service = new TelegramChannelService(
      { code: 'noop', send: vi.fn() } as TelegramProvider,
      links
    );

    await expect(service.notify('t1', 'u1', 'Текст')).resolves.toBe(false);
    expect(links.findByUser).not.toHaveBeenCalled();
  });

  it('сбой канала НЕ бросает: письмо человек уже получил', async () => {
    /*
     * Ключевое свойство второго и третьего каналов. Если бы сбой мессенджера поднимался
     * наверх, отозванный токен бота ронял бы рассылку целиком — и люди не узнавали бы об
     * обучении вовсе.
     */
    const links = {
      findByUser: vi.fn().mockRejectedValue(new Error('база недоступна'))
    } as unknown as TelegramLinksRepository;
    const service = new TelegramChannelService(
      { code: 'bot-api', send: vi.fn() } as TelegramProvider,
      links
    );

    await expect(service.notify('t1', 'u1', 'Текст')).resolves.toBe(false);
  });
});
