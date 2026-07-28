import { apiRequest } from '../../lib/api/client';
import { frontendEnv } from '../../lib/config/env';

import type { UserSession } from '../../entities/session/model';

/**
 * Загрузка и разбор бланков документов (ФТ-A3, Фаза 1 Task 5b).
 *
 * Раньше админ вписывал `fileId` руками — значение брали «из backend файлов», то есть
 * страница была непригодна для реального пользователя. Теперь: выбрал .docx → интент →
 * прямой PUT в хранилище → создание версии → разбор плейсхолдеров → предпросмотр PDF.
 */

/** MIME DOCX: сервер подписывает интент именно им, и PUT обязан прислать тот же заголовок. */
export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export interface TemplateUploadIntent {
  fileId: string;
  uploadUrl: string;
  storageKey: string;
  expiresInSeconds: number;
}

export interface TemplatePlaceholder {
  code: string;
  category: string;
  description: string;
}

/** ФТ-A8: реквизит протокола из п. 92 ПП 2464, которого в бланке не нашлось. */
export interface ProtocolRequirementGap {
  code: string;
  title: string;
  basis: string;
  expected: string[];
}

export interface TemplateParseResult {
  templateVersionId: string;
  placeholders: string[];
  known: TemplatePlaceholder[];
  unknown: string[];
  /** ФТ-A7.1: теги-картинки `{%…}` — подпись и печать, найденные в бланке. */
  imagePlaceholders?: string[];
  /** Мягкие замечания по синтаксису: например, картинку вставили обычным тегом. */
  warnings?: string[];
  /**
   * ФТ-A8 — приходит только для шаблонов типа `protocol`. Мягкая проверка:
   * пропущенный реквизит не блокирует загрузку, но админ должен узнать о нём
   * от нас, а не от инспектора.
   */
  compliance?: {
    isCompliant: boolean;
    missing: ProtocolRequirementGap[];
  };
}

const auth = (session: UserSession) => ({
  accessToken: session.tokens.accessToken,
  tenantId: session.user.tenantId,
  userId: session.user.id
});

export const templatesApi = {
  uploadUrl: (session: UserSession, input: { originalName: string; sizeBytes: number }) =>
    apiRequest<TemplateUploadIntent>('/templates/upload-url', {
      method: 'POST',
      body: input,
      auth: auth(session)
    }),

  createVersion: (session: UserSession, input: { templateId: string; fileId: string }) =>
    apiRequest<{ id: string }>('/template-versions', {
      method: 'POST',
      body: input,
      auth: auth(session)
    }),

  activateVersion: (session: UserSession, versionId: string) =>
    apiRequest<unknown>(`/template-versions/${versionId}/activate`, {
      method: 'POST',
      auth: auth(session)
    }),

  parseVariables: (session: UserSession, versionId: string) =>
    apiRequest<TemplateParseResult>(`/template-versions/${versionId}/parse-variables`, {
      method: 'POST',
      auth: auth(session)
    })
};

/**
 * Прямой PUT в presigned-URL (мимо конверта API). `contentType` обязан совпасть с тем, чем
 * подписан интент, иначе хранилище ответит 403 — у .docx `file.type` бывает пустым
 * (тот же подводный камень задокументирован в SCORM-загрузке).
 */
export async function putTemplateFile(uploadUrl: string, file: File): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': DOCX_MIME },
    body: file
  });
  if (!res.ok) throw new Error(`Не удалось загрузить файл в хранилище (HTTP ${res.status})`);
}

/**
 * Предпросмотр: сервер отдаёт PDF бинарно (не конверт), поэтому идём мимо `apiRequest`
 * и возвращаем object-URL для показа в новой вкладке.
 */
export async function fetchPreviewPdfUrl(session: UserSession, versionId: string): Promise<string> {
  const res = await fetch(
    `${frontendEnv.NEXT_PUBLIC_API_BASE_URL}/template-versions/${versionId}/preview`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${session.tokens.accessToken}`,
        'x-tenant-id': session.user.tenantId
      }
    }
  );
  if (!res.ok) {
    // Ошибки предпросмотра приходят конвертом с человекочитаемым текстом.
    let message = `Предпросмотр не удался (HTTP ${res.status})`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body?.error?.message) message = body.error.message;
    } catch {
      /* тело не JSON — оставляем общий текст */
    }
    throw new Error(message);
  }
  return URL.createObjectURL(await res.blob());
}
