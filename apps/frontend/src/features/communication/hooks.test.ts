import { describe, expect, it } from 'vitest';
import { realtimeCatalog } from '@cdoprof/api-contracts';

describe('communication foundations', () => {
  it('keeps required realtime catalog names stable', () => {
    expect(realtimeCatalog.asyncTaskStatusChanged).toBe('async_task.status_changed');
    expect(realtimeCatalog.notificationCreated).toBe('notification.created');
    expect(realtimeCatalog.chatMessageCreated).toBe('chat.message.created');
  });
});
