import type { WatchedRange } from './video-progress.util.js';

export const VIDEO_PROGRESS_REPOSITORY = Symbol('VIDEO_PROGRESS_REPOSITORY');

export interface VideoProgressRow {
  tenantId: string;
  enrollmentId: string;
  materialId: string;
  watchedRanges: WatchedRange[];
  lastPositionSeconds: number;
  /** Максимум досмотренного — опора антиперемотки (ФТ-B3.2, Task 7). */
  maxPositionSeconds: number;
  updatedAt: string;
}

export interface SaveVideoProgressInput {
  watchedRanges: WatchedRange[];
  lastPositionSeconds: number;
  maxPositionSeconds: number;
}

export interface VideoProgressRepository {
  find(
    tenantId: string,
    enrollmentId: string,
    materialId: string
  ): Promise<VideoProgressRow | null>;
  save(
    tenantId: string,
    enrollmentId: string,
    materialId: string,
    input: SaveVideoProgressInput
  ): Promise<VideoProgressRow>;
  /** Все записи зачисления — вход журнала часов (ФТ-B3.4, Task 8). */
  listByEnrollment(tenantId: string, enrollmentId: string): Promise<VideoProgressRow[]>;
}
