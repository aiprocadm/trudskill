'use client';

import { useQuery } from '@tanstack/react-query';

import { baseMimeType, proctoringApi, putBlobToPresignedUrl } from './api';
import { useAuth } from '../auth/context';

import type {
  ProctoringRecordingDetail,
  ProctoringRecordingStatus,
  ProctoringRecordingView
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

/** uploadChunk dep for ProctoringRecorder: presigned intent → PUT (1 chunk at a time). */
export function makeChunkUploader(session: UserSession, recordingId: string) {
  return async (sequence: number, blob: Blob): Promise<void> => {
    const contentType = baseMimeType(blob.type);
    const intent = await proctoringApi.chunkUploadUrl(session, recordingId, {
      sequence,
      originalName: `chunk-${sequence}.${contentType === 'video/mp4' ? 'mp4' : 'webm'}`,
      contentType,
      sizeBytes: blob.size
    });
    await putBlobToPresignedUrl(intent.uploadUrl, blob, contentType);
  };
}
