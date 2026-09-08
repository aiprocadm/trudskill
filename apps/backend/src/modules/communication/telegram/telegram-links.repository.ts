export const TELEGRAM_LINKS_REPOSITORY = Symbol('TELEGRAM_LINKS_REPOSITORY');

export interface TelegramLink {
  tenantId: string;
  userId: string;
  chatId: string;
  linkedAt: string;
}

export interface TelegramLinksRepository {
  /** Чат человека — по нему уходит уведомление. */
  findByUser(tenantId: string, userId: string): Promise<TelegramLink | null>;
  /** Владелец чата — по нему бот понимает, кому отвечать на команду. */
  findByChat(chatId: string): Promise<TelegramLink | null>;
  /**
   * Привязка. Повторная ЗАМЕНЯЕТ прежнюю в обе стороны: сменил телефон — сообщения должны
   * пойти на новое устройство, а не продолжать уходить на старое.
   */
  link(tenantId: string, userId: string, chatId: string): Promise<TelegramLink>;
  /** Отвязка по желанию человека: канал второй, отказаться от него можно в любой момент. */
  unlink(tenantId: string, userId: string): Promise<void>;
}
