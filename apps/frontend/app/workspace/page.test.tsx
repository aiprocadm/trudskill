import { describe, expect, it } from 'vitest';

import { resolveWorkspaceErrorMessage, resolveWorkspaceState } from './page';
import { ApiClientError } from '../../src/lib/api/client';

describe('workspace page state helpers', () => {
  it('maps ApiClientError to backend message', () => {
    const error = new ApiClientError({
      status: 403,
      code: 'permission_denied',
      message: 'Permission denied',
      isAuthError: false
    });

    expect(resolveWorkspaceErrorMessage(error)).toBe('Permission denied');
  });

  it('uses fallback message for unknown errors', () => {
    expect(resolveWorkspaceErrorMessage(new Error('unexpected'))).toBe(
      'Не удалось загрузить рабочую сводку'
    );
  });

  it('returns loading state when session missing or loading in progress', () => {
    expect(
      resolveWorkspaceState({
        sessionPresent: false,
        loading: false,
        error: null,
        summary: null,
        tasks: [],
        blockers: []
      }).kind
    ).toBe('loading');

    expect(
      resolveWorkspaceState({
        sessionPresent: true,
        loading: true,
        error: null,
        summary: null,
        tasks: [],
        blockers: []
      }).kind
    ).toBe('loading');
  });

  it('returns empty flags in ready state for missing datasets', () => {
    const state = resolveWorkspaceState({
      sessionPresent: true,
      loading: false,
      error: null,
      summary: { overdueCount: 0, blockersCount: 0, nextActions: [], deepLinks: [] },
      tasks: [],
      blockers: []
    });

    expect(state.kind).toBe('ready');
    expect(state.showSummary).toBe(true);
    expect(state.showNextActionsEmpty).toBe(true);
    expect(state.showTasksEmpty).toBe(true);
    expect(state.showBlockersEmpty).toBe(true);
  });

  it('returns non-empty flags when data exists', () => {
    const state = resolveWorkspaceState({
      sessionPresent: true,
      loading: false,
      error: null,
      summary: {
        overdueCount: 1,
        blockersCount: 1,
        nextActions: [{ id: 'a1', title: 'Do action', route: '/x' }],
        deepLinks: [{ key: 'tasks.inbox', route: '/tasks/inbox' }]
      },
      tasks: [{ id: 't1', title: 'Task', status: 'open', route: '/tasks' }],
      blockers: [{ id: 'b1', title: 'Blocker', severity: 'high', route: '/blockers' }]
    });

    expect(state.kind).toBe('ready');
    expect(state.showSummary).toBe(true);
    expect(state.showNextActionsEmpty).toBe(false);
    expect(state.showTasksEmpty).toBe(false);
    expect(state.showBlockersEmpty).toBe(false);
  });
});
