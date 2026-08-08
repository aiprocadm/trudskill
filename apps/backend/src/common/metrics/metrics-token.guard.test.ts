import { UnauthorizedException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Доступ к метрикам (ФТ-I2, Фаза 6 Task 5).
 *
 * `/metrics` отдавался кому угодно: это карта нагрузки центра — сколько людей учится,
 * когда идут экзамены, какие ручки тормозят. Здесь закрепляем правило доступа и то,
 * что в разработке (токен не задан) ничего не ломается.
 */
const loadGuard = async (token?: string) => {
  vi.resetModules();
  vi.doMock('../../env.js', () => ({ backendEnv: { METRICS_TOKEN: token } }));
  const { MetricsTokenGuard } = await import('./metrics-token.guard.js');
  return new MetricsTokenGuard();
};

const contextWith = (authorization?: string) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({
        header: (name: string) => (name === 'authorization' ? authorization : undefined)
      })
    })
  }) as never;

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('../../env.js');
});

describe('MetricsTokenGuard', () => {
  it('токен не задан (разработка) — метрики читаются свободно', async () => {
    const guard = await loadGuard(undefined);
    expect(guard.canActivate(contextWith())).toBe(true);
  });

  it('токен задан, заголовка нет — отказ', async () => {
    const guard = await loadGuard('s3cret-token-0123456789');
    expect(() => guard.canActivate(contextWith())).toThrow(UnauthorizedException);
  });

  it('токен задан, прислан ЧУЖОЙ — отказ', async () => {
    const guard = await loadGuard('s3cret-token-0123456789');
    expect(() => guard.canActivate(contextWith('Bearer wrong-token-0123456789'))).toThrow(
      UnauthorizedException
    );
  });

  it('токен задан, прислан верный — пускает', async () => {
    const guard = await loadGuard('s3cret-token-0123456789');
    expect(guard.canActivate(contextWith('Bearer s3cret-token-0123456789'))).toBe(true);
  });

  it('схема должна быть Bearer: голый токен не проходит', async () => {
    const guard = await loadGuard('s3cret-token-0123456789');
    expect(() => guard.canActivate(contextWith('s3cret-token-0123456789'))).toThrow(
      UnauthorizedException
    );
  });

  it('правильный префикс чужого токена не проходит — сравнение полное', async () => {
    // Сравнение идёт с постоянным временем именно для того, чтобы токен нельзя было
    // подобрать по символу, замеряя время ответа.
    const guard = await loadGuard('s3cret-token-0123456789');
    expect(() => guard.canActivate(contextWith('Bearer s3cret-token-012345678'))).toThrow(
      UnauthorizedException
    );
  });
});
