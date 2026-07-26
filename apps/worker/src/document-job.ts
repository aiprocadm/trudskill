import { NonRetryableJobError } from './bulk-enrollment-callback.js';
import { TemplateRenderError, renderDocx } from './render/docx-render.js';
import { convertDocxToPdf } from './render/gotenberg-convert.js';

/**
 * Обработка job'а `document` (Фаза 1 Task 2, ФТ-A1.1): claim задачи через internal-эндпоинт
 * backend'а → скачивание DOCX-шаблона по presigned GET → рендер → загрузка результата по
 * presigned PUT → complete. Ошибки ШАБЛОНА терминальны (fail + ack), ошибки ТРАНСПОРТА
 * бросаются наружу — ретраи с backoff'ом и DLQ решает consume-цикл main.ts (decideRetry).
 * Race «сообщение обогнало сохранение состояния»: start отвечает 404 → бросаем retryable.
 */

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PDF_MIME = 'application/pdf';
const INTERNAL_DOCUMENTS_PATH = '/api/v1/internal/worker/documents';

export interface DocumentJobEnvelope {
  readonly messageId: string;
  readonly tenantId: string;
  readonly payload: Record<string, unknown>;
}

export interface DocumentJobDeps {
  backendPublicUrl: string;
  callbackToken: string | undefined;
  /** База Gotenberg для конвертации DOCX→PDF (ФТ-A1.3). */
  gotenbergUrl: string;
  fetchFn?: typeof fetch;
}

interface StartResponse {
  claimed: boolean;
  status?: string;
  taskId?: string;
  number?: string;
  templateFileUrl?: string;
  variables?: Record<string, unknown>;
}

export async function runDocumentJob(
  envelope: DocumentJobEnvelope,
  deps: DocumentJobDeps
): Promise<void> {
  if (!deps.callbackToken) {
    throw new NonRetryableJobError('WORKER_CALLBACK_TOKEN is not set — cannot render documents');
  }
  const fetchFn = deps.fetchFn ?? globalThis.fetch;
  const taskId = String(envelope.payload.taskId ?? '');
  if (!taskId) {
    throw new NonRetryableJobError('document job payload has no taskId');
  }
  const base = deps.backendPublicUrl.replace(/\/$/, '');
  const call = async (endpoint: string, body: Record<string, unknown>): Promise<unknown> => {
    const res = await fetchFn(`${base}${INTERNAL_DOCUMENTS_PATH}/${endpoint}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-worker-callback-token': deps.callbackToken!
      },
      body: JSON.stringify({ tenantId: envelope.tenantId, taskId, ...body })
    });
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    if (!res.ok) {
      const code = (parsed as { error?: { code?: string } } | null)?.error?.code ?? '';
      if (res.status === 404 || code === 'not_found') {
        // Состояние тенанта ещё не сохранено HTTP-запросом, создавшим задачу, — ретрай.
        throw new Error(`document task not visible yet (http=${res.status}) — retrying`);
      }
      if (code === 'forbidden' || code === 'worker_callback_invalid') {
        throw new NonRetryableJobError(`documents callback rejected: ${code}`);
      }
      throw new Error(`documents ${endpoint} failed http=${res.status} body=${text.slice(0, 300)}`);
    }
    return (parsed as { data?: unknown } | null)?.data ?? parsed;
  };

  const start = (await call('start', {})) as StartResponse;
  if (!start.claimed) {
    return; // дубль сообщения по терминальной задаче — молча ack
  }
  if (!start.templateFileUrl) {
    await call('fail', { message: 'Template version has no downloadable file' });
    return;
  }

  const templateRes = await fetchFn(start.templateFileUrl);
  if (!templateRes.ok) {
    throw new Error(`template download failed http=${templateRes.status}`);
  }
  const templateBuffer = Buffer.from(await templateRes.arrayBuffer());

  let rendered: Buffer;
  try {
    rendered = renderDocx(templateBuffer, start.variables ?? {});
  } catch (error) {
    if (error instanceof TemplateRenderError) {
      // Ошибка шаблона терминальна: fail с человекочитаемым сообщением (ФТ-A1.5) и ack.
      await call('fail', { message: error.problems.join('; ').slice(0, 900) });
      return;
    }
    throw error;
  }

  // ФТ-A1.3: храним ОБА формата. PDF — то, что печатают и подписывают; DOCX остаётся
  // исходником для перевыпуска. Сбой конвертации не должен терять уже отрендеренный DOCX,
  // поэтому PDF готовим до загрузки: либо кладём пару, либо задача честно падает.
  let pdf: Buffer;
  try {
    pdf = await convertDocxToPdf(rendered, {
      gotenbergUrl: deps.gotenbergUrl,
      ...(deps.fetchFn ? { fetchFn: deps.fetchFn } : {})
    });
  } catch (error) {
    if (error instanceof NonRetryableJobError) {
      // LibreOffice не смог открыть документ — повтор бессмыслен, помечаем задачу failed.
      await call('fail', { message: error.message.slice(0, 900) });
      return;
    }
    throw error; // сеть/таймаут/5xx — ретрай с backoff'ом
  }

  const upload = async (body: Buffer, contentType: string): Promise<string> => {
    const intent = (await call('result-upload-intent', {
      sizeBytes: body.length,
      contentType
    })) as { fileId: string; uploadUrl: string };
    const putRes = await fetchFn(intent.uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': contentType, 'content-length': String(body.length) },
      body: new Uint8Array(body)
    });
    if (!putRes.ok) {
      throw new Error(`result upload failed http=${putRes.status}`);
    }
    return intent.fileId;
  };

  const fileId = await upload(rendered, DOCX_MIME);
  const pdfFileId = await upload(pdf, PDF_MIME);

  await call('complete', {
    fileId,
    pdfFileId,
    // ФТ-A1.4: снапшот подставленных данных — из него перевыпуск даёт идентичный файл.
    variablesSnapshot: start.variables ?? {}
  });
}
