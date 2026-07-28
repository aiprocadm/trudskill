import { describe, expect, it } from 'vitest';

import { InMemoryVideoProviderSettingsRepository } from './in-memory-video-provider-settings.repository.js';
import { VideoProviderResolver } from './video-provider-resolver.service.js';
import { VideoProviderSettingsService } from './video-provider-settings.service.js';
import { FakeVideoProvider } from '../../../infrastructure/video-provider/fake-video.provider.js';
import {
  NoopVideoProvider,
  type VideoProvider,
  type VideoProviderCode,
  type VideoProviderRegistry
} from '../../../infrastructure/video-provider/video.provider.js';

/** Выбор видео-провайдера пер тенант (ФТ-B1.1, Фаза 2 Task 1). */

const registry = (): VideoProviderRegistry =>
  new Map<VideoProviderCode, VideoProvider>([
    ['noop', new NoopVideoProvider()],
    ['fake', new FakeVideoProvider()]
  ]);

function makeResolver(nodeEnv = 'test') {
  const repo = new InMemoryVideoProviderSettingsRepository();
  const settings = new VideoProviderSettingsService(repo);
  return { repo, settings, resolver: new VideoProviderResolver(registry(), settings, nodeEnv) };
}

describe('VideoProviderResolver', () => {
  it('тенант без настроек получает noop — новый УЦ не должен падать на странице курса', async () => {
    const { resolver } = makeResolver();
    expect((await resolver.forTenant('tenant_new')).code).toBe('noop');
  });

  it('сохранённый, но выключенный провайдер не используется', async () => {
    const { resolver, settings } = makeResolver();
    await settings.save('t1', { providerCode: 'fake', enabled: false });
    expect((await resolver.forTenant('t1')).code).toBe('noop');
  });

  it('включённый провайдер берётся из реестра', async () => {
    const { resolver, settings } = makeResolver();
    await settings.save('t1', { providerCode: 'fake', enabled: true });
    expect((await resolver.forTenant('t1')).code).toBe('fake');
  });

  it('в production fake принудительно опускается до noop — фальшивое видео за настоящее не выдаём', async () => {
    const { resolver, settings } = makeResolver('production');
    await settings.save('t1', { providerCode: 'fake', enabled: true });
    expect((await resolver.forTenant('t1')).code).toBe('noop');
  });

  it('провайдер, которого нет в реестре, не роняет запрос', async () => {
    const { resolver, settings } = makeResolver();
    await settings.save('t1', { providerCode: 'kinescope', enabled: true });
    expect((await resolver.forTenant('t1')).code).toBe('noop');
  });

  it('настройки одного тенанта не видны другому', async () => {
    const { resolver, settings } = makeResolver();
    await settings.save('t1', { providerCode: 'fake', enabled: true });
    expect((await resolver.forTenant('t2')).code).toBe('noop');
  });
});

describe('VideoProviderSettingsService', () => {
  it('по умолчанию отдаёт безопасный вид: noop и выключено', async () => {
    const { settings } = makeResolver();
    const cfg = await settings.get('tenant_new');
    expect(cfg).toMatchObject({ tenantId: 'tenant_new', providerCode: 'noop', enabled: false });
  });

  it('сохранение возвращает то, что записано, вместе с базовым URL', async () => {
    const { settings } = makeResolver();
    const saved = await settings.save('t1', {
      providerCode: 'kinescope',
      enabled: true,
      baseUrl: 'https://api.example.org'
    });
    expect(saved).toMatchObject({ providerCode: 'kinescope', enabled: true });
    expect(saved.baseUrl).toBe('https://api.example.org');
    expect((await settings.get('t1')).providerCode).toBe('kinescope');
  });
});
