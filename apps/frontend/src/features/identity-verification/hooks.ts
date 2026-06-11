'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { identityVerificationApi, putFileToPresignedUrl } from './api';
import { useAuth } from '../auth/context';

import type {
  IdentityVerificationDetail,
  IdentityVerificationDto,
  IdentityVerificationStatus,
  IdentityVerificationView,
  ReviewIdentityVerificationPayload
} from './types';

export function useMyIdentityVerification() {
  const { session } = useAuth();
  return useQuery<IdentityVerificationDto | null>({
    queryKey: ['identity-verification', 'me'],
    enabled: Boolean(session),
    queryFn: () => identityVerificationApi.me(session!)
  });
}

export function useIdentityQueue(status?: IdentityVerificationStatus) {
  const { session } = useAuth();
  return useQuery<IdentityVerificationView[]>({
    queryKey: ['identity-verifications', status ?? 'all'],
    enabled: Boolean(session),
    queryFn: () => identityVerificationApi.list(session!, status)
  });
}

export function useIdentityDetail(id: string) {
  const { session } = useAuth();
  return useQuery<IdentityVerificationDetail>({
    queryKey: ['identity-verifications', 'detail', id],
    enabled: Boolean(session) && Boolean(id),
    queryFn: () => identityVerificationApi.get(session!, id)
  });
}

/** Learner flow: start draft → upload both files → submit with consent. */
export function useIdentitySubmission() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitAll = async (selfie: File, passport: File): Promise<boolean> => {
    if (!session) return false;
    setIsPending(true);
    setError(null);
    try {
      const draft = await identityVerificationApi.start(session, {});
      const uploadOne = async (file: File) => {
        const intent = await identityVerificationApi.createUploadUrl(session, draft.id, {
          originalName: file.name,
          contentType: file.type,
          sizeBytes: file.size
        });
        await putFileToPresignedUrl(intent.uploadUrl, file);
        return intent.fileId;
      };
      const selfieFileId = await uploadOne(selfie);
      const passportFileId = await uploadOne(passport);
      await identityVerificationApi.submit(session, draft.id, {
        selfieFileId,
        passportFileId,
        consent: true
      });
      await queryClient.invalidateQueries({ queryKey: ['identity-verification', 'me'] });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setError(
        message.includes('learner_not_linked') || message.includes('No learner profile')
          ? 'Ваш аккаунт не привязан к карточке слушателя — обратитесь в учебный центр.'
          : message || 'Не удалось отправить документы'
      );
      return false;
    } finally {
      setIsPending(false);
    }
  };

  return { submitAll, isPending, error };
}

export function useIdentityReview() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const review = async (id: string, payload: ReviewIdentityVerificationPayload) => {
    if (!session) return false;
    setIsPending(true);
    setError(null);
    try {
      await identityVerificationApi.review(session, id, payload);
      await queryClient.invalidateQueries({ queryKey: ['identity-verifications'] });
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить решение');
      return false;
    } finally {
      setIsPending(false);
    }
  };

  return { review, isPending, error };
}
