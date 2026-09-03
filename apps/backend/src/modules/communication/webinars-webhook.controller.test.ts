import { ThrottlerGuard } from '@nestjs/throttler';
import { describe, expect, it } from 'vitest';

import { WebinarsWebhookController } from './webinars-webhook.controller.js';

/**
 * Обвязка публичного вебхука вебинаров. Сам разбор события покрыт в
 * `webinars.http.integration.test.ts`; здесь — то, что видно только по метаданным класса.
 */
describe('WebinarsWebhookController rate limit (ФТ-G2)', () => {
  it('handle применяет ThrottlerGuard — без него @Throttle «спит»', () => {
    // Глобального ThrottlerGuard в app.module нет: пределы навешиваются по-роутно через
    // @UseGuards(ThrottlerGuard). Ручка публичная и без арендатора — объявленные 60/мин
    // должны действовать, а не лежать в метаданных (журнал 334; тот же класс — §5.169).
    const guards =
      (Reflect.getMetadata('__guards__', WebinarsWebhookController.prototype.handle) as
        | Array<{ name?: string }>
        | undefined) ?? [];
    expect(guards.some((g) => g === ThrottlerGuard || g?.name === 'ThrottlerGuard')).toBe(true);
  });
});
