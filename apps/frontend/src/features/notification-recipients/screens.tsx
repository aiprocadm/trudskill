'use client';

import { LoadingState } from '@trudskill/ui';
import { type ReactElement, useEffect, useState } from 'react';

import { useNotificationRecipients, useNotificationRecipientsMutation } from './hooks';
import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionError
} from '../../components/state-wrappers';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function NotificationRecipientsScreen(): ReactElement {
  const { data, isLoading, error } = useNotificationRecipients();
  const { save, savePending } = useNotificationRecipientsMutation();

  const [emails, setEmails] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Seed the editable list once the query resolves (data is the source of truth on load).
  useEffect(() => {
    if (data) setEmails(data.length > 0 ? data : ['']);
  }, [data]);

  const setAt = (index: number, value: string) =>
    setEmails((prev) => prev.map((e, i) => (i === index ? value : e)));
  const removeAt = (index: number) =>
    setEmails((prev) => (prev.length <= 1 ? [''] : prev.filter((_, i) => i !== index)));
  const addRow = () => setEmails((prev) => [...prev, '']);

  const cleaned = emails.map((e) => e.trim()).filter(Boolean);
  const hasInvalid = cleaned.some((e) => !EMAIL_RE.test(e));

  const onSave = async () => {
    setNotice(null);
    setActionError(null);
    try {
      const saved = await save(cleaned);
      setEmails(saved.length > 0 ? saved : ['']);
      setNotice(
        saved.length > 0
          ? `Сохранено. Сотрудники в копии: ${saved.length}.`
          : 'Сохранено. Копии сотрудникам выключены.'
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Не удалось сохранить');
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Уведомления сотрудникам"
        subtitle="Адреса, на которые дублируются письма о переаттестации, приближении дедлайна и отзыве документа (помимо слушателя и заказчика). Пустой список — копии выключены."
      />

      <SectionCard title="Адреса сотрудников">
        {isLoading ? <LoadingState message="Загрузка настроек…" /> : null}
        {error ? <SectionError message="Не удалось загрузить настройки уведомлений" /> : null}

        {!isLoading && !error ? (
          <div className="ui-stack" style={{ gap: 12 }}>
            {emails.map((email, index) => (
              <div key={index} className="ui-inline" style={{ gap: 8 }}>
                <input
                  type="email"
                  className="ui-input"
                  style={{ minWidth: 280 }}
                  placeholder="curator@example.ru"
                  value={email}
                  onChange={(e) => setAt(index, e.target.value)}
                  aria-label={`Email сотрудника ${index + 1}`}
                />
                <button type="button" className="ui-button" onClick={() => removeAt(index)}>
                  Убрать
                </button>
              </div>
            ))}

            <div>
              <button type="button" className="ui-button" onClick={addRow}>
                + Добавить адрес
              </button>
            </div>

            {hasInvalid ? (
              <p className="ui-callout ui-callout--danger">
                Проверьте формат адресов — есть некорректные.
              </p>
            ) : null}
            {notice ? <p className="ui-callout">{notice}</p> : null}
            {actionError ? <SectionError message={actionError} /> : null}

            <div>
              <button
                type="button"
                className="ui-button ui-button--primary"
                disabled={savePending || hasInvalid}
                onClick={() => void onSave()}
              >
                {savePending ? 'Сохраняем…' : 'Сохранить'}
              </button>
            </div>
          </div>
        ) : null}
      </SectionCard>
    </PageContainer>
  );
}
