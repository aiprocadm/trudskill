/**
 * Ошибка конвертации. `retryable=false` означает «повтор бессмыслен» (LibreOffice не смог
 * открыть документ) — вызывающая сторона решает, что с этим делать: воркер помечает задачу
 * `failed` и подтверждает сообщение, админский предпросмотр показывает текст пользователю.
 * Пакет намеренно не знает про очереди и не тянет их типы ошибок.
 */
export class DocumentConversionError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean
  ) {
    super(message);
    this.name = 'DocumentConversionError';
  }
}

/**
 * Конвертация DOCX → PDF через Gotenberg (ФТ-A1.3, Фаза 1 Task 3).
 *
 * Контракт проверен на живом `gotenberg/gotenberg:8`: `POST /forms/libreoffice/convert`,
 * multipart/form-data с полем `files`; ИМЯ файла обязано нести расширение `.docx` —
 * по нему LibreOffice выбирает конвертер. Ответ — `application/pdf` телом.
 *
 * Классификация ошибок (ФТ-A1.5) — от неё зависит судьба задачи:
 *   • сеть/таймаут/5xx/не-PDF-тело → `retryable: true` ⇒ имеет смысл повторить;
 *   • 4xx (LibreOffice не смог открыть файл) → `retryable: false` ⇒ повтор бессмыслен.
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
    throw new DocumentConversionError(
      `gotenberg unreachable: ${error instanceof Error ? error.message : String(error)}`,
      true
    );
  }

  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    if (res.status >= 400 && res.status < 500) {
      throw new DocumentConversionError(
        `Не удалось преобразовать документ в PDF (Gotenberg ${res.status}): ${detail}`,
        false
      );
    }
    throw new DocumentConversionError(
      `gotenberg convert failed http=${res.status} body=${detail}`,
      true
    );
  }

  const pdf = Buffer.from(await res.arrayBuffer());
  if (pdf.subarray(0, PDF_MAGIC.length).toString('latin1') !== PDF_MAGIC) {
    // 200, но тело — не PDF: считаем сбоем сервиса, а не документа.
    throw new DocumentConversionError('gotenberg returned a non-PDF payload', true);
  }
  return pdf;
}
