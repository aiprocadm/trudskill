import { realtimeCatalog } from '@cdoprof/api-contracts';
import { describe, expect, it } from 'vitest';

describe('realtime', () => {
  it('contains mandatory event names', () => {
    expect(realtimeCatalog.asyncTaskStatusChanged).toBe('async_task.status_changed');
  });
});
