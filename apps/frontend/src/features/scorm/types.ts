export type ScormPackageStatus = 'uploaded' | 'processing' | 'ready' | 'failed';

export interface ScormPackageDto {
  id: string;
  title: string;
  packageStatus: ScormPackageStatus;
  zipFileId: string;
  launchHref?: string;
  manifestTitle?: string;
  entryCount?: number;
  totalBytes?: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export type ScormLessonStatus =
  | 'not attempted'
  | 'incomplete'
  | 'completed'
  | 'passed'
  | 'failed'
  | 'browsed';

export interface ScormAttemptDto {
  id: string;
  enrollmentId: string;
  materialId: string;
  lessonStatus: ScormLessonStatus;
  lessonLocation?: string;
  suspendData?: string;
  scoreRaw?: number;
  scoreMax?: number;
  scoreMin?: number;
  totalSeconds: number;
  startedAt: string;
  completedAt?: string;
}

export interface ScormLaunchDto {
  attempt: ScormAttemptDto;
  token: string;
  /** Относительный same-origin URL: /api/v1/scorm-content/<token>/<launchHref>. */
  launchUrl: string;
}

export interface CommitScormAttemptPayload {
  lessonStatus?: ScormLessonStatus;
  lessonLocation?: string;
  suspendData?: string;
  scoreRaw?: number;
  scoreMax?: number;
  scoreMin?: number;
  sessionSeconds?: number;
}

export interface UploadIntent {
  fileId: string;
  uploadUrl: string;
  storageKey: string;
  expiresInSeconds: number;
}
