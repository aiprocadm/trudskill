'use client';

import { useEffect, useRef } from 'react';

export interface WatchTrackerOptions {
  minViewSeconds: number;
  flushIntervalMs?: number;
  getVisibility?: () => DocumentVisibilityState;
}

export interface WatchTrackerCallbacks {
  onTick?: (studiedSeconds: number) => void;
  onFlush?: (studiedSeconds: number) => void;
  onMinimumReached?: () => void;
}

export interface WatchTracker {
  start: () => void;
  stop: () => void;
}

const defaultVisibility = (): DocumentVisibilityState =>
  typeof document === 'undefined' ? 'visible' : document.visibilityState;

export const createWatchTracker = (
  options: WatchTrackerOptions & WatchTrackerCallbacks
): WatchTracker => {
  const {
    minViewSeconds,
    flushIntervalMs = 5000,
    onTick,
    onFlush,
    onMinimumReached,
    getVisibility = defaultVisibility
  } = options;

  let intervalId: ReturnType<typeof setInterval> | null = null;
  let studiedSeconds = 0;
  let lastFlushedAt = 0;
  let minimumReachedFired = false;
  const flushTicksTarget = Math.max(1, Math.round(flushIntervalMs / 1000));

  const flushIfDirty = () => {
    if (studiedSeconds === lastFlushedAt) return;
    lastFlushedAt = studiedSeconds;
    onFlush?.(studiedSeconds);
  };

  const tick = () => {
    if (getVisibility() !== 'visible') return;
    studiedSeconds += 1;
    onTick?.(studiedSeconds);
    if (!minimumReachedFired && studiedSeconds >= minViewSeconds) {
      minimumReachedFired = true;
      onMinimumReached?.();
    }
    if (studiedSeconds - lastFlushedAt >= flushTicksTarget) {
      flushIfDirty();
    }
  };

  return {
    start: () => {
      if (intervalId !== null) return;
      intervalId = setInterval(tick, 1000);
    },
    stop: () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
      flushIfDirty();
    }
  };
};

interface UseWatchTrackerArgs {
  materialId: string | null;
  minViewSeconds: number;
  flushIntervalMs?: number;
  onFlush?: (studiedSeconds: number) => void;
  onMinimumReached?: () => void;
}

export const useWatchTracker = ({
  materialId,
  minViewSeconds,
  flushIntervalMs,
  onFlush,
  onMinimumReached
}: UseWatchTrackerArgs): void => {
  const onFlushRef = useRef(onFlush);
  const onMinimumReachedRef = useRef(onMinimumReached);
  onFlushRef.current = onFlush;
  onMinimumReachedRef.current = onMinimumReached;

  useEffect(() => {
    if (!materialId) return;
    const tracker = createWatchTracker({
      minViewSeconds,
      flushIntervalMs,
      onFlush: (s) => onFlushRef.current?.(s),
      onMinimumReached: () => onMinimumReachedRef.current?.()
    });
    tracker.start();
    return () => tracker.stop();
  }, [materialId, minViewSeconds, flushIntervalMs]);
};
