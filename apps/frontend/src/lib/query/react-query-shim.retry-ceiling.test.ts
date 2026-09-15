import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Потолок неудач у слоя загрузки (ТЗ «Стабилизация, UX и развитие», 1.1.3).
 *
 * Требование ТЗ: «у слоя загрузки данных — максимум N попыток, после чего экран показывает
 * ошибку и ОСТАНАВЛИВАЕТСЯ». Критерий приёмки оттуда же: «при 100% отказе API страница
 * рендерит состояние ошибки и делает не более N запросов (проверяется счётчиком моков)».
 *
 * Что было. Повторов у шима нет вовсе — одна попытка и ошибка. Зато опрос по интервалу
 * (`refetchInterval`, восемь мест в экранах: госвыгрузки, интеграции, загрузка видео,
 * закрытие групп) НЕ ОСТАНАВЛИВАЛСЯ НИКОГДА: сервер лежит, экран показывает ошибку, а
 * запросы продолжают уходить каждые 5–15 секунд до закрытия вкладки. Несколько открытых
 * вкладок дают постоянный поток, который при отказе базы не уменьшается — прямой кандидат
 * в причину задачи 1.2 «сервер перестаёт отвечать».
 *
 * Рантайм хуков здесь свой, как в `react-query-shim.loop-guard.test.ts`: RTL в репозитории
 * нет (`RISK-002`), а честная семантика зависимостей нужна — без неё тест не отличит
 * «остановились» от «эффект просто не перезапустился».
 */

type Slot = { deps?: unknown[]; fn?: unknown; value?: unknown; current?: unknown };

const runtime = {
  slots: [] as Slot[],
  effects: [] as { slot: number; deps: unknown[] | undefined; fn: () => unknown }[],
  cleanups: new Map<number, () => void>(),
  cursor: 0,
  context: null as unknown
};

const sameDeps = (a?: unknown[], b?: unknown[]) =>
  !!a && !!b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

vi.mock('react', () => ({
  createContext: () => ({}),
  useContext: () => runtime.context,
  useState: (init: unknown) => {
    const i = runtime.cursor++;
    if (!(i in runtime.slots)) {
      runtime.slots[i] = { value: typeof init === 'function' ? (init as () => unknown)() : init };
    }
    const setter = (next: unknown) => {
      const slot = runtime.slots[i] as Slot;
      slot.value =
        typeof next === 'function' ? (next as (p: unknown) => unknown)(slot.value) : next;
    };
    return [(runtime.slots[i] as Slot).value, setter];
  },
  useRef: (init: unknown) => {
    const i = runtime.cursor++;
    if (!(i in runtime.slots)) runtime.slots[i] = { current: init };
    return runtime.slots[i];
  },
  useCallback: (fn: unknown, deps: unknown[]) => {
    const i = runtime.cursor++;
    const prev = runtime.slots[i];
    if (!prev || !sameDeps(prev.deps, deps)) runtime.slots[i] = { fn, deps };
    return (runtime.slots[i] as Slot).fn;
  },
  useMemo: (fn: () => unknown, deps: unknown[]) => {
    const i = runtime.cursor++;
    const prev = runtime.slots[i];
    if (!prev || !sameDeps(prev.deps, deps)) runtime.slots[i] = { value: fn(), deps };
    return (runtime.slots[i] as Slot).value;
  },
  useEffect: (fn: () => unknown, deps?: unknown[]) => {
    const i = runtime.cursor++;
    runtime.effects.push({ slot: i, deps, fn });
  }
}));

const { QueryClient, useQuery } = await import('./react-query-shim');
const { QUERY_RETRY_POLICY } = await import('./retry-policy');

const flush = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

