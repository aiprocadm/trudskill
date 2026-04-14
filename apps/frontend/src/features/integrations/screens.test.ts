import { describe, expect, it } from 'vitest';

describe('integrations screens smoke', () => {
  it('exports integration settings screen component', async () => {
    const startedAt = Date.now();
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    // #region agent log
    await fetch('http://127.0.0.1:7784/ingest/208359c6-33bf-4bcf-bd6c-d5a3e4d89734', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '940dad' },
      body: JSON.stringify({
        sessionId: '940dad',
        runId: 'pre-fix',
        hypothesisId: 'H2',
        location: 'apps/frontend/src/features/integrations/screens.test.ts:11',
        message: 'Starting dynamic import for integration settings screen',
        data: { startedAt },
        timestamp: Date.now()
      })
    }).catch(() => {});
    // #endregion
    const { IntegrationSettingsScreen } = await import('./screens');
    // #region agent log
    await fetch('http://127.0.0.1:7784/ingest/208359c6-33bf-4bcf-bd6c-d5a3e4d89734', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '940dad' },
      body: JSON.stringify({
        sessionId: '940dad',
        runId: 'pre-fix',
        hypothesisId: 'H2',
        location: 'apps/frontend/src/features/integrations/screens.test.ts:25',
        message: 'Finished dynamic import for integration settings screen',
        data: { durationMs: Date.now() - startedAt },
        timestamp: Date.now()
      })
    }).catch(() => {});
    // #endregion

    expect(typeof IntegrationSettingsScreen).toBe('function');
  }, 15000);

  it('exports export tasks screen component', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    const { ExportTasksScreen } = await import('./screens');

    expect(typeof ExportTasksScreen).toBe('function');
  });

  it('exports sync logs screen component', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    const { SyncLogsScreen } = await import('./screens');

    expect(typeof SyncLogsScreen).toBe('function');
  });
});
