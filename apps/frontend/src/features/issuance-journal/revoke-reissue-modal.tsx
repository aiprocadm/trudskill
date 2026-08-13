'use client';

import { useQueryClient } from '@tanstack/react-query';
import { DetailDrawer } from '@trudskill/ui';
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

  /*
   * CMP-010 (Фаза 4 срез 3): боковая панель вместо самодельной модалки. Это одна из восьми
   * реализаций «посмотреть/поправить объект», которые ТЗ велит свести к `DetailDrawer` —
   * заодно уходит своя разметка оверлея, а ловушка фокуса, Esc и подтверждение при закрытии
   * с несохранённым текстом приходят из общего слоя. Журнал остаётся виден: причину
   * аннулирования пишут, глядя на строку документа.
   */
  return (
    <DetailDrawer
      open={open}
      onClose={onClose}
      title={labels.title}
      {...(documentNumber ? { subtitle: `Документ № ${documentNumber}` } : {})}
      width="sm"
      hasUnsavedChanges={reason.trim().length > 0}
      footer={
        <div className="ui-inline">
          <button
            type="button"
            className="ui-button ui-button--primary"
            disabled={!reason.trim() || pending}
            onClick={() => void submit()}
          >
            {pending ? 'Выполняем…' : labels.submit}
          </button>
          <button type="button" className="ui-button" onClick={onClose} disabled={pending}>
            Отмена
          </button>
        </div>
      }
    >
      <label className="ui-field">
        <span className="ui-field-label">Причина</span>
        <textarea
          className="ui-input"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={labels.placeholder}
          rows={4}
        />
      </label>
      {error ? <p className="ui-callout ui-callout--danger">{error}</p> : null}
    </DetailDrawer>
  );
}
