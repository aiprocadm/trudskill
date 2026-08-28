import { describe, expect, it } from 'vitest';

import { FakeVideoProvider } from './fake-video.provider.js';
import { NoopVideoProvider, type VideoProvider } from './video.provider.js';

/**
 * Шов видео-провайдера (ФТ-B1.1, Фаза 2 Task 1).
 *
 * Главное свойство `noop`: он МОЛЧА отказывает, а не бросает. Тенант без настроенного
 * провайдера не должен ронять страницу курса — видео просто не воспроизводится.
 */
describe('NoopVideoProvider', () => {
  // Тип интерфейса, а не класса: тест зовёт шов так же, как продукт.
  const noop: VideoProvider = new NoopVideoProvider();

  it('на всё отвечает null и ничего не бросает', async () => {
    await expect(
      noop.createUploadTarget({
        tenantId: 't',
        assetId: 'a',
        fileName: 'lesson.mp4',
        sizeBytes: 1,
        contentType: 'video/mp4'
      })
    ).resolves.toBeNull();
    await expect(noop.getPlayback({ tenantId: 't' })).resolves.toBeNull();
    await expect(noop.parseWebhook(Buffer.from('{}'), {})).resolves.toBeNull();
  });

  it('называет себя noop — по коду резолвер и отличает его от рабочего провайдера', () => {
    expect(noop.code).toBe('noop');
  });
});

describe('FakeVideoProvider (staging-only)', () => {
  const fake: VideoProvider = new FakeVideoProvider();

  it('выдаёт цель загрузки, самопомеченную как ненастоящую', async () => {
    const target = await fake.createUploadTarget({
      tenantId: 't',
      assetId: 'asset_1',
      fileName: 'lesson.mp4',
      sizeBytes: 10,
      contentType: 'video/mp4'
    });
    expect(target?.providerAssetId).toBe('fake-video:asset_1');
    // Схема `fake-video://` не даст перепутать staging с рабочим URL.
    expect(target?.uploadUrl.startsWith('fake-video://')).toBe(true);
  });

  it('без идентификатора у провайдера воспроизводить нечего', async () => {
    await expect(fake.getPlayback({ tenantId: 't' })).resolves.toBeNull();
  });

  it('отдаёт HLS-источник с конечным сроком жизни', async () => {
    const source = await fake.getPlayback({ tenantId: 't', providerAssetId: 'fake-video:asset_1' });
    expect(source?.kind).toBe('hls');
    expect(source?.expiresInSeconds).toBeGreaterThan(0);
  });

  it('разбирает вебхук готовности с длительностью', async () => {
    const events = await fake.parseWebhook(
      Buffer.from(
        JSON.stringify({
          events: [{ providerAssetId: 'fake-video:asset_1', type: 'ready', durationSeconds: 620 }]
        })
      ),
      {}
    );
    expect(events).toEqual([
      { providerAssetId: 'fake-video:asset_1', type: 'ready', durationSeconds: 620 }
    ]);
  });

  it('мусор и неизвестный тип события отвергаются как null, а не принимаются на веру', async () => {
    await expect(fake.parseWebhook(Buffer.from('не json'), {})).resolves.toBeNull();
    await expect(fake.parseWebhook(Buffer.from('{"events":"нет"}'), {})).resolves.toBeNull();
    await expect(
      fake.parseWebhook(
        Buffer.from(JSON.stringify({ events: [{ providerAssetId: 'x', type: 'взорвись' }] })),
        {}
      )
    ).resolves.toBeNull();
  });
});
