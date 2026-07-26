import { NonRetryableJobError } from '../bulk-enrollment-callback.js';

/**
 * Конвертация DOCX → PDF через Gotenberg (ФТ-A1.3, Фаза 1 Task 3).
 *
 * Контракт проверен на живом `gotenberg/gotenberg:8`: `POST /forms/libreoffice/convert`,
 * multipart/form-data с полем `files`; ИМЯ файла обязано нести расширение `.docx` —
 * по нему LibreOffice выбирает конвертер. Ответ — `application/pdf` телом.
 *
 * Классификация ошибок (ФТ-A1.5) — от неё зависит судьба задачи:
 *   • сеть/таймаут/5xx → обычная Error ⇒ consume-цикл `main.ts` ретраит с backoff'ом (DLQ на исходе);
 *   • 4xx (LibreOffice не смог открыть файл) → `NonRetryableJobError` ⇒ повтор бессмыслен,
 *     вызывающий помечает задачу `failed` с человекочитаемым текстом.
 */

const CONVERT_PATH = '/forms/libreoffice/convert';
const DEFAULT_TIMEOUT_MS = 120_000;
const PDF_MAGIC = '%PDF-';

export interface GotenbergDeps {
  gotenbergUrl: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

export async function convertDocxToPdf(docx: Buffer, deps: GotenbergDeps): Promise<Buffer> {
  const fetchFn = deps.fetchFn ?? globalThis.fetch;
  const url = `${deps.gotenbergUrl.replace(/\/$/, '')}${CONVERT_PATH}`;
  const form = new FormData();
  form.append('files', new Blob([new Uint8Array(docx)]), 'document.docx');

  let res: Response;
  try {
    res = await fetchFn(url, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(deps.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    });
  } catch (error) {
    // Сеть/таймаут — Gotenberg может подняться к следующей попытке.
    throw new Error(
      `gotenberg unreachable: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    if (res.status >= 400 && res.status < 500) {
      throw new NonRetryableJobError(
        `Не удалось преобразовать документ в PDF (Gotenberg ${res.status}): ${detail}`
      );
    }
    throw new Error(`gotenberg convert failed http=${res.status} body=${detail}`);
  }

  const pdf = Buffer.from(await res.arrayBuffer());
  if (pdf.subarray(0, PDF_MAGIC.length).toString('latin1') !== PDF_MAGIC) {
    // 200, но тело — не PDF: считаем сбоем сервиса, а не документа.
    throw new Error('gotenberg returned a non-PDF payload');
  }
  return pdf;
}
