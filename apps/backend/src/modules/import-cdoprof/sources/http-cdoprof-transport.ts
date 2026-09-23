/**
 * Живой транспорт к API CDOPROF (ТЗ §13.1: «HTTP GET постранично (≤100) из стенда миграции с
 * разрешённым IP»).
 *
 * Три правила, каждое — из ограничения источника:
 *
 *   • **пауза между запросами** — лимиты частоты у CDOPROF неизвестны («? — проверить»), а полная
 *     выгрузка обучений — 1 622 вызова; пауза по умолчанию 300 мс, настраивается;
 *   • **повторы с растущей задержкой** на 429/5xx и сетевых ошибках — выгрузка на ~2 000 запросов
 *     не должна падать из-за одного чиха сервера; 401/403 не повторяются: ключ или IP не
 *     подходят, и повтор ничего не изменит;
 *   • **ключ не утекает** — ни в сообщение об ошибке, ни в адрес, который попадает в журнал.
 */
import { CdoprofApiError, redactApiKey } from './cdoprof-transport.js';

import type { CdoprofQuery, CdoprofTransport } from './cdoprof-transport.js';

export interface HttpCdoprofTransportOptions {
  baseUrl: string;
  apiKey: string;
  /** Пауза между последовательными запросами, мс. По умолчанию 300. */
  pauseMs?: number;
  /** Сколько раз повторить запрос при 429/5xx/сетевой ошибке. По умолчанию 3. */
  maxRetries?: number;
  /** Базовая задержка перед повтором, мс; удваивается с каждой попыткой. По умолчанию 1000. */
  retryBaseMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const RETRYABLE_STATUS = (status: number): boolean => status === 429 || status >= 500;

export class HttpCdoprofTransport implements CdoprofTransport {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly pauseMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private requestsMade = 0;

  constructor(options: HttpCdoprofTransportOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.apiKey = options.apiKey;
    this.pauseMs = options.pauseMs ?? 300;
    this.maxRetries = options.maxRetries ?? 3;
    this.retryBaseMs = options.retryBaseMs ?? 1000;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.sleep = options.sleep ?? defaultSleep;
  }

  async get(method: string, query: CdoprofQuery = {}): Promise<unknown> {
    const url = this.buildUrl(method, query);
    if (this.requestsMade > 0 && this.pauseMs > 0) {
      await this.sleep(this.pauseMs);
    }
    this.requestsMade += 1;

    let attempt = 0;
    for (;;) {
      const outcome = await this.tryOnce(url);
      if (outcome.kind === 'ok') return outcome.body;
      if (!outcome.retryable || attempt >= this.maxRetries) throw outcome.error;
      await this.sleep(this.retryBaseMs * 2 ** attempt);
      attempt += 1;
    }
  }

  private buildUrl(method: string, query: CdoprofQuery): string {
    const url = new URL(`${this.baseUrl}/api/v1/${method}`);
    url.searchParams.set('api_key', this.apiKey);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  private async tryOnce(
    url: string
  ): Promise<
    { kind: 'ok'; body: unknown } | { kind: 'fail'; error: CdoprofApiError; retryable: boolean }
  > {
    let response: Response;
    try {
      response = await this.fetchImpl(url, { headers: { accept: 'application/json' } });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return {
        kind: 'fail',
        retryable: true,
        error: new CdoprofApiError(
          'network_error',
          `Сетевая ошибка при запросе к CDOPROF: ${reason}`
        )
      };
    }

    const safeUrl = redactApiKey(url);
    if (response.status === 401 || response.status === 403) {
      return {
        kind: 'fail',
        retryable: false,
        error: new CdoprofApiError(
          'unauthorized',
          `CDOPROF отверг ключ API или IP стенда (HTTP ${response.status}) — ${safeUrl}`,
          response.status
        )
      };
    }
    if (!response.ok) {
      return {
        kind: 'fail',
        retryable: RETRYABLE_STATUS(response.status),
        error: new CdoprofApiError(
          'http_error',
          `CDOPROF ответил HTTP ${response.status} — ${safeUrl}`,
          response.status
        )
      };
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return {
        kind: 'fail',
        retryable: false,
        error: new CdoprofApiError(
          'invalid_json',
          `CDOPROF ответил не JSON — ${safeUrl}`,
          response.status
        )
      };
    }

    if (body && typeof body === 'object' && (body as { success?: unknown }).success === false) {
      const message =
        (body as { message?: unknown; error?: unknown }).message ??
        (body as { error?: unknown }).error ??
        'без пояснения';
      return {
        kind: 'fail',
        retryable: false,
        error: new CdoprofApiError(
          'api_error',
          `CDOPROF вернул success=false: ${String(message)} — ${safeUrl}`
        )
      };
    }

    return { kind: 'ok', body };
  }
}
