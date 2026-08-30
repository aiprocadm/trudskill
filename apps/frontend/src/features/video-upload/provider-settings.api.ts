import { apiRequest } from '../../lib/api/client';

/**
 * Настройка видеопоставщика центра (ФТ-B1.1, право `video.configure`).
 *
 * Отдельный модуль рядом с загрузкой видео: у `api.ts` своя договорённость — он получает
 * сессию параметром, а секции экрана настроек (оплата, вебинары) ходят без неё. Смешивать
 * две договорённости в одном файле — верный способ забыть, какая тут действует.
 */
export const VIDEO_PROVIDER_CODES = ['noop', 'fake', 'selfhosted', 'kinescope', 'vk'] as const;
export type VideoProviderCode = (typeof VIDEO_PROVIDER_CODES)[number];

/** Русские подписи: код поставщика человеку ничего не говорит. */
export const VIDEO_PROVIDER_LABELS: Record<VideoProviderCode, string> = {
  noop: 'Видео выключено',
  fake: 'Проверочный (только для тестового стенда)',
  selfhosted: 'Своё хранилище центра',
  kinescope: 'Kinescope',
  vk: 'VK Видео'
};

export interface VideoProviderSettings {
  tenantId: string;
  providerCode: VideoProviderCode;
  baseUrl?: string;
  enabled: boolean;
  updatedAt: string;
}

export interface VideoProviderSettingsInput {
  providerCode: VideoProviderCode;
  baseUrl?: string;
  enabled: boolean;
}

export const getVideoProviderSettings = (): Promise<VideoProviderSettings> =>
  apiRequest<VideoProviderSettings>('/video/provider-settings');

export const saveVideoProviderSettings = (
  input: VideoProviderSettingsInput
): Promise<VideoProviderSettings> =>
  apiRequest<VideoProviderSettings>('/video/provider-settings', { method: 'PUT', body: input });
