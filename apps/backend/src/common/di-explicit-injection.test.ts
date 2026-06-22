import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Regression guard for the full-application DI boot.
 *
 * The dev/runtime (`tsx watch`, esbuild) does NOT emit `emitDecoratorMetadata`, so NestJS
 * cannot resolve constructor parameters injected *by type* (`private readonly x: FooService`).
 * Such a param resolves to an undefined token and the injector hangs forever — an
 * orphaned-promise deadlock inside `NestFactory.create()` (the whole app fails to boot, while
 * unit tests that `new` the class directly stay green, so it slips through CI).
 *
 * Every injected constructor parameter MUST therefore use an explicit `@Inject(Token)`.
 * This test scans backend providers/controllers and fails if any genuine type-based injection
 * reappears. See LMS_AGENT_HANDOFF §13 Issue 3.
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');

// Classes instantiated via `useFactory` (new X(...)) rather than Nest DI — their ctor params
// are passed explicitly by the factory and need no @Inject.
const FACTORY_INSTANTIATED = new Set([
  'clamav-antivirus.scanner.ts',
  'smtp-mailer.service.ts',
  'email-magic-link-email-sender.ts'
]);
// Types Nest resolves without a provider token / not DI.
const NON_DI_TYPES = new Set(['Logger', 'Reflector']);

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...listTsFiles(p));
    else if (entry.endsWith('.ts') && !entry.includes('.test.') && !FACTORY_INSTANTIATED.has(entry))
      out.push(p);
  }
  return out;
}

function firstCtorParams(src: string): string | null {
  const idx = src.indexOf('constructor(');
  if (idx === -1) return null;
  let depth = 0;
  let start = -1;
  for (let i = idx + 'constructor'.length; i < src.length; i++) {
    const c = src[i];
    if (c === '(') {
      if (depth === 0) start = i + 1;
      depth++;
    } else if (c === ')') {
      depth--;
      if (depth === 0) return src.slice(start, i);
    }
  }
  return null;
}

/**
 * Only classes Nest actually instantiates through DI — i.e. decorated with `@Injectable()` or
 * `@Controller()` — can deadlock on type-based injection. Plain helper classes (e.g. `Error`
 * subclasses) and factory-instantiated providers (`new X(cfg)` via `useFactory`) carry no DI
 * metadata and are irrelevant here, so the scan must target the decorated class's own
 * constructor, not merely the first `constructor(` anywhere in the file.
 *
 * Returns the constructor parameter list for each `@Injectable`/`@Controller` class in the file.
 */
function diClassCtorParamLists(src: string): string[] {
  const lists: string[] = [];
  for (const match of src.matchAll(/\bclass\s+\w+/g)) {
    const classIdx = match.index ?? 0;
    // Decorators sit between the previous statement terminator and the `class` keyword.
    let regionStart = 0;
    for (let i = classIdx - 1; i >= 0; i--) {
      const c = src[i];
      if (c === '}' || c === ';') {
        regionStart = i + 1;
        break;
      }
    }
    if (!/@(?:Injectable|Controller)\b/.test(src.slice(regionStart, classIdx))) continue;

    // Brace-match the class body so we read only this class's constructor.
    const braceIdx = src.indexOf('{', classIdx);
    if (braceIdx === -1) continue;
    let depth = 0;
    let bodyEnd = src.length;
    for (let i = braceIdx; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}' && --depth === 0) {
        bodyEnd = i;
        break;
      }
    }
    const params = firstCtorParams(src.slice(braceIdx, bodyEnd));
    if (params) lists.push(params);
  }
  return lists;
}

function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const c of s) {
    if ('([{<'.includes(c)) depth++;
    else if (')]}>'.includes(c)) depth--;
    if (c === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

describe('DI uses explicit @Inject (tsx/esbuild has no decorator metadata)', () => {
  it('has no type-based constructor injection in backend providers/controllers', () => {
    const offenders: string[] = [];
    for (const file of listTsFiles(SRC)) {
      for (const params of diClassCtorParamLists(readFileSync(file, 'utf8'))) {
        for (const raw of splitTopLevel(params)) {
          const p = raw.trim();
          if (!p || p.includes('@Inject')) continue;
          const m = p.match(/:\s*([A-Z][A-Za-z0-9_]*)\b/);
          if (!m || NON_DI_TYPES.has(m[1])) continue;
          offenders.push(`${file.replace(SRC, 'src')} -> ${p.replace(/\s+/g, ' ')}`);
        }
      }
    }
    expect(offenders, `Add @Inject(<Token>) to:\n${offenders.join('\n')}`).toEqual([]);
  });
});
