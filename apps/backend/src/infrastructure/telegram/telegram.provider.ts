/**
 * Шов Telegram-бота (`ФТ-F3`) — по форме `SmsProvider` и `WebinarProvider`.
 *
 * Зачем канал вообще. В России мессенджер живее почты: письмо о том, что через три дня
 * истекает удостоверение, слушатель увидит в лучшем случае вечером, а сообщение в телефоне —
 * сразу. При этом канал ВТОРОЙ: он дублирует письмо, а не заменяет его.
 *
 * Как и у СМС, ключевое свойство — он никогда не мешает первому каналу. Молчащий бот не
 * должен приводить к тому, что человек не узнал о своём обучении вовсе.
 */

export interface TelegramProvider {
  readonly code: 'noop' | 'bot-api';
  /**
   * Отправка сообщения в чат. Возвращает `false` при отказе — БЕЗ исключения: канал
   * второй, и его сбой не должен ронять рассылку.
   */
  send(chatId: string, text: string): Promise<boolean>;
}

export const TELEGRAM_PROVIDER = Symbol('TELEGRAM_PROVIDER');

/**
 * Секрет ручки вебхука отдельным значением контейнера, а не чтением `backendEnv` внутри
 * контроллера. Причина простая: класс, который сам лезет в окружение, нельзя проверить —
 * тест не может подставить свой секрет, и вся проверка подлинности остаётся непокрытой.
 */
export const TELEGRAM_WEBHOOK_SECRET = Symbol('TELEGRAM_WEBHOOK_SECRET');

/** Спящий адаптер: бот не настроен, канал молчит. */
export class NoopTelegramProvider implements TelegramProvider {
  readonly code = 'noop' as const;

  async send(): Promise<boolean> {
    return false;
  }
}

/** Таймаут запроса к Telegram: рассылка не должна висеть на молчащем боте. */
export const TELEGRAM_API_TIMEOUT_MS = 5_000;

export class BotApiTelegramProvider implements TelegramProvider {
  readonly code = 'bot-api' as const;

  constructor(
    private readonly botToken: string,
    private readonly apiBase = 'https://api.telegram.org',
    private readonly fetchImpl: typeof fetch = globalThis.fetch
  ) {}

  async send(chatId: string, text: string): Promise<boolean> {
    try {
      const res = await this.fetchImpl(`${this.apiBase}/bot${this.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        /*
         * Разметка не используется намеренно: текст уведомления собирается из данных центра
         * (названия курсов, фамилии), и любой символ разметки в них сломал бы отправку —
         * человек не получил бы сообщение из-за скобки в названии программы.
         */
        body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
        signal: AbortSignal.timeout(TELEGRAM_API_TIMEOUT_MS)
      });
      return res.ok;
    } catch {
      // Бот недоступен — это отказ ВТОРОГО канала: письмо человек всё равно получил.
      return false;
    }
  }
}
