import { describe, expect, it } from 'vitest';

import { WorkspaceService } from './workspace.service.js';

describe('WorkspaceService', () => {
  it('returns tenant-scoped workspace summary for known tenant', () => {
    const service = new WorkspaceService();
    const summary = service.getWorkspaceSummary('tenant_demo');

    expect(summary.nextActions.length).toBeGreaterThan(0);
    expect(summary.blockersCount).toBeGreaterThan(0);
    expect(summary.deepLinks.map((item) => item.route)).toEqual(
      expect.arrayContaining(['/tasks/inbox', '/blockers'])
    );
  });

  it('returns empty projections for unknown tenant', () => {
    const service = new WorkspaceService();

    expect(service.getTasksInbox('tenant_unknown')).toEqual([]);
    expect(service.getBlockers('tenant_unknown')).toEqual([]);
    expect(service.getWorkspaceSummary('tenant_unknown')).toMatchObject({
      overdueCount: 0,
      blockersCount: 0,
      nextActions: []
    });
  });
});
