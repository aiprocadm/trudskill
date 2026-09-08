import { timingSafeEqual } from 'node:crypto';

import { Body, Controller, Inject, Logger, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

import { InMemoryMvpState } from './infrastructure/in-memory-mvp.state.js';
import { MVP_PERSISTENCE_BACKEND } from './infrastructure/mvp-persistence.token.js';
import { verifyTelegramLink } from '../../infrastructure/telegram/telegram-link-token.js';
import { readTelegramMessage } from '../../infrastructure/telegram/telegram-update.js';
import {
  TELEGRAM_PROVIDER,
  TELEGRAM_WEBHOOK_SECRET
} from '../../infrastructure/telegram/telegram.provider.js';
import { TELEGRAM_LINKS_REPOSITORY } from '../communication/telegram/telegram-links.repository.js';

import type { MvpPersistenceBackend } from './infrastructure/mvp-persistence.backend.js';
import type { TelegramProvider } from '../../infrastructure/telegram/telegram.provider.js';
import type { TelegramLinksRepository } from '../communication/telegram/telegram-links.repository.js';

/**
 * `ФТ-F3` — бот: привязка чата и ответ «моё обучение».
 *
 * **Почему контроллер здесь, а не в модуле общения.** Ответ на «моё обучение» читает
 * зачисления, а это модуль обучения; модуль общения до него не дотянется — он от него
 * зависит, и обратная стрелка повесила бы приложение циклом при старте. Отправка сообщений
 * при этом живёт в общении: слать и разбирать команды — разные обязанности.
 *
 * **Ручка публичная.** Telegram не присылает ни токена, ни арендатора. Подлинность
 * доказывает секрет в адресе: его знают только Telegram и мы, и сверяется он посимвольно
 * постоянным по времени сравнением. Чат сам по себе ничего не открывает — бот отвечает
 * только тому, кто уже привязан.
 */
@Controller('telegram')
export class TelegramBotController {
  private readonly logger = new Logger(TelegramBotController.name);

  constructor(
    @Inject(TELEGRAM_PROVIDER) private readonly provider: TelegramProvider,
    @Inject(TELEGRAM_LINKS_REPOSITORY) private readonly links: TelegramLinksRepository,
    @Inject(MVP_PERSISTENCE_BACKEND) private readonly persistence: MvpPersistenceBackend,
    @Inject(TELEGRAM_WEBHOOK_SECRET) private readonly webhookSecret: string
  ) {}

  @Post('webhook/:secret')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async handle(@Param('secret') secret: string, @Body() update: unknown): Promise<{ ok: true }> {
    /*
     * Отвечаем «принято» ВСЕГДА и молчим в чат при неверном секрете: иначе ручка становится
     * оракулом, по которому секрет подбирают, а Telegram при ошибке шлёт обновление по кругу.
     */
    if (!this.secretMatches(secret)) {
      this.logger.warn('telegram.webhook: неверный секрет в адресе');
      return { ok: true };
    }

    const message = readTelegramMessage(update);
    if (!message) return { ok: true };
    const { chatId: chat, text } = message;
    const start = /^\/start\s+(\S+)$/.exec(text);
    if (start) {
      await this.linkChat(chat, start[1]!);
      return { ok: true };
    }

    if (/^(\/study|моё обучение|мое обучение)$/i.test(text)) {
      await this.replyWithStudies(chat);
      return { ok: true };
    }

    await this.provider.send(
      chat,
      'Я умею показывать ваше обучение. Напишите «Моё обучение».\n' +
        'Если бот ещё не связан с вашей учётной записью, откройте ссылку из личного кабинета.'
    );
    return { ok: true };
  }

  /** Постоянное по времени сравнение: обычное `===` выдаёт длину общего префикса. */
  private secretMatches(given: string): boolean {
    const expected = this.webhookSecret;
    if (!expected) return false;
    const a = Buffer.from(given);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private async linkChat(chatId: string, token: string): Promise<void> {
    try {
      const claims = verifyTelegramLink(token, this.webhookSecret, Date.now());
      await this.links.link(claims.tenantId, claims.userId, chatId);
      await this.provider.send(
        chatId,
        'Готово: бот связан с вашей учётной записью. Сюда будут приходить уведомления об ' +
          'обучении. Напишите «Моё обучение», чтобы посмотреть текущие курсы.'
      );
    } catch {
      // Ссылка чужая, испорченная или просроченная — деталей не сообщаем (подсказка подбору).
      await this.provider.send(
        chatId,
        'Ссылка не подошла: она могла устареть. Откройте личный кабинет и получите новую.'
      );
    }
  }

  /**
   * Ответ «моё обучение».
   *
   * Состояние центра читается целиком в отдельный экземпляр: обычный путь чтения
   * (перехватчик запроса) здесь недоступен — у сообщения из мессенджера нет ни запроса, ни
   * арендатора. Чтение одноразовое и ничего не сохраняет.
   */
  private async replyWithStudies(chatId: string): Promise<void> {
    const link = await this.links.findByChat(chatId);
    if (!link) {
      await this.provider.send(
        chatId,
        'Бот пока не связан с вашей учётной записью. Откройте ссылку из личного кабинета.'
      );
      return;
    }

    const state = new InMemoryMvpState();
    await this.persistence.loadIntoState(link.tenantId, state);

    const learner = state.learners.find(
      (l) => l.tenantId === link.tenantId && l.linkedIamUserId === link.userId
    );
    if (!learner) {
      await this.provider.send(chatId, 'В этом учебном центре за вами пока не числится обучение.');
      return;
    }

    const enrollments = state.enrollments.filter(
      (e) => e.tenantId === link.tenantId && e.learnerId === learner.id
    );
    if (enrollments.length === 0) {
      await this.provider.send(chatId, 'Пока ни одного курса. Как только вас запишут — сообщу.');
      return;
    }

    const groupName = (groupId: string): string =>
      state.groups.find((g) => g.id === groupId)?.name ?? 'без группы';
    const lines = enrollments.map(
      (e) => `• ${groupName(e.groupId)} — ${STATUS_WORDS[e.status] ?? e.status}`
    );
    await this.provider.send(chatId, `Ваше обучение:\n${lines.join('\n')}`);
  }
}

/** Состояние словом: код вроде `in_progress` человеку ничего не говорит (`TXT-006`). */
const STATUS_WORDS: Record<string, string> = {
  invited: 'приглашение отправлено',
  active: 'идёт обучение',
  in_progress: 'идёт обучение',
  completed: 'завершено',
  cancelled: 'отменено',
  expired: 'срок истёк'
};
