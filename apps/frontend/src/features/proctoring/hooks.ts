'use client';

import { useQuery } from '@tanstack/react-query';

import { baseMimeType, proctoringApi, putBlobToPresignedUrl } from './api';
import { useAuth } from '../auth/context';

import type {
  ProctoringRecordingDetail,
  ProctoringRecordingStatus,
  ProctoringRecordingView,
  UploadIntent
} from './types';
import type { UserSession } from '../../entities/session/model';

export function useProctoringQueue(status?: ProctoringRecordingStatus) {
  const { session } = useAuth();
  return useQuery<ProctoringRecordingView[]>({
    queryKey: ['proctoring-recordings', status ?? 'all'],
    enabled: Boolean(session),
    queryFn: () => proctoringApi.list(session!, status)
  });
}

export function useProctoringDetail(id: string) {
  const { session } = useAuth();
  return useQuery<ProctoringRecordingDetail>({
    queryKey: ['proctoring-recordings', 'detail', id],
    enabled: Boolean(session) && Boolean(id),
    queryFn: () => proctoringApi.get(session!, id)
  });
}

/**
 * uploadChunk dep for ProctoringRecorder: presigned intent → PUT (1 chunk at a time).
 *
 * Holistic-review fix C1: the recorder retries a failed chunk ONCE with the same sequence.
 * Registering a second intent for that sequence would 409 (`proctoring_chunk_duplicate`) and
 * leave a phantom chunk (registered, no object) — so the intent is cached per sequence and the
 * retry PUTs to the SAME presigned URL (intent TTL 15 min safely covers a back-to-back retry).
 * A successful PUT evicts the entry; a failed intent request caches nothing.
 */
export function makeChunkUploader(session: UserSession, recordingId: string) {
  const pendingIntents = new Map<number, UploadIntent>();
  return async (sequence: number, blob: Blob): Promise<void> => {
    const contentType = baseMimeType(blob.type);
    let intent = pendingIntents.get(sequence);
    if (!intent) {
      intent = await proctoringApi.chunkUploadUrl(session, recordingId, {
        sequence,
        originalName: `chunk-${sequence}.${contentType === 'video/mp4' ? 'mp4' : 'webm'}`,
        contentType,
        sizeBytes: blob.size
      });
      pendingIntents.set(sequence, intent);
    }
    await putBlobToPresignedUrl(intent.uploadUrl, blob, contentType);
    pendingIntents.delete(sequence);
  };
}
