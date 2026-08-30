import { describe, expect, it } from 'vitest';

import { InMemoryVideoProviderSettingsRepository } from './in-memory-video-provider-settings.repository.js';
import { VideoProviderSettingsController } from './video-provider-settings.controller.js';
import { VideoProviderSettingsService } from './video-provider-settings.service.js';

import type { RequestContext } from '../../../common/context/request-context.js';

/**
 * Настройка видеопоставщика центром (журнал 309).
 *
 * Право `video.configure` выдавалось администрации миграцией `0063`, служба и оба хранилища
 * существовали — а вызвать `save()` было неоткуда. Пока настройки нет, разрешитель отдаёт
 * `noop`, то есть видео не работает ни у кого и включить его нельзя.
 *
 * Отдельный контроллер, а не новая зависимость у `VideoController`: конструктор последнего
 * собирается руками в 13 местах тестов, и добавление в него зависимости роняет сборку
 * приложения молча (грабля из §5.395).
 */
const ctxFor = (tenantId: string) =>
  ({ tenantId, userId: 'u_1', requestId: 'r1', correlationId: 'c1' }) as RequestContext;

function harness() {
  const settings = new VideoProviderSettingsService(new InMemoryVideoProviderSettingsRepository());
  return { controller: new VideoProviderSettingsController(settings), settings };
}

describe('VideoProviderSettingsController — настройка видеопоставщика', () => {
  it('без сохранённых настроек отдаёт безопасный вид: выключено и noop', async () => {
    const h = harness();

    const result = await h.controller.getSettings(ctxFor('t1'));

    expect(result.providerCode).toBe('noop');
    expect(result.enabled).toBe(false);
  });

  it('сохранённое возвращается следующим чтением', async () => {
    const h = harness();

    await h.controller.saveSettings(ctxFor('t1'), {
      providerCode: 'kinescope',
      baseUrl: 'https://api.kinescope.io',
      enabled: true
    });
    const result = await h.controller.getSettings(ctxFor('t1'));

    expect(result.providerCode).toBe('kinescope');
    expect(result.baseUrl).toBe('https://api.kinescope.io');
    expect(result.enabled).toBe(true);
  });

  it('настройка одного центра не видна соседнему', async () => {
    const h = harness();

    await h.controller.saveSettings(ctxFor('t1'), { providerCode: 'kinescope', enabled: true });
    const neighbour = await h.controller.getSettings(ctxFor('t2'));

    expect(neighbour.providerCode).toBe('noop');
    expect(neighbour.enabled).toBe(false);
  });

  it('неизвестный поставщик отбивается ДО службы', async () => {
    const h = harness();

    expect(() =>
      h.controller.saveSettings(ctxFor('t1'), { providerCode: 'youtube', enabled: true })
    ).toThrow(/providerCode/);
    await expect(h.controller.getSettings(ctxFor('t1'))).resolves.toMatchObject({
      providerCode: 'noop'
    });
  });

  it('пропущенный признак «включено» отбивается', () => {
    const h = harness();

    expect(() => h.controller.saveSettings(ctxFor('t1'), { providerCode: 'kinescope' })).toThrow(
      /enabled/
    );
  });
});
