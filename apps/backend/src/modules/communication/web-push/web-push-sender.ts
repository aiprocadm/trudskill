/** DI token for the active web-push sender (real WebPushSender or NoopWebPushSender by env). */
export const WEB_PUSH_SENDER = Symbol('WEB_PUSH_SENDER');

export interface WebPushNotification {
  title: string;
  body: string;
  /** Глубокая ссылка для клика по уведомлению (опц.). */
  url?: string;
}

export interface WebPushSenderPort {
  /** Шлёт push всем подпискам перечисленных пользователей в тенанте. Тихо игнорит, если push выключен. */
  sendToUsers(
    tenantId: string,
    userIds: string[],
    notification: WebPushNotification
  ): Promise<void>;
}
