import { describe, expect, it } from 'vitest';
import { realtimeCatalog } from '@cdoprof/api-contracts';

describe('realtime', () => {
  it('contains mandatory event names', () => {
    expect(realtimeCatalog.asyncTaskStatusChanged).toBe('async_task.status_changed');
  });
});
