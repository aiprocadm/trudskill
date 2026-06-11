export type ProctoringRecordingStatus = 'recording' | 'completed';

export interface ProctoringChunkDto {
  sequence: number;
  fileId: string;
  uploadedIntentAt: string;
}

export interface ProctoringRecordingDto {
  id: string;
  learnerId: string;
  groupId: string;
  courseId: string;
  recordingStatus: ProctoringRecordingStatus;
  attemptId?: string;
  consentAt: string;
  startedAt: string;
  completedAt?: string;
  chunks: ProctoringChunkDto[];
  purgedAt?: string;
  createdAt: string;
}

/** Mirrors the backend `AttemptStatus` union (mvp.types.ts) — documented duplication. */
export type AttemptStatus =
  | 'draft'
  | 'in_progress'
  | 'submitted'
  | 'finished'
  | 'expired'
  | 'invalidated';

/** Admin queue row: session + display enrichment. */
export interface ProctoringRecordingView extends ProctoringRecordingDto {
  learnerName: string;
  courseTitle: string;
  attemptStatus?: AttemptStatus;
}

/** Mirrors the backend `ProctoringChunkIssue['code']` union (mvp.types.ts). */
export type ProctoringChunkIssueCode =
  | 'file_infected'
  | 'file_scan_failed'
  | 'file_error'
  | 'missing_chunk';

export interface ProctoringChunkIssue {
  sequence: number;
  code: ProctoringChunkIssueCode;
}

export interface ProctoringPlaybackChunk {
  sequence: number;
  fileId: string;
  url: string;
}

/** Admin detail: ordered presigned GET urls of clean chunks + issues. */
export interface ProctoringRecordingDetail extends ProctoringRecordingView {
  playbackChunks: ProctoringPlaybackChunk[];
  chunkIssues: ProctoringChunkIssue[];
}

export interface StartProctoringPayload {
  enrollmentId: string;
  courseId: string;
  consent: true;
}

export interface ProctoringChunkUploadPayload {
  sequence: number;
  originalName: string;
  contentType: string;
  sizeBytes: number;
}

export interface ActiveProctoringDto {
  recording: ProctoringRecordingDto;
  nextSequence: number;
}

export interface UploadIntent {
  fileId: string;
  uploadUrl: string;
  storageKey: string;
  expiresInSeconds: number;
}

export interface SetProctoringOverridePayload {
  override: 'require' | 'exempt' | null;
}
