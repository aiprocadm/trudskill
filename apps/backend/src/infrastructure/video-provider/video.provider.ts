/**
 * Шов видео-провайдера (ФТ-B1.1, Фаза 2 Task 1) — по форме `WebinarProvider` (`0055`):
 * активный провайдер выбирается ПЕР ТЕНАНТ, а не одним глобальным env-переключателем,
 * потому что разные учебные центры могут сидеть на разных сервисах.
 *
 * `noop` — безопасный дефолт для любого тенанта без настроенного провайдера: он ничего
 * не умеет и честно отвечает `null`, вместо того чтобы падать. Реальные адаптеры
 * (провайдер или self-hosted) подключаются в реестр в Task 10 — от ответа на открытый
 * вопрос №1 зависит только он, а весь остальной код Фазы 2 пишется против этого шва.
 */
/** Перечень кодов — один источник и для типа, и для проверки тела запроса (как у платежей). */
export const VIDEO_PROVIDER_CODES = ['noop', 'fake', 'selfhosted', 'kinescope', 'vk'] as const;
export type VideoProviderCode = (typeof VIDEO_PROVIDER_CODES)[number];

/** Куда методисту лить файл: прямо провайдеру или в наш S3 (self-hosted). */
export interface CreateUploadTargetInput {
  tenantId: string;
  assetId: string;
  fileName: string;
  sizeBytes: number;
  contentType: string;
}

export interface UploadTarget {
  /** Идентификатор ассета на стороне провайдера (для self-hosted — пусто). */
  providerAssetId?: string;
  /** URL, куда клиент кладёт файл. */
  uploadUrl: string;
  /** Заголовки, которые обязан прислать клиент (провайдеры часто требуют свои). */
  headers?: Record<string, string>;
}

/** Источник воспроизведения: HLS-манифест или готовая ссылка провайдера. */
export interface PlaybackSource {
  url: string;
  kind: 'hls' | 'progressive';
  /** Сколько секунд ссылка действительна — плеер обязан обновить её до истечения. */
  expiresInSeconds: number;
}

export interface PlaybackContext {
  tenantId: string;
  providerAssetId?: string;
  storageKey?: string;
}

/** Событие вебхука провайдера: обработка закончилась успехом или отказом. */
export interface VideoAssetEvent {
  providerAssetId: string;
  type: 'ready' | 'failed';
  durationSeconds?: number;
  errorMessage?: string;
}

export interface VideoProvider {
  readonly code: VideoProviderCode;
  /** `null` = провайдер спит/недоступен; ассет всё равно создан (fail-soft, как у вебинаров). */
  createUploadTarget(input: CreateUploadTargetInput): Promise<UploadTarget | null>;
  /** `null` = воспроизвести нечем (не готово или провайдер спит). */
  getPlayback(ctx: PlaybackContext): Promise<PlaybackSource | null>;
  /** Подпись проверяется внутри; `null` для неопознанного или неподписанного payload. */
  parseWebhook(
    raw: Buffer,
    headers: Record<string, string | undefined>
  ): Promise<VideoAssetEvent[] | null>;
  /**
   * Необязательное тело ответа на вебхук: некоторые провайдеры ждут точный ack и давятся
   * нашим конвертом `{ data, meta }`. Зеркало `WebinarProvider.webhookAck`.
   */
  webhookAck?(events: VideoAssetEvent[] | null): string | Record<string, unknown>;
}

/** DI-токен реестра всех вкомпилированных провайдеров (Map<code, provider>). */
export const VIDEO_PROVIDER_REGISTRY = Symbol('VIDEO_PROVIDER_REGISTRY');
export type VideoProviderRegistry = Map<VideoProviderCode, VideoProvider>;

export class NoopVideoProvider implements VideoProvider {
  readonly code = 'noop' as const;
  async createUploadTarget(): Promise<UploadTarget | null> {
    return null;
  }
  async getPlayback(): Promise<PlaybackSource | null> {
    return null;
  }
  async parseWebhook(): Promise<VideoAssetEvent[] | null> {
    return null;
  }
}
