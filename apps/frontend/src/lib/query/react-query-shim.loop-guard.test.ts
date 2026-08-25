import { describe, expect, it, vi } from 'vitest';

/*
 * Сторож вечного цикла запросов (фаза 5 срез 3, журнал расхождений).
 *
 * Дефект: вызывающий код передаёт объект опций и queryFn инлайном, их идентичность
 * меняется каждый рендер. Пока refetch зависел от этой идентичности, эффект
 * монтирования перезапускался после каждого рендера: запрос → setState → рендер →
 * новый refetch → эффект → запрос. На живом стенде шесть ручек оболочки опрашивались
 * по ~2 раза в секунду без остановки, а /workspace вечно висел в скелетоне.
 *
 * RTL в репозитории нет (RISK-002 — новых библиотек не вводим), поэтому тест
 * поднимает крошечный рантайм хуков с честной семантикой зависимостей: useState
 * хранит состояние между рендерами, useCallback/useMemo пересчитываются по deps,
 * useEffect перезапускается только при изменившихся deps. Этого достаточно, чтобы
 * инвариант «повторный рендер с теми же queryKey/enabled не уходит в сеть» падал
 * на старом коде и держался на исправленном.
 */

type Slot = { deps?: unknown[]; fn?: unknown; value?: unknown; current?: unknown };

const runtime = {
  slots: [] as Slot[],
  effects: [] as { slot: number; deps: unknown[] | undefined; fn: () => unknown }[],
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

import { QueryClient, useQuery } from './react-query-shim';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('шим useQuery: стабильность между рендерами', () => {
  it('повторный рендер с теми же queryKey/enabled не уходит в сеть и не меняет refetch', async () => {
    runtime.slots = [];
    runtime.context = new QueryClient();
    const queryFn = vi.fn(async () => ({ items: [] }));

    // Как в реальных экранах: объект опций и queryFn создаются заново каждый рендер.
    const renderOnce = () => {
      runtime.cursor = 0;
      runtime.effects = [];
      return useQuery({ queryKey: ['learners', 1], queryFn: async () => queryFn() });
    };

    // Эффекты перезапускаются только при изменившихся deps — как в настоящем React.
    const ranDeps = new Map<number, unknown[] | undefined>();
    const runEffects = () => {
      for (const effect of runtime.effects) {
        const prev = ranDeps.get(effect.slot);
        const skip = ranDeps.has(effect.slot) && sameDeps(prev, effect.deps);
        if (skip) continue;
        effect.fn();
        ranDeps.set(effect.slot, effect.deps);
      }
    };

    const first = renderOnce();
    runEffects();
    await flush();
    expect(queryFn).toHaveBeenCalledTimes(1);

    // Второй рендер: состояние (data/isLoading) изменилось, опции — новые объекты.
    const second = renderOnce();
    runEffects();
    await flush();

    expect(second.refetch, 'refetch обязан быть стабильным между рендерами').toBe(first.refetch);
    expect(
      queryFn,
      'повторный рендер без смены queryKey не должен слать новый запрос — это и есть вечный цикл'
    ).toHaveBeenCalledTimes(1);
  });

  it('refetch читает свежие опции через ref, а не замыкает первые', async () => {
    runtime.slots = [];
    runtime.context = new QueryClient();
    const results: string[] = [];

    const renderOnce = (marker: string) => {
      runtime.cursor = 0;
      runtime.effects = [];
      return useQuery({
        queryKey: ['marker'],
        queryFn: async () => {
          results.push(marker);
          return marker;
        }
      });
    };

    renderOnce('первый');
    const second = renderOnce('второй');
    await second.refetch();

    // Ручной refetch после второго рендера обязан выполнить СВЕЖУЮ queryFn.
    expect(results).toEqual(['второй']);
  });
});
