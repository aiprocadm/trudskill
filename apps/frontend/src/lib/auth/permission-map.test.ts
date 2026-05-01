import { describe, expect, it } from 'vitest';

import { resolveRolePermissions } from './permission-map';

describe('resolveRolePermissions', () => {
  it('resolves learner role for learner cabinet route', () => {
    const permissions = resolveRolePermissions(['learner']);
    expect(permissions).toContain('enrollments.read');
    expect(permissions).not.toContain('assessment.read.cross_learner');
    expect(permissions).not.toContain('learners.act_as');
  });

  it('contains staff course management permissions for platform admin', () => {
    const permissions = resolveRolePermissions(['platform_admin']);
    expect(permissions).toContain('courses.publish');
    expect(permissions).toContain('courses.archive');
    expect(permissions).toContain('users.read');
    expect(permissions).toContain('assessment.read.cross_learner');
    expect(permissions).toContain('learners.act_as');
  });
});
