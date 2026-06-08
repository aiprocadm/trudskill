import { randomBytes } from 'node:crypto';

import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { backendEnv } from '../../../env.js';
import { DatabaseService } from '../../../infrastructure/database/database.service.js';

/**
 * Publicly-known dev seed password hash (= sha256("pwd:Password123!"), migration 0010).
 * Any account still carrying it can be logged into with `Password123!`.
 */
export const LEAKED_SEED_PASSWORD_HASH =
  'd845591b855ba5b9a20db65eee522f76ed85858551b8f813ef146725e1a59264';

/**
 * Narrow interface for the db parameter used by neutralizeLeakedSeedCredentials.
 * The test mock satisfies this shape; the real DatabaseService is passed as `as never`
 * in tests. In production use, call via SeedCredentialHygiene which wraps withTransaction
 * to supply a raw PoolClient whose query() returns a pg QueryResult with rowCount.
 */
interface RawQueryExecutor {
  query(sql: string, params: unknown[]): Promise<{ rowCount: number | null }>;
}

/**
 * Rotates every iam.users row whose password_hash is the leaked seed hash to an unusable
 * value (`disabled:<random hex>` — neither scrypt nor 64-hex, so verifyPassword always
 * rejects it). Targeted at the exact leaked hash, so real passwords are untouched.
 * Returns the number of rows neutralized. Idempotent (the WHERE no longer matches after).
 */
export async function neutralizeLeakedSeedCredentials(db: RawQueryExecutor): Promise<number> {
  const replacement = `disabled:${randomBytes(32).toString('hex')}`;
  const result = await db.query(
    'update iam.users set password_hash = $1, updated_at = now() where password_hash = $2',
    [replacement, LEAKED_SEED_PASSWORD_HASH]
  );
  return result.rowCount ?? 0;
}

/**
 * Production-only startup hook: neutralizes the leaked dev seed password so the
 * (kept-enabled) password login cannot be used with the public `Password123!`.
 * No-op outside production so dev/tests keep logging in with the seed password.
 */
@Injectable()
export class SeedCredentialHygiene implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedCredentialHygiene.name);

  constructor(private readonly db: DatabaseService) {}

  async onApplicationBootstrap(): Promise<void> {
    if (backendEnv.NODE_ENV !== 'production') {
      return;
    }
    try {
      const count = await this.db.withTransaction(async (client) => {
        const replacement = `disabled:${randomBytes(32).toString('hex')}`;
        const result = await client.query(
          'update iam.users set password_hash = $1, updated_at = now() where password_hash = $2',
          [replacement, LEAKED_SEED_PASSWORD_HASH]
        );
        return result.rowCount ?? 0;
      });
      if (count > 0) {
        this.logger.warn(
          `seed_credentials_neutralized count=${count} (leaked Password123! hash rotated)`
        );
      }
    } catch (error) {
      this.logger.error(`seed credential hygiene failed: ${(error as Error).message}`);
    }
  }
}
