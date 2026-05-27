import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type WatchTrackerCallbacks,
  type WatchTrackerOptions,
  createWatchTracker
} from './use-watch-tracker';

describe('createWatchTracker', () => {
  const visibilitySpy = vi.fn(() => 'visible' as DocumentVisibilityState);

  beforeEach(() => {
    vi.useFakeTimers();
    visibilitySpy.mockReturnValue('visible');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const make = (overrides: Partial<WatchTrackerOptions & WatchTrackerCallbacks> = {}) => {
    const onTick = vi.fn();
    const onFlush = vi.fn();
    const onMinimumReached = vi.fn();
    const tracker = createWatchTracker({
      minViewSeconds: 5,
      flushIntervalMs: 5000,
      onTick,
      onFlush,
      onMinimumReached,
      getVisibility: visibilitySpy,
      ...overrides
    });
    return { tracker, onTick, onFlush, onMinimumReached };
  };

  it('накапливает 10 секунд за 10 тиков', () => {
    const { tracker, onTick } = make();
    tracker.start();
    for (let i = 0; i < 10; i += 1) vi.advanceTimersByTime(1000);
    expect(onTick).toHaveBeenLastCalledWith(10);
    tracker.stop();
  });

  it('не накапливает при скрытой вкладке', () => {
    const { tracker, onTick } = make();
    visibilitySpy.mockReturnValue('hidden');
    tracker.start();
    vi.advanceTimersByTime(3000);
    expect(onTick).not.toHaveBeenCalled();
    visibilitySpy.mockReturnValue('visible');
    vi.advanceTimersByTime(2000);
    expect(onTick).toHaveBeenLastCalledWith(2);
    tracker.stop();
  });

  it('вызывает onFlush каждые 5 секунд', () => {
    const { tracker, onFlush } = make();
    tracker.start();
    vi.advanceTimersByTime(5000);
    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenLastCalledWith(5);
    vi.advanceTimersByTime(5000);
    expect(onFlush).toHaveBeenCalledTimes(2);
    expect(onFlush).toHaveBeenLastCalledWith(10);
    tracker.stop();
  });

  it('flush на stop, если накоплены секунды с последнего flush', () => {
    const { tracker, onFlush } = make();
    tracker.start();
    vi.advanceTimersByTime(2000);
    tracker.stop();
    expect(onFlush).toHaveBeenCalledWith(2);
  });

  it('onMinimumReached вызывается ровно один раз', () => {
    const { tracker, onMinimumReached } = make({ minViewSeconds: 3 });
    tracker.start();
    vi.advanceTimersByTime(5000);
    expect(onMinimumReached).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);
    expect(onMinimumReached).toHaveBeenCalledTimes(1);
    tracker.stop();
  });
});