/** Прогон эффектов с честной семантикой: перезапуск только при изменившихся зависимостях. */
const makeRunner = () => {
  const ranDeps = new Map<number, unknown[] | undefined>();
  return () => {
    for (const effect of runtime.effects) {
      const prev = ranDeps.get(effect.slot);
      if (ranDeps.has(effect.slot) && sameDeps(prev, effect.deps)) continue;
      runtime.cleanups.get(effect.slot)?.();
      const cleanup = effect.fn();
      if (typeof cleanup === 'function') runtime.cleanups.set(effect.slot, cleanup as () => void);
      ranDeps.set(effect.slot, effect.deps);
    }
  };
};

const reset = () => {
  runtime.slots = [];
  runtime.effects = [];
  runtime.cleanups = new Map();
  runtime.cursor = 0;
  runtime.context = new QueryClient();
};

beforeEach(() => {
  vi.useFakeTimers();
  reset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('слой загрузки: потолок неудач подряд', () => {
  it('при полном отказе запросов их число не превышает потолка', async () => {
    const queryFn = vi.fn(async () => {
      throw new Error('сервер недоступен');
    });
    const runEffects = makeRunner();

    const render = () => {
      runtime.cursor = 0;
      runtime.effects = [];
      return useQuery({ queryKey: ['опрос'], queryFn, refetchInterval: 5_000 });
    };

    render();
    runEffects();
    await flush();

    /* Минута «лежащего» сервера: двенадцать тиков опроса по пять секунд. */
    for (let tick = 0; tick < 12; tick += 1) {
      await vi.advanceTimersByTimeAsync(5_000);
      await flush();
      render();
      runEffects();
    }

    expect(
      queryFn.mock.calls.length,
      `запросов не должно быть больше потолка (${QUERY_RETRY_POLICY.maxConsecutiveFailures}); ` +
        `сделано ${queryFn.mock.calls.length} — опрос не остановился`
    ).toBeLessThanOrEqual(QUERY_RETRY_POLICY.maxConsecutiveFailures);

    const state = render();
    expect(
      state.error,
      'экран обязан остаться в состоянии ошибки, а не в вечной загрузке'
    ).toBeTruthy();
  });

  it('удачный ответ обнуляет счётчик — временный сбой не запирает экран навсегда', async () => {
    let failing = true;
    const queryFn = vi.fn(async () => {
      if (failing) throw new Error('временный сбой');
      return { ok: true };
    });
    const runEffects = makeRunner();

    const render = () => {
      runtime.cursor = 0;
      runtime.effects = [];
      return useQuery({ queryKey: ['опрос'], queryFn, refetchInterval: 5_000 });
    };

    render();
    runEffects();
    await flush();

    await vi.advanceTimersByTimeAsync(5_000);
    await flush();

    failing = false;
    const afterFailures = queryFn.mock.calls.length;
    await (render().refetch as () => Promise<void>)();
    await flush();
    expect(queryFn.mock.calls.length).toBe(afterFailures + 1);

    /* После удачи опрос обязан продолжиться: счётчик неудач обнулён. */
    failing = true;
    render();
    runEffects();
    await vi.advanceTimersByTimeAsync(5_000);
    await flush();
    expect(
      queryFn.mock.calls.length,
      'после удачного ответа опрос должен возобновиться'
    ).toBeGreaterThan(afterFailures + 1);
  });

  it('ручное «Повторить» работает и после остановки — человек не заперт', async () => {
    const queryFn = vi.fn(async () => {
      throw new Error('сервер недоступен');
    });
    const runEffects = makeRunner();

    const render = () => {
      runtime.cursor = 0;
      runtime.effects = [];
      return useQuery({ queryKey: ['опрос'], queryFn, refetchInterval: 5_000 });
    };

    render();
    runEffects();
    await flush();
    for (let tick = 0; tick < 6; tick += 1) {
      await vi.advanceTimersByTimeAsync(5_000);
      await flush();
      render();
      runEffects();
    }

    const stopped = queryFn.mock.calls.length;
    await (render().refetch as () => Promise<void>)();
    await flush();

    expect(
      queryFn.mock.calls.length,
      'кнопка «Повторить» обязана слать запрос даже после остановки опроса'
    ).toBe(stopped + 1);
  });
});
