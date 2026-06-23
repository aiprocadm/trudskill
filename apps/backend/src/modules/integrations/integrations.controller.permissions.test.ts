import 'reflect-metadata';

import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { describe, expect, it } from 'vitest';

import {
  ExportsController,
  IntegrationsController,
  SyncLogsController
} from './integrations.controller.js';
import { REQUIRED_PERMISSIONS } from '../iam/permission.decorator.js';
import { PermissionGuard } from '../iam/permission.guard.js';

type Ctor = new (...args: never[]) => object;

function handlerNames(ctor: Ctor): string[] {
  return Object.getOwnPropertyNames(ctor.prototype).filter((name) => name !== 'constructor');
}

function requiredPermissions(ctor: Ctor, method: string): string[] | undefined {
  return Reflect.getMetadata(
    REQUIRED_PERMISSIONS,
    (ctor.prototype as Record<string, unknown>)[method] as object
  );
}

// Regression guard for the HIGH finding: these controllers were TenantGuard-only — any
// authenticated tenant user could create/rotate credentials, run exports, read sync logs and
// mutate integration providers. Every handler must now carry an integrations.* permission.
describe('Integrations controllers require integrations.* permissions', () => {
  for (const ctor of [IntegrationsController, ExportsController, SyncLogsController] as Ctor[]) {
    describe(ctor.name, () => {
      it('applies PermissionGuard at the controller level', () => {
        const guards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, ctor) ?? [];
        expect(guards).toContain(PermissionGuard);
      });

      it('declares an integrations.read or integrations.write permission on EVERY handler', () => {
        for (const method of handlerNames(ctor)) {
          const perms = requiredPermissions(ctor, method);
          expect(perms, `${ctor.name}.${method} is missing @RequirePermissions`).toBeDefined();
          expect(perms!.length).toBeGreaterThan(0);
          for (const perm of perms!) {
            expect(['integrations.read', 'integrations.write']).toContain(perm);
          }
        }
      });
    });
  }

  it('gates the secret-rotation endpoint with integrations.write', () => {
    expect(requiredPermissions(IntegrationsController, 'rotateSecret')).toEqual([
      'integrations.write'
    ]);
  });

  it('gates provider reads with integrations.read', () => {
    expect(requiredPermissions(IntegrationsController, 'listProviders')).toEqual([
      'integrations.read'
    ]);
  });
});
