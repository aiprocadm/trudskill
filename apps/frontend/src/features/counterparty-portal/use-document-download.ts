'use client';

import { useState } from 'react';

import { useAuth } from '../auth/context';
import { mvpApi } from '../mvp/api';

/**
 * Ревизия 2026-08-27 (порция 32, журнал 265) — скачивание документа сотрудника в портале.
 *
 * Ручка с проверкой владения и записью в журнал (ФТ-E5, ФТ-G1) существовала, а кнопки не
 * было: представитель компании видел список документов и не мог взять ни один из них.
 *
 * Вкладка открывается СИНХРОННО в обработчике клика — иначе блокировщик всплывающих окон
 * убьёт открытие после ожидания ответа; подписанная ссылка хранилища подставляется в неё
 * потом. Тот же приём, что в кабинете слушателя (порция 21).
 */
export function usePortalDocumentDownload() {
  const { session } = useAuth();
  const [error, setError] = useState<unknown>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const download = async (documentId: string): Promise<void> => {
    if (!session || busyId) return;
    setError(null);
    setBusyId(documentId);
    const popup = window.open('', '_blank');
    try {
      const { downloadUrl } = await mvpApi.downloadPortalDocument(session, documentId);
      if (popup) {
        popup.location.replace(downloadUrl);
      } else {
        window.open(downloadUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (failure) {
      popup?.close();
      setError(failure);
    } finally {
      setBusyId(null);
    }
  };

  return { download, error, busyId };
}
