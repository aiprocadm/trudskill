'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { groupOrdersApi } from './api';
import { useAuth } from '../auth/context';
import { mvpApi } from '../mvp/api';

export interface IssueOrderModalProps {
  open: boolean;
  groupId: string;
  /** Список enrollment.id, для которых выпускать удостоверения (caller фильтрует по completed). */
  enrollmentIds: string[];
  onClose: () => void;
  onSuccess?: (orderId: string, certificatesCount: number) => void;
}

interface TemplateItem {
  id: string;
  name: string;
  templateType: string;
  status: string;
}

/**
 * Pillar A Plan B §5.7 — модалка генерации группового приказа с опциональным
 * каскадом удостоверений. Запрашивает шаблоны через `mvpApi.listDocumentTemplates`,
 * фильтрует по `templateType` на клиенте (бэкенд возвращает все шаблоны tenant'а;
 * этого достаточно для типичных объёмов справочника).
 */
export function IssueOrderModal({
  open,
  groupId,
  enrollmentIds,
  onClose,
  onSuccess
}: IssueOrderModalProps) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [orderTemplateId, setOrderTemplateId] = useState('');
  const [certTemplateId, setCertTemplateId] = useState('');

  const templatesQuery = useQuery({
    queryKey: ['mvp', 'documentTemplates'],
    enabled: Boolean(session) && open,
    queryFn: () => mvpApi.listDocumentTemplates(session!)
  });

  const orderTemplates = useMemo(
    (): TemplateItem[] =>
      (templatesQuery.data?.items ?? []).filter(
        (t) => t.templateType === 'order' && t.status === 'active'
      ),
    [templatesQuery.data]
  );

  const certTemplates = useMemo(
    (): TemplateItem[] =>
      (templatesQuery.data?.items ?? []).filter(
        (t) =>
          (t.templateType === 'certificate' ||
            t.templateType === 'diploma' ||
            t.templateType === 'attestation') &&
          t.status === 'active'
      ),
    [templatesQuery.data]
  );

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!session) {
      setError('Нет активной сессии');
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await groupOrdersApi.issue(session, {
        groupId,
        templateId: orderTemplateId,
        enrollmentIds,
        ...(certTemplateId ? { certificateTemplateId: certTemplateId } : {})
      });
      await queryClient.invalidateQueries({ queryKey: ['issuance-journal'] });
      onSuccess?.(result.order.id, result.certificates.length);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось выпустить приказ');
    } finally {
      setPending(false);
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Сгенерировать приказ по группе"
      className="ui-modal"
    >
      <div className="ui-modal-content">
        <div className="ui-modal-header">
          <h2>Сгенерировать приказ по группе</h2>
        </div>
        <p>
          Учеников будет включено в приказ: <strong>{enrollmentIds.length}</strong>
        </p>

        {templatesQuery.isLoading ? <p>Загрузка шаблонов…</p> : null}
        {templatesQuery.error ? (
          <p className="ui-callout ui-callout--danger">Не удалось загрузить шаблоны</p>
        ) : null}

        {!templatesQuery.isLoading && !templatesQuery.error ? (
          <div className="ui-stack">
            <label className="ui-stack" style={{ gap: 4 }}>
              <span>Шаблон приказа</span>
              <select
                value={orderTemplateId}
                onChange={(event) => setOrderTemplateId(event.target.value)}
              >
                <option value="">— выберите —</option>
                {orderTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              {orderTemplates.length === 0 ? (
                <small>Нет шаблонов типа «Приказ». Создайте в /documents.</small>
              ) : null}
            </label>

            <label className="ui-stack" style={{ gap: 4 }}>
              <span>Шаблон удостоверения (опционально — для каскадного выпуска)</span>
              <select
                value={certTemplateId}
                onChange={(event) => setCertTemplateId(event.target.value)}
                disabled={enrollmentIds.length === 0}
              >
                <option value="">— только приказ без удостоверений —</option>
                {certTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        {error ? <p className="ui-callout ui-callout--danger">Ошибка: {error}</p> : null}

        <div className="ui-modal-actions">
          <button type="button" className="ui-button" onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className="ui-button ui-button--primary"
            disabled={!orderTemplateId || pending}
            onClick={() => void submit()}
          >
            {pending ? 'Выпускаем…' : 'Выпустить'}
          </button>
        </div>
      </div>
    </div>
  );
}
