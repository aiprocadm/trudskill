import type {
  CreateUploadTargetInput,
  PlaybackContext,
  PlaybackSource,
  UploadTarget,
  VideoAssetEvent,
  VideoProvider
} from './video.provider.js';

/**
 * ТОЛЬКО для dev/staging и тестов. Отдаёт синтетические цели загрузки и воспроизведения и
 * принимает синтетический вебхук — так весь путь «загрузил → обработалось → играет»
 * прогоняется без единого внешнего сервиса. В production запрещён резолвером
 * (`VideoProviderResolver`): выдать фальшивое видео за настоящее нельзя. URL самопомечены
 * схемой `fake-video://`, чтобы их нельзя было спутать с рабочими.
 */
export class FakeVideoProvider implements VideoProvider {
  readonly code = 'fake' as const;

  async createUploadTarget(input: CreateUploadTargetInput): Promise<UploadTarget | null> {
    return {
      providerAssetId: `fake-video:${input.assetId}`,
      uploadUrl: `fake-video://staging/upload/${input.assetId}`
    };
  }

  async getPlayback(ctx: PlaybackContext): Promise<PlaybackSource | null> {
    if (!ctx.providerAssetId) return null;
    return {
      url: `fake-video://staging/play/${ctx.providerAssetId}/index.m3u8`,
      kind: 'hls',
      expiresInSeconds: 600
    };
  }

  async parseWebhook(raw: Buffer): Promise<VideoAssetEvent[] | null> {
    try {
      const body = JSON.parse(raw.toString('utf8')) as { events?: unknown };
      if (!Array.isArray(body.events)) return null;
      const out: VideoAssetEvent[] = [];
      for (const raw of body.events as Record<string, unknown>[]) {
        if (
          typeof raw.providerAssetId !== 'string' ||
          (raw.type !== 'ready' && raw.type !== 'failed')
        ) {
          return null;
        }
        out.push({
          providerAssetId: raw.providerAssetId,
          type: raw.type,
          ...(typeof raw.durationSeconds === 'number'
            ? { durationSeconds: raw.durationSeconds }
            : {}),
          ...(typeof raw.errorMessage === 'string' ? { errorMessage: raw.errorMessage } : {})
        });
      }
      return out;
    } catch {
      return null;
    }
  }
}
