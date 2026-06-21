import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Regression guard for the full-application DI boot — module wiring edition.
 *
 * NestJS instantiates a guard referenced via `@UseGuards(PermissionGuard)` inside the DI
 * context of the module that DECLARES the controller. `PermissionGuard`'s constructor needs
 * `IamService` + `AuthService` (both exported by `IamModule`). If a module declares a
 * controller that uses `PermissionGuard` but forgets to import `IamModule` (or otherwise
 * provide `IamService`), the injector throws `UnknownDependenciesException` at boot — the whole
 * app fails to start, while the HTTP integration tests stay green because they boot a minimal
 * app with a *stub* controller, never the real module graph. That gap shipped the
 * `PaymentsModule` boot failure (missing `IamModule` import); this test closes it.
 *
 * Rule: every module that declares a controller referencing `PermissionGuard` MUST either
 * import `IamModule` or provide `IamService` itself (the `workspace.module.ts` pattern).
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...listTsFiles(p));
    else if (entry.endsWith('.ts') && !entry.includes('.test.')) out.push(p);
  }
  return out;
}

/** Resolve an `import ... from './x.js'` specifier to the corresponding `.ts` file path. */
function resolveSpecifier(fromFile: string, specifier: string): string {
  const base = resolve(dirname(fromFile), specifier).replace(/\.js$/, '');
  return `${base}.ts`;
}

/** Map every named import in `src` to the resolved `.ts` path it comes from. */
function buildImportMap(file: string, src: string): Map<string, string> {
  const map = new Map<string, string>();
  const re = /import\s+(?:type\s+)?\{([\s\S]*?)\}\s+from\s+['"]([^'"]+)['"]/g;
  for (const match of src.matchAll(re)) {
    const target = resolveSpecifier(file, match[2]);
    for (const raw of match[1].split(',')) {
      const name = raw.replace(/\s+as\s+\w+/, '').trim();
      if (name) map.set(name, target);
    }
  }
  return map;
}

/** Extract the class names listed in the module's `controllers: [...]` array. */
function controllerNames(src: string): string[] {
  const idx = src.indexOf('controllers:');
  if (idx === -1) return [];
  const open = src.indexOf('[', idx);
  const close = src.indexOf(']', open);
  if (open === -1 || close === -1) return [];
  return src
    .slice(open + 1, close)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

describe('PermissionGuard module wiring (guards are instantiated in the controller-owning module)', () => {
  it('every module declaring a PermissionGuard controller imports IamModule (or provides IamService)', () => {
    const files = listTsFiles(SRC);

    // Controller files that reference PermissionGuard, keyed by resolved path.
    const guardControllers = new Set(
      files
        .filter(
          (f) => f.endsWith('.controller.ts') && readFileSync(f, 'utf8').includes('PermissionGuard')
        )
        .map((f) => resolve(f))
    );

    const offenders: string[] = [];
    for (const file of files.filter((f) => f.endsWith('.module.ts'))) {
      const src = readFileSync(file, 'utf8');
      const names = controllerNames(src);
      if (names.length === 0) continue;

      const imports = buildImportMap(file, src);
      const declaresGuardController = names.some((name) => {
        const target = imports.get(name);
        return target !== undefined && guardControllers.has(resolve(target));
      });
      if (!declaresGuardController) continue;

      const wired = /\bIamModule\b/.test(src) || /\bIamService\b/.test(src);
      if (!wired) offenders.push(file.replace(SRC, 'src'));
    }

    expect(
      offenders,
      `These modules declare a controller that uses PermissionGuard but neither import IamModule ` +
        `nor provide IamService — the app will fail to boot:\n${offenders.join('\n')}`
    ).toEqual([]);
  });
});
