import { describe, expect, it } from 'vitest';

import {
  ExportDirInsideRepoError,
  assertExportDirOutsideRepo,
  isInsideDir
} from './export-dir-guard.js';

const repo = '/srv/trudskill';

describe('isInsideDir', () => {
  it('папка внутри, сама папка и её подпапка — внутри', () => {
    expect(isInsideDir('/srv/trudskill/export', repo)).toBe(true);
    expect(isInsideDir('/srv/trudskill', repo)).toBe(true);
    expect(isInsideDir('/srv/trudskill/a/../b', repo)).toBe(true);
  });

  it('соседняя папка с похожим именем и родитель — снаружи', () => {
    expect(isInsideDir('/srv/trudskill-export', repo)).toBe(false);
    expect(isInsideDir('/srv', repo)).toBe(false);
    expect(isInsideDir('/var/cdoprof', repo)).toBe(false);
    expect(isInsideDir('/srv/trudskill/../other', repo)).toBe(false);
  });
});

describe('assertExportDirOutsideRepo', () => {
  it('отказывает писать внутрь репозитория с понятным сообщением', () => {
    expect(() => assertExportDirOutsideRepo('/srv/trudskill/out', repo)).toThrow(
      ExportDirInsideRepoError
    );
    expect(() => assertExportDirOutsideRepo('/srv/trudskill/out', repo)).toThrow(
      /персональные данные/
    );
  });

  it('пропускает папку снаружи и внутри при allowInsideRepo (учебный прогон)', () => {
    expect(() => assertExportDirOutsideRepo('/var/cdoprof', repo)).not.toThrow();
    expect(() =>
      assertExportDirOutsideRepo('/srv/trudskill/out', repo, { allowInsideRepo: true })
    ).not.toThrow();
  });
});
