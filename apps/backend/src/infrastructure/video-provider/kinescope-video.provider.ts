import { createHmac, timingSafeEqual } from 'node:crypto';

import type {
  CreateUploadTargetInput,
  PlaybackContext,
  PlaybackSource,
  UploadTarget,
  VideoAssetEvent,
  VideoProvider
} from './video.provider.js';

/**
 * Адаптер готового видеосервиса Kinescope (ФТ-B1.2, Фаза 2 Task 10).
 *
 * Решение владельца по открытому вопросу №1 (2026-07-28): «берём готовый видеосервис».
 * Выбран Kinescope — он первым назван в ТЗ §4, российский (важно для 152-ФЗ) и снимает
 * с нас самую рискованную часть self-hosted — отдачу видео под нагрузкой.
 *
 * Контракт API (по документации): база `https://api.kinescope.io/v1`, авторизация
 * `Authorization: Bearer <token>`, карточка видео — `GET /videos/{id}`, событие вебхука
 * `media.update.status` с телом `{ event, data: { id, status } }`, готовность — `status: 'done'`.
 *
 * **Осознанная защита от расхождения с реальным API.** Точные имена полей в ответах могут
 * отличаться между версиями и тарифами, поэтому чтение ответа СПЕЦИАЛЬНО сделано
 * терпимым: ссылка воспроизведения и длительность ищутся среди нескольких известных
 * вариантов имён, а неизвестный ответ даёт `null` (провайдер «спит»), а не мусор в
 * плеере. Все кандидаты перечислены константами ниже — это единственное место, которое
 * нужно поправить, если аккаунт отдаёт другие имена.
 *
 * Токен и секрет вебхука приходят из env (см. `env.schema.ts`), а НЕ из таблицы настроек:
 * в БД лежит только несекретная конфигурация (правило шва из Task 1).
 */

/** Имена полей, под которыми встречается ссылка на воспроизведение. */
const PLAYBACK_URL_FIELDS = ['hls_link', 'hls_url', 'play_link', 'play_url', 'link'] as const;
/** Имена полей длительности (секунды). */
const DURATION_FIELDS = ['duration', 'duration_seconds', 'length'] as const;

/** Сколько живёт ссылка провайдера по нашим меркам: плеер перезапросит раньше срока. */
const PROVIDER_PLAYBACK_TTL_SECONDS = 600;

interface KinescopeDeps {
  apiUrl: string;
  apiToken?: string | undefined;
  webhookSecret?: string | undefined;
  /** Инжектируется в тестах; в проде — глобальный fetch. */
  fetchFn?: typeof fetch;
}

function readString(
  source: Record<string, unknown>,
  fields: readonly string[]
): string | undefined {
  for (const field of fields) {
    const value = source[field];
    if (typeof value === 'string' && value) return value;
  }
  return undefined;
}

function readNumber(
  source: Record<string, unknown>,
  fields: readonly string[]
): number | undefined {
  for (const field of fields) {
    const value = source[field];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  }
  return undefined;
}

export class KinescopeVideoProvider implements VideoProvider {
  readonly code = 'kinescope' as const;

  constructor(private readonly deps: KinescopeDeps) {}

  private get fetchFn(): typeof fetch {
    return this.deps.fetchFn ?? globalThis.fetch;
  }

  /** Без токена адаптер спит: лучше «видео недоступно», чем запрос без авторизации. */
  private get ready(): boolean {
    return Boolean(this.deps.apiToken);
  }

  private async call(path: string, init?: RequestInit): Promise<Record<string, unknown> | null> {
    if (!this.ready) return null;
    const base = this.deps.apiUrl.replace(/\/$/, '');
    try {
      const res = await this.fetchFn(`${base}${path}`, {
        ...init,
        headers: {
          authorization: `Bearer ${this.deps.apiToken!}`,
          'content-type': 'application/json',
          ...(init?.headers ?? {})
        }
      });
      if (!res.ok) return null;
      const body = (await res.json()) as unknown;
      if (!body || typeof body !== 'object') return null;
      // Ответы приходят и «плоскими», и обёрнутыми в `data` — принимаем оба вида.
      const record = body as Record<string, unknown>;
      const data = record.data;
      return data && typeof data === 'object' ? (data as Record<string, unknown>) : record;
    } catch {
      // Сеть/таймаут: провайдер считается спящим, выдача документа не срывается.
      return null;
    }
  }

