import { describe, expect, it } from 'vitest';

import { routeMeta } from './model';

describe('routeMeta — витрина /admin/ui-kit', () => {
  it('заведена под правом администратора и не публична', () => {
    const entry = routeMeta.find((r) => r.pattern === '/admin/ui-kit');
    expect(entry).toBeDefined();
    expect(entry?.meta.public).toBe(false);
    expect(entry?.meta.requiredPermissions).toContain('auth.manage_sessions');
  });
});
