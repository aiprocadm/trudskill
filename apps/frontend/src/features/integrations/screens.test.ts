import { describe, expect, it } from 'vitest';

describe('integrations screens smoke', () => {
  it('exports integration settings screen component', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    const { IntegrationSettingsScreen } = await import('./screens');

    expect(typeof IntegrationSettingsScreen).toBe('function');
  });

  it('exports export tasks screen component', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    const { ExportTasksScreen } = await import('./screens');

    expect(typeof ExportTasksScreen).toBe('function');
  });

  it('exports sync logs screen component', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    const { SyncLogsScreen } = await import('./screens');

    expect(typeof SyncLogsScreen).toBe('function');
  });
});