  async createUploadTarget(input: CreateUploadTargetInput): Promise<UploadTarget | null> {
    const data = await this.call('/videos', {
      method: 'POST',
      body: JSON.stringify({
        title: input.fileName,
        // Свой идентификатор ассета отдаём провайдеру: по нему вебхук сопоставляется
        // с нашей записью, даже если ответ на создание потерялся.
        external_id: input.assetId,
        filename: input.fileName,
        filesize: input.sizeBytes,
        content_type: input.contentType
      })
    });
    if (!data) return null;

    const uploadUrl = readString(data, ['upload_link', 'upload_url', 'url']);
    const providerAssetId = readString(data, ['id', 'video_id']);
    if (!uploadUrl) return null;

    return {
      uploadUrl,
      ...(providerAssetId ? { providerAssetId } : {})
    };
  }

  async getPlayback(ctx: PlaybackContext): Promise<PlaybackSource | null> {
    if (!ctx.providerAssetId) return null;
    const data = await this.call(`/videos/${encodeURIComponent(ctx.providerAssetId)}`);
    if (!data) return null;

    const url = readString(data, PLAYBACK_URL_FIELDS);
    if (!url) return null;

    return {
      url,
      // HLS — то, ради чего берётся готовый сервис: адаптивный битрейт и CDN.
      kind: 'hls',
      expiresInSeconds: PROVIDER_PLAYBACK_TTL_SECONDS
    };
  }

  /**
   * Разбор вебхука `media.update.status`.
   *
   * Подпись обязательна: без секрета в env мы НЕ принимаем событие вовсе. Принимать
   * неподписанные вебхуки значит позволить кому угодно объявить чужое видео готовым —
   * и открыть слушателям доступ к необработанному ролику.
   */
  async parseWebhook(
    raw: Buffer,
    headers: Record<string, string | undefined>
  ): Promise<VideoAssetEvent[] | null> {
    if (!this.deps.webhookSecret) return null;
    if (!this.verifySignature(raw, headers)) return null;

    try {
      const body = JSON.parse(raw.toString('utf8')) as {
        event?: unknown;
        data?: unknown;
      };
      if (body.event !== 'media.update.status') return null;
      const data = body.data;
      if (!data || typeof data !== 'object') return null;

      const record = data as Record<string, unknown>;
      const providerAssetId = readString(record, ['id', 'video_id']);
      const status = readString(record, ['status']);
      if (!providerAssetId || !status) return null;

      if (status === 'done' || status === 'ready') {
        const durationSeconds = readNumber(record, DURATION_FIELDS);
        return [
          {
            providerAssetId,
            type: 'ready',
            ...(durationSeconds ? { durationSeconds } : {})
          }
        ];
      }
      if (status === 'error' || status === 'failed') {
        return [
          {
            providerAssetId,
            type: 'failed',
            errorMessage:
              readString(record, ['message', 'error', 'detail']) ??
              'Видеосервис не смог обработать файл'
          }
        ];
      }
      // Промежуточные статусы (`processing`, `uploading`) — не событие для нас:
      // ассет и так в `processing`, менять нечего.
      return [];
    } catch {
      return null;
    }
  }

  /** HMAC-SHA256 по сырому телу. Сравнение постоянное по времени — иначе подпись подбирается. */
  private verifySignature(raw: Buffer, headers: Record<string, string | undefined>): boolean {
    const provided =
      headers['x-kinescope-signature'] ?? headers['x-signature'] ?? headers['x-hub-signature-256'];
    if (!provided) return false;
    const expected = createHmac('sha256', this.deps.webhookSecret!).update(raw).digest('hex');
    // Заголовок может прийти в виде `sha256=<hex>` — отбрасываем префикс.
    const cleaned = provided.includes('=') ? provided.slice(provided.indexOf('=') + 1) : provided;
    const a = Buffer.from(cleaned, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
