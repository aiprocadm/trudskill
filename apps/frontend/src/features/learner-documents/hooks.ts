'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { learnerDocumentsApi } from './api';
import { useAuth } from '../auth/context';

import type { LearnerDocumentsResponse } from './types';

export function useMyDocuments() {
  const { session } = useAuth();
  return useQuery<LearnerDocumentsResponse>({
    queryKey: ['learner-documents', 'mine', session?.user.id ?? ''],
    enabled: Boolean(session),
    queryFn: () => learnerDocumentsApi.listMine(session!)
  });
}

/**
 * Ревизия 2026-08-26 (порция 21): скачивание документа кабинета.
 *
 * Вкладка открывается СИНХРОННО в обработчике клика (иначе блокировщик всплывающих
 * окон убьёт открытие после await), а подписанная ссылка хранилища подставляется
 * в неё после ответа ручки. Ошибка (нет файла, документ отозван, антивирус ещё
 * не проверил) отдаётся наружу целиком — SectionError сам соберёт текст и спойлер.
 */
export function useDocumentDownload() {
  const { session } = useAuth();
  const [error, setError] = useState<unknown>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const download = async (documentId: string): Promise<void> => {
    if (!session || busyId) return;
    setError(null);
    setBusyId(documentId);
    const popup = window.open('', '_blank');
    try {
      const { downloadUrl } = await learnerDocumentsApi.getDownload(session, documentId);
      if (popup) {
        popup.location.replace(downloadUrl);
      } else {
        // Вкладку не дали открыть — пробуем прямое открытие (уже вне клика,
        // может быть заблокировано, но хуже не станет).
        window.open(downloadUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (e) {
      popup?.close();
      setError(e);
    } finally {
      setBusyId(null);
    }
  };

  return { download, error, busyId };
}

export function useEnrollmentDocuments(enrollmentId: string | null | undefined) {
  const { session } = useAuth();
  return useQuery<LearnerDocumentsResponse>({
    queryKey: ['learner-documents', 'enrollment', enrollmentId ?? ''],
    enabled: Boolean(session) && Boolean(enrollmentId),
    queryFn: () => learnerDocumentsApi.listForEnrollment(session!, enrollmentId!)
  });
}
