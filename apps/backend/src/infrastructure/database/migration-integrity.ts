/** Согласовано с подсчётом checksum в DatabaseService.runMigrations. */
export function computeMigrationSqlChecksum(sql: string): string {
  return Buffer.from(sql, 'utf8').toString('base64url');
}

export function assertAppliedMigrationUnchanged(storedChecksum: string | undefined, sql: string): void {
  if (storedChecksum === undefined) return;
  const current = computeMigrationSqlChecksum(sql);
  if (storedChecksum !== current) {
    throw new Error(
      'Migration file was modified after it was applied (checksum mismatch). Do not edit applied migrations; add a new migration file instead.'
    );
  }
}
