import { Inject, Injectable, Logger } from '@nestjs/common';

import { TELEGRAM_LINKS_REPOSITORY } from './telegram-links.repository.js';
import { TELEGRAM_PROVIDER } from '../../../infrastructure/telegram/telegram.provider.js';

import type { TelegramLinksRepository } from './telegram-links.repository.js';
import type { TelegramProvider } from '../../../infrastructure/telegram/telegram.provider.js';

/**
 * `ФТ-F3` — третий канал доставки: то же уведомление в мессенджер.
 *
 * Свойство, ради которого он написан именно так: **никогда не бросает и никогда не мешает
 * первому каналу**. Письмо уже ушло к моменту вызова; молчащий бот, отозванный токен или
 * человек, удаливший чат, не должны превращаться в ошибку рассылки. Ровно то же правило у
 * СМС-канала (ФТ-C1.3), и по той же причине: сломанный второй канал не должен закрывать
 * людям доступ к обучению.
 *
 * Кому писать — решает ПРИВЯЗКА, а не адрес: идентификатор чата приходит от Telegram и сам
 * по себе не говорит, кто за ним. Нет привязки — канал молчит, и это нормальное состояние
 * для всех, кто ботом не пользуется.
 */
@Injectable()
export class TelegramChannelService {
  private readonly logger = new Logger(TelegramChannelService.name);

  constructor(
    @Inject(TELEGRAM_PROVIDER) private readonly provider: TelegramProvider,
    @Inject(TELEGRAM_LINKS_REPOSITORY) private readonly links: TelegramLinksRepository
  ) {}

  /** `true` — сообщение ушло; `false` — привязки нет, бот молчит или отказал. */
  async notify(tenantId: string, userId: string, text: string): Promise<boolean> {
    if (this.provider.code === 'noop') return false;
    try {
      const link = await this.links.findByUser(tenantId, userId);
      if (!link) return false;
      const sent = await this.provider.send(link.chatId, text);
      if (!sent) {
        /*
         * Не молчим: канал второй, но «сообщения перестали доходить» должно быть видно в
         * журнале. Иначе отозванный токен бота обнаружится только по жалобам слушателей.
         */
        this.logger.warn(
          `telegram: сообщение не доставлено (tenant ${tenantId}, чат ${link.chatId})`
        );
      }
      return sent;
    } catch (error) {
      // Второй канал не имеет права ронять рассылку: письмо человек уже получил.
      this.logger.warn(`telegram: сбой канала — ${error instanceof Error ? error.message : error}`);
      return false;
    }
  }
}
