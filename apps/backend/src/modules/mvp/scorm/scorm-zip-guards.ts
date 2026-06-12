/** Лимиты распаковки SCORM-zip (D3 спеки): zip-bomb / DoS guard. */
export const SCORM_ZIP_LIMITS = {
  maxEntries: 5000,
  maxTotalBytes: 1.5 * 1024 * 1024 * 1024,
  maxEntryBytes: 300 * 1024 * 1024
} as const;

export class ScormZipGuardError extends Error {
  constructor(
    public readonly code:
      | 'scorm_zip_unsafe_path'
      | 'scorm_zip_too_many_entries'
      | 'scorm_zip_too_large'
      | 'scorm_zip_entry_too_large',
    message: string
  ) {
    super(message);
  }
}

/** Отказ при path traversal / абсолютных / windows-путях (entry кладётся в S3 как есть). */
export function assertSafeEntryPath(entryPath: string): void {
  const unsafe =
    entryPath.includes('\\') ||
    entryPath.startsWith('/') ||
    /^[a-zA-Z]:/.test(entryPath) ||
    entryPath.split('/').includes('..');
  if (unsafe) {
    throw new ScormZipGuardError('scorm_zip_unsafe_path', `Unsafe zip entry path: ${entryPath}`);
  }
}

/** Аккумулятор лимитов на один прогон распаковки. */
export function createZipBudget() {
  let entries = 0;
  let totalBytes = 0;
  return {
    addEntry(sizeBytes: number): void {
      entries += 1;
      totalBytes += sizeBytes;
      if (entries > SCORM_ZIP_LIMITS.maxEntries) {
        throw new ScormZipGuardError(
          'scorm_zip_too_many_entries',
          `More than ${SCORM_ZIP_LIMITS.maxEntries} entries`
        );
      }
      if (totalBytes > SCORM_ZIP_LIMITS.maxTotalBytes) {
        throw new ScormZipGuardError(
          'scorm_zip_too_large',
          'Uncompressed size exceeds the total limit'
        );
      }
      if (sizeBytes > SCORM_ZIP_LIMITS.maxEntryBytes) {
        throw new ScormZipGuardError(
          'scorm_zip_entry_too_large',
          'Single entry exceeds the per-file limit'
        );
      }
    },
    get entries() {
      return entries;
    },
    get totalBytes() {
      return totalBytes;
    }
  };
}

const MIME_BY_EXT: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  js: 'text/javascript',
  mjs: 'text/javascript',
  css: 'text/css',
  json: 'application/json',
  xml: 'application/xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  ico: 'image/x-icon',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  pdf: 'application/pdf',
  txt: 'text/plain; charset=utf-8'
};

/** Content-Type по расширению (раздача распакованного контента и putObject при распаковке). */
export function contentTypeForPath(entryPath: string): string {
  const ext = entryPath.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}
