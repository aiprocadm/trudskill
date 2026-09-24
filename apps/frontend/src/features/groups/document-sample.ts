import { frontendEnv } from '../../lib/config/env';

import type { UserSession } from '../../entities/session/model';

export interface DocumentSampleRequest {
  templateId: string;
  groupId: string;
  enrollmentId?: string;
  kindCode?: string;
}

/**
 * МГ-F5.1 (срез 20.2): образец документа на настоящих данных группы — PDF без номера (вместо
 * номера «ОБРАЗЕЦ»). Ответ — файл, а не конверт, поэтому запрос идёт мимо `apiRequest`, как у
 * «Примера PDF» шаблона. Ошибка приходит конвертом — показываем её текст, а не код HTTP.
 */
export async function fetchSamplePdfUrl(
  session: UserSession,
  body: DocumentSampleRequest
): Promise<string> {
  const res = await fetch(`${frontendEnv.NEXT_PUBLIC_API_BASE_URL}/documents/sample`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${session.tokens.accessToken}`,
      'x-tenant-id': session.user.tenantId,
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    let message = 'Образец собрать не удалось. Повторите через минуту.';
    try {
      const parsed = (await res.json()) as { error?: { message?: string } };
      if (parsed?.error?.message) message = parsed.error.message;
    } catch {
      /* тело не JSON — оставляем общий текст */
    }
    throw new Error(message);
  }
  return URL.createObjectURL(await res.blob());
}
