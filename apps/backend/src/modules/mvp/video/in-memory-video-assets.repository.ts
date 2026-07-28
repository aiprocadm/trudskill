import type {
  CreateVideoAssetInput,
  UpdateVideoAssetInput,
  VideoAssetRow,
  VideoAssetsRepository
} from './video-assets.repository.js';

/** Режим `ALLOW_IN_MEMORY_STATE` (dev/тесты без Postgres) и юнит-тесты сервиса. */
export class InMemoryVideoAssetsRepository implements VideoAssetsRepository {
  private readonly rows = new Map<string, VideoAssetRow>();

  private key(tenantId: string, id: string): string {
    return `${tenantId}::${id}`;
  }

  async create(input: CreateVideoAssetInput): Promise<VideoAssetRow> {
    const now = new Date().toISOString();
    const row: VideoAssetRow = {
      id: input.id,
      tenantId: input.tenantId,
      providerCode: input.providerCode,
      status: input.status,
      sizeBytes: input.sizeBytes,
      createdAt: now,
      updatedAt: now,
      ...(input.providerAssetId ? { providerAssetId: input.providerAssetId } : {}),
      ...(input.storageKey ? { storageKey: input.storageKey } : {}),
      ...(input.fileId ? { fileId: input.fileId } : {}),
      ...(input.multipartUploadId ? { multipartUploadId: input.multipartUploadId } : {})
    };
    this.rows.set(this.key(input.tenantId, input.id), row);
    return row;
  }

  async findById(tenantId: string, id: string): Promise<VideoAssetRow | null> {
    return this.rows.get(this.key(tenantId, id)) ?? null;
  }

  async listByMaterial(tenantId: string, materialId: string): Promise<VideoAssetRow[]> {
    return [...this.rows.values()].filter(
      (row) => row.tenantId === tenantId && row.materialId === materialId
    );
  }

  async update(
    tenantId: string,
    id: string,
    patch: UpdateVideoAssetInput
  ): Promise<VideoAssetRow | null> {
    const key = this.key(tenantId, id);
    const current = this.rows.get(key);
    if (!current) return null;
    const next: VideoAssetRow = { ...current, updatedAt: new Date().toISOString() };
    if (patch.status !== undefined) next.status = patch.status;
    if (patch.durationSeconds !== undefined) next.durationSeconds = patch.durationSeconds;
    // null означает «стереть», а не «не менять» — иначе ошибка навсегда прилипла бы к ассету.
    if (patch.errorMessage !== undefined) {
      if (patch.errorMessage === null) delete next.errorMessage;
      else next.errorMessage = patch.errorMessage;
    }
    if (patch.materialId !== undefined) {
      if (patch.materialId === null) delete next.materialId;
      else next.materialId = patch.materialId;
    }
    if (patch.multipartUploadId !== undefined) {
      if (patch.multipartUploadId === null) delete next.multipartUploadId;
      else next.multipartUploadId = patch.multipartUploadId;
    }
    this.rows.set(key, next);
    return next;
  }

  async delete(tenantId: string, id: string): Promise<boolean> {
    return this.rows.delete(this.key(tenantId, id));
  }
}
