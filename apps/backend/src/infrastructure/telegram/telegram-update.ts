/**
 * Разбор обновления Telegram: что нам вообще нужно из тела запроса.
 *
 * Вынесено отдельной чистой функцией нарочно. Тело вебхука не описывается классом-DTO:
 * в обновлении Telegram десятки полей, и состав их меняется на их стороне — строгая
 * проверка (`whitelist` + `forbidNonWhitelisted`) отвергала бы КАЖДОЕ настоящее обновление.
 * Поэтому читаются ровно два значения, и читаются они здесь, где их можно проверить тестом.
 *
 * Ничему в теле не доверяем: подлинность запроса даёт секрет в адресе, а ответ уходит
 * только в тот чат, который сам и привязан.
 */

export interface TelegramMessage {
  chatId: string;
  text: string;
}

export const readTelegramMessage = (update: unknown): TelegramMessage | null => {
  if (update === null || typeof update !== 'object') return null;
  const message = (update as { message?: unknown }).message;
  if (message === null || typeof message !== 'object') return null;

  const chat = (message as { chat?: unknown }).chat;
  const rawId =
    chat !== null && typeof chat === 'object' ? (chat as { id?: unknown }).id : undefined;
  /* Идентификатор чата приходит числом, а у групп — отрицательным. Строкой он и хранится. */
  const chatId =
    typeof rawId === 'number' && Number.isFinite(rawId)
      ? String(rawId)
      : typeof rawId === 'string' && rawId.trim() !== ''
        ? rawId.trim()
        : null;
  if (chatId === null) return null;

  const rawText = (message as { text?: unknown }).text;
  const text = typeof rawText === 'string' ? rawText.trim() : '';
  if (text === '') return null;

  return { chatId, text };
};
