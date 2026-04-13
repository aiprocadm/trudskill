import { describe, expect, it } from 'vitest';

import { WorkspaceService } from './workspace.service.js';
import { workspaceTestDatabaseStub } from './workspace.test-db.stub.js';

describe('WorkspaceService', () => {
  it('returns tenant-scoped workspace summary for known tenant', async () => {
    const service = new WorkspaceService(workspaceTestDatabaseStub);
    const summary = await service.getWorkspaceSummary('tenant_demo');

    expect(summary.nextActions.length).toBeGreaterThan(0);
    expect(summary.blockersCount).toBeGreaterThan(0);
    expect(summary.deepLinks.map((item) => item.route)).toEqual(
      expect.arrayContaining(['/tasks/inbox', '/blockers'])
    );
  });

  it('returns empty projections for unknown tenant', async () => {
    const service = new WorkspaceService(workspaceTestDatabaseStub);

    expect(await service.getTasksInbox('tenant_unknown')).toEqual([]);
    expect(await service.getBlockers('tenant_unknown')).toEqual([]);
    expect(await service.getWorkspaceSummary('tenant_unknown')).toMatchObject({
      overdueCount: 0,
      blockersCount: 0,
      nextActions: []
    });
  });
});
