import type {
  SaveVideoProgressInput,
  VideoProgressRepository,
  VideoProgressRow
} from './video-progress.repository.js';

/** Режим `ALLOW_IN_MEMORY_STATE` (dev/тесты без Postgres) и юнит-тесты сервиса. */
export class InMemoryVideoProgressRepository implements VideoProgressRepository {
  private readonly rows = new Map<string, VideoProgressRow>();

  private key(tenantId: string, enrollmentId: string, materialId: string): string {
    return `${tenantId}::${enrollmentId}::${materialId}`;
  }

  async find(
    tenantId: string,
    enrollmentId: string,
    materialId: string
  ): Promise<VideoProgressRow | null> {
    return this.rows.get(this.key(tenantId, enrollmentId, materialId)) ?? null;
  }

  async save(
    tenantId: string,
    enrollmentId: string,
    materialId: string,
    input: SaveVideoProgressInput
  ): Promise<VideoProgressRow> {
    const row: VideoProgressRow = {
      tenantId,
      enrollmentId,
      materialId,
      ...input,
      updatedAt: new Date().toISOString()
    };
    this.rows.set(this.key(tenantId, enrollmentId, materialId), row);
    return row;
  }

  async listByEnrollment(tenantId: string, enrollmentId: string): Promise<VideoProgressRow[]> {
    return [...this.rows.values()].filter(
      (row) => row.tenantId === tenantId && row.enrollmentId === enrollmentId
    );
  }
}
