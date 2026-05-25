'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { issuanceJournalApi } from './api';
import { useAuth } from '../auth/context';

export type RevokeReissueAction = 'revoke' | 'reissue';

export interface RevokeReissueModalProps {
  open: boolean;
  action: RevokeReissueAction;
  documentId: string;
  documentNumber?: string;
  onClose: () => void;
  onSuccess?: () => void;
}

const LABELS: Record<RevokeReissueAction, { title: string; submit: string; placeholder: string }> =
  {
    revoke: {
      title: 'Аннулировать документ',
      submit: 'Аннулировать',
      placeholder: 'Опишите причину аннулирования (обязательно)'
    },
    reissue: {
      title: 'Перевыпустить документ',
      submit: 'Перевыпустить',
      placeholder: 'Опишите причину перевыпуска (обязательно)'
    }
  };

export function RevokeReissueModal({
  open,
  action,
  documentId,
  documentNumber,
  onClose,
  onSuccess
}: RevokeReissueModalProps) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const labels = LABELS[action];

  const submit = async () => {
    if (!session) {
      setError('Нет активной сессии');
      return;
    }
    if (!reason.trim()) {
      setError('Причина обязательна');
      return;
    }
    setPending(true);
    setError(null);
    try {
      if (action === 'revoke') {
        await issuanceJournalApi.revoke(session, documentId, reason);
      } else {
        await issuanceJournalApi.reissue(session, documentId, reason);
      }
      await queryClient.invalidateQueries({ queryKey: ['issuance-journal'] });
      onSuccess?.();
      onClose();
      setReason('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось выполнить операцию');
    } finally {
      setPending(false);
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={labels.title}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}
    >
      <div
        className="ui-section-card"
        style={{ background: 'white', padding: 24, minWidth: 420, maxWidth: 560 }}
      >
        <h2 className="ui-page-title" style={{ marginTop: 0 }}>
          {labels.title}
        </h2>
        {documentNumber ? (
          <p>
            Документ № <strong>{documentNumber}</strong>
          </p>
        ) : null}
        <label className="ui-stack" style={{ gap: 4 }}>
          <span>Причина</span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={labels.placeholder}
            rows={4}
            style={{ width: '100%' }}
          />
        </label>
        {error ? <p style={{ color: 'crimson', marginTop: 8 }}>{error}</p> : null}
        <div className="ui-inline" style={{ marginTop: 16, gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="ui-button" onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className="ui-button ui-button--primary"
            disabled={!reason.trim() || pending}
            onClick={() => void submit()}
          >
            {pending ? 'Выполняем…' : labels.submit}
          </button>
        </div>
      </div>
    </div>
  );
}
