import { Inject, Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../infrastructure/database/database.service.js';

import type {
  SaveVideoProgressInput,
  VideoProgressRepository,
  VideoProgressRow
} from './video-progress.repository.js';
import type { WatchedRange } from './video-progress.util.js';

interface Row {
  tenant_id: string;
  enrollment_id: string;
  material_id: string;
  watched_ranges: unknown;
  last_position_seconds: number;
  max_position_seconds: number;
  updated_at: string;
}

const SELECT_COLUMNS = `tenant_id, enrollment_id, material_id, watched_ranges,
    last_position_seconds, max_position_seconds, updated_at`;

function toRow(row: Row): VideoProgressRow {
  return {
    tenantId: row.tenant_id,
    enrollmentId: row.enrollment_id,
    materialId: row.material_id,
    // jsonb приезжает уже разобранным; чужую форму не доверяем — приводим к массиву.
    watchedRanges: Array.isArray(row.watched_ranges) ? (row.watched_ranges as WatchedRange[]) : [],
    lastPositionSeconds: Number(row.last_position_seconds),
    maxPositionSeconds: Number(row.max_position_seconds),
    updatedAt: row.updated_at
  };
}

@Injectable()
export class PostgresVideoProgressRepository implements VideoProgressRepository {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async find(
    tenantId: string,
    enrollmentId: string,
    materialId: string
  ): Promise<VideoProgressRow | null> {
    const rows = await this.db.query<Row>(
      `select ${SELECT_COLUMNS} from learning.video_progress
       where tenant_id = $1 and enrollment_id = $2 and material_id = $3`,
      [tenantId, enrollmentId, materialId]
    );
    return rows[0] ? toRow(rows[0]) : null;
  }

  async save(
    tenantId: string,
    enrollmentId: string,
    materialId: string,
    input: SaveVideoProgressInput
  ): Promise<VideoProgressRow> {
    const rows = await this.db.query<Row>(
      `insert into learning.video_progress
         (tenant_id, enrollment_id, material_id, watched_ranges, last_position_seconds,
          max_position_seconds, updated_at)
       values ($1, $2, $3, $4::jsonb, $5, $6, now())
       on conflict (tenant_id, enrollment_id, material_id) do update set
         watched_ranges = excluded.watched_ranges,
         last_position_seconds = excluded.last_position_seconds,
         -- Максимум досмотренного НЕ откатывается назад: запоздавший heartbeat не должен
         -- снимать уже заработанное право перематывать (ФТ-B3.2).
         max_position_seconds = greatest(
           learning.video_progress.max_position_seconds, excluded.max_position_seconds
         ),
         updated_at = now()
       returning ${SELECT_COLUMNS}`,
      [
        tenantId,
        enrollmentId,
        materialId,
        JSON.stringify(input.watchedRanges),
        Math.round(input.lastPositionSeconds),
        Math.round(input.maxPositionSeconds)
      ]
    );
    return toRow(rows[0]!);
  }

  async listByEnrollment(tenantId: string, enrollmentId: string): Promise<VideoProgressRow[]> {
    const rows = await this.db.query<Row>(
      `select ${SELECT_COLUMNS} from learning.video_progress
       where tenant_id = $1 and enrollment_id = $2`,
      [tenantId, enrollmentId]
    );
    return rows.map(toRow);
  }
}
