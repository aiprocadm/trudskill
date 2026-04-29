import { describe, expect, it, vi } from 'vitest';

import { QueryClient, subscribeQueryErrors } from './react-query-shim';

describe('react-query shim basics', () => {
  it('notifies all subscribers on invalidateQueries', async () => {
    const client = new QueryClient();
    const listenerA = vi.fn();
    const listenerB = vi.fn();

    const unsubscribeA = client.subscribe(listenerA);
    client.subscribe(listenerB);

    await client.invalidateQueries({ queryKey: ['courses'] });
    expect(listenerA).toHaveBeenCalledTimes(1);
    expect(listenerB).toHaveBeenCalledTimes(1);

    unsubscribeA();
    await client.invalidateQueries({ queryKey: ['courses'] });
    expect(listenerA).toHaveBeenCalledTimes(1);
    expect(listenerB).toHaveBeenCalledTimes(2);
  });

  it('handles query error listener subscribe/unsubscribe lifecycle', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeQueryErrors(listener);

    expect(typeof unsubscribe).toBe('function');
    unsubscribe();

    // repeat unsubscribe should not throw
    expect(() => unsubscribe()).not.toThrow();
  });
});
