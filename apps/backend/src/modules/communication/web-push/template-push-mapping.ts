import type { WebPushNotification } from './web-push-sender.js';
import type { EmailTemplateBody } from '../email-templates.js';

/** Максимальная длина тела push-уведомления (после неё — обрезка с многоточием). */
const MAX_PUSH_BODY = 120;

/**
 * Чистая функция: отрендеренный email-шаблон → push-уведомление.
 * `title` = subject; `body` = первая непустая строка body, обрезанная до ~120 символов.
 * Переиспользует тот же `renderTemplate`-результат, что и email — push и письмо
 * несут идентичный текст.
 */
export function toPushNotification(
  rendered: EmailTemplateBody,
  opts?: { url?: string }
): WebPushNotification {
  const firstLine =
    rendered.body
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? '';
  const body =
    firstLine.length > MAX_PUSH_BODY ? `${firstLine.slice(0, MAX_PUSH_BODY - 1)}…` : firstLine;
  return {
    title: rendered.subject,
    body,
    ...(opts?.url ? { url: opts.url } : {})
  };
}
