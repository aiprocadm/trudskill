import { describe, expect, it, vi } from 'vitest';

import { TelegramBotController } from './telegram-bot.controller.js';
import { signTelegramLink } from '../../infrastructure/telegram/telegram-link-token.js';

import type { MvpPersistenceBackend } from './infrastructure/mvp-persistence.backend.js';
import type { TelegramProvider } from '../../infrastructure/telegram/telegram.provider.js';
import type { TelegramLinksRepository } from '../communication/telegram/telegram-links.repository.js';

const SECRET = 'тестовый-секрет';

const base = {
  tenantId: 't1',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z'
};

function harness(link: unknown = null) {
  const send = vi.fn().mockResolvedValue(true);
  const links = {
    findByUser: vi.fn(),
    findByChat: vi.fn().mockResolvedValue(link),
    link: vi.fn().mockResolvedValue({}),
    unlink: vi.fn()
  } as unknown as TelegramLinksRepository;
  const persistence = {
    loadIntoState: vi.fn(async (_tenantId: string, state: any) => {
      state.learners.push({ ...base, id: 'lrn_1', status: 'active', linkedIamUserId: 'u1' });
      state.groups.push({
        ...base,
        id: 'grp_1',
        status: 'active',
        code: 'ОТ-01',
        name: 'ОТ-01 Охрана труда'
      });
      state.enrollments.push({
        ...base,
        id: 'enr_1',
        learnerId: 'lrn_1',
        groupId: 'grp_1',
        status: 'in_progress'
      });
    }),
    saveFromState: vi.fn()
  } as unknown as MvpPersistenceBackend;

  const controller = new TelegramBotController(
    { code: 'bot-api', send } as TelegramProvider,
    links,
    persistence,
    SECRET
  );
  return { controller, send, links, persistence };
}

const message = (text: string) => ({ message: { chat: { id: 555 }, text } });

describe('ФТ-F3 · бот: привязка и «моё обучение»', () => {
  it('неверный секрет в адресе: ничего не делаем и в чат не пишем', async () => {
    /* Ответ на чужой запрос сделал бы ручку оракулом для подбора секрета. */
    const h = harness();
    await expect(h.controller.handle('чужой-секрет', message('/study'))).resolves.toEqual({
      ok: true
    });
    expect(h.send).not.toHaveBeenCalled();
    expect(h.links.findByChat).not.toHaveBeenCalled();
  });

  it('/start с правильным токеном привязывает чат', async () => {
    const h = harness();
    const token = signTelegramLink({ tenantId: 't1', userId: 'u1' }, SECRET, 900, Date.now());

    await h.controller.handle(SECRET, message(`/start ${token}`));

    expect(h.links.link).toHaveBeenCalledWith('t1', 'u1', '555');
    expect(h.send.mock.calls[0]?.[1]).toContain('Готово');
  });

  it('/start с чужим токеном ничего не привязывает и не объясняет почему', async () => {
    const h = harness();
    const alien = signTelegramLink(
      { tenantId: 't1', userId: 'u1' },
      'другой-секрет',
      900,
      Date.now()
    );

    await h.controller.handle(SECRET, message(`/start ${alien}`));

    expect(h.links.link).not.toHaveBeenCalled();
    /* Человеку — «ссылка не подошла»; подсказки, что именно не так, быть не должно. */
    expect(h.send.mock.calls[0]?.[1]).toContain('не подошла');
    expect(h.send.mock.calls[0]?.[1]).not.toMatch(/подпись|signature|секрет/i);
  });

  it('«моё обучение» показывает группы и состояние СЛОВАМИ', async () => {
    const h = harness({ tenantId: 't1', userId: 'u1', chatId: '555', linkedAt: '2026-09-08' });

    await h.controller.handle(SECRET, message('Моё обучение'));

    const reply = h.send.mock.calls[0]?.[1] as string;
    expect(reply).toContain('ОТ-01 Охрана труда');
    /* Код состояния `in_progress` человеку ничего не говорит (TXT-006). */
    expect(reply).toContain('идёт обучение');
    expect(reply).not.toContain('in_progress');
  });

  it('непривязанный чат не получает чужого обучения', async () => {
    const h = harness(null);

    await h.controller.handle(SECRET, message('моё обучение'));

    expect(h.persistence.loadIntoState).not.toHaveBeenCalled();
    expect(h.send.mock.calls[0]?.[1]).toContain('не связан');
  });

  it('непонятное сообщение получает подсказку, а не молчание', async () => {
    const h = harness();
    await h.controller.handle(SECRET, message('привет'));
    expect(h.send.mock.calls[0]?.[1]).toContain('Моё обучение');
  });
});
