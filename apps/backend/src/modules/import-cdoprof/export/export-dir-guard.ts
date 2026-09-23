/**
 * Страж папки выгрузки: ПДн слушателей не должны оказаться внутри репозитория.
 *
 * Скрипт выгрузки запускают из корня репозитория, и самый естественный «давай сюда» — папка
 * рядом. Но всё, что лежит внутри репозитория, рано или поздно попадает в `git add .` — а
 * репозиторий публичный (МГ-K1.1: «ПДн в репозиторий не попадают»). Поэтому выгрузка внутрь
 * репозитория запрещена; исключение — учебный прогон на обезличенных фикстурах.
 */
import { isAbsolute, relative, resolve, sep } from 'node:path';

export class ExportDirInsideRepoError extends Error {
  constructor(
    readonly dir: string,
    readonly repoRoot: string
  ) {
    super(
      `Папка выгрузки ${dir} лежит внутри репозитория ${repoRoot}. ` +
        'В файлах — персональные данные слушателей, а репозиторий публичный. ' +
        'Укажите папку вне репозитория в CDOPROF_EXPORT_DIR.'
    );
    this.name = 'ExportDirInsideRepoError';
  }
}

export const isInsideDir = (candidate: string, parent: string): boolean => {
  const rel = relative(resolve(parent), resolve(candidate));
  if (rel === '') return true;
  return !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`);
};

export const assertExportDirOutsideRepo = (
  dir: string,
  repoRoot: string,
  options: { allowInsideRepo?: boolean } = {}
): void => {
  if (options.allowInsideRepo) return;
  if (isInsideDir(dir, repoRoot)) {
    throw new ExportDirInsideRepoError(resolve(dir), resolve(repoRoot));
  }
};
