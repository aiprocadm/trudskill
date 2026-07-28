import { Inject, Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../infrastructure/database/database.service.js';

import type {
  CreateVideoAssetInput,
  UpdateVideoAssetInput,
  VideoAssetRow,
  VideoAssetsRepository
} from './video-assets.repository.js';
import type { VideoAssetStatus } from '../mvp.types.js';

interface Row {
  id: string;
  tenant_id: string;
  material_id: string | null;
  provider_code: string;
  provider_asset_id: string | null;
  status: VideoAssetStatus;
  duration_seconds: number | null;
  size_bytes: string | number;
  storage_key: string | null;
  error_message: string | null;
  file_id: string | null;
  multipart_upload_id: string | null;
  created_at: string;
  updated_at: string;
}

const SELECT_COLUMNS = `id, tenant_id, material_id, provider_code, provider_asset_id, status,
    duration_seconds, size_bytes, storage_key, error_message, file_id, multipart_upload_id,
    created_at, updated_at`;

function toRow(row: Row): VideoAssetRow {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    providerCode: row.provider_code,
    status: row.status,
    // bigint приезжает из pg строкой — без Number() размер молча стал бы текстом
    // и любая арифметика с лимитом хранилища (ФТ-B1.3) поехала бы.
    sizeBytes: Number(row.size_bytes),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.material_id ? { materialId: row.material_id } : {}),
    ...(row.provider_asset_id ? { providerAssetId: row.provider_asset_id } : {}),
    ...(row.duration_seconds !== null ? { durationSeconds: row.duration_seconds } : {}),
    ...(row.storage_key ? { storageKey: row.storage_key } : {}),
    ...(row.error_message ? { errorMessage: row.error_message } : {}),
    ...(row.file_id ? { fileId: row.file_id } : {}),
    ...(row.multipart_upload_id ? { multipartUploadId: row.multipart_upload_id } : {})
  };
}

@Injectable()
export class PostgresVideoAssetsRepository implements VideoAssetsRepository {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async create(input: CreateVideoAssetInput): Promise<VideoAssetRow> {
    const rows = await this.db.query<Row>(
      `insert into learning.video_assets
         (id, tenant_id, provider_code, provider_asset_id, status, size_bytes, storage_key,
          file_id, multipart_upload_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       returning ${SELECT_COLUMNS}`,
      [
        input.id,
        input.tenantId,
        input.providerCode,
        input.providerAssetId ?? null,
        input.status,
        input.sizeBytes,
        input.storageKey ?? null,
        input.fileId ?? null,
        input.multipartUploadId ?? null
      ]
    );
    return toRow(rows[0]!);
  }

  async findById(tenantId: string, id: string): Promise<VideoAssetRow | null> {
    // tenant_id в условии всегда: чужой ассет не должен находиться даже по точному id.
    const rows = await this.db.query<Row>(
      `select ${SELECT_COLUMNS} from learning.video_assets where tenant_id = $1 and id = $2`,
      [tenantId, id]
    );
    return rows[0] ? toRow(rows[0]) : null;
  }

  async listByMaterial(tenantId: string, materialId: string): Promise<VideoAssetRow[]> {
    const rows = await this.db.query<Row>(
      `select ${SELECT_COLUMNS} from learning.video_assets
       where tenant_id = $1 and material_id = $2 order by created_at desc`,
      [tenantId, materialId]
    );
    return rows.map(toRow);
  }

  async update(
    tenantId: string,
    id: string,
    patch: UpdateVideoAssetInput
  ): Promise<VideoAssetRow | null> {
    // coalesce не годится: null здесь означает «стереть значение», а не «не менять».
    // Поэтому для каждого поля отдельный флаг «пришло ли оно вообще».
    const rows = await this.db.query<Row>(
      `update learning.video_assets set
         status = case when $3::boolean then $4::text else status end,
         duration_seconds = case when $5::boolean then $6::integer else duration_seconds end,
         error_message = case when $7::boolean then $8::text else error_message end,
         material_id = case when $9::boolean then $10::text else material_id end,
         multipart_upload_id = case when $11::boolean then $12::text else multipart_upload_id end,
         updated_at = now()
       where tenant_id = $1 and id = $2
       returning ${SELECT_COLUMNS}`,
      [
        tenantId,
        id,
        patch.status !== undefined,
        patch.status ?? null,
        patch.durationSeconds !== undefined,
        patch.durationSeconds ?? null,
        patch.errorMessage !== undefined,
        patch.errorMessage ?? null,
        patch.materialId !== undefined,
        patch.materialId ?? null,
        patch.multipartUploadId !== undefined,
        patch.multipartUploadId ?? null
      ]
    );
    return rows[0] ? toRow(rows[0]) : null;
  }

  async delete(tenantId: string, id: string): Promise<boolean> {
    const rows = await this.db.query<{ id: string }>(
      `delete from learning.video_assets where tenant_id = $1 and id = $2 returning id`,
      [tenantId, id]
    );
    return rows.length > 0;
  }
}
