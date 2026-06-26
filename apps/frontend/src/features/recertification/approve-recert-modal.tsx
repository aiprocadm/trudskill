'use client';

import { useState } from 'react';

import { useGroupsList } from '../mvp/hooks';

export interface ApproveRecertModalProps {
  open: boolean;
  /** Контекст черновика — чтобы админ перезачислял в правильную группу. */
  learnerName: string;
  courseTitle: string;
  pending: boolean;
  /** Зачисляет слушателя в выбранную группу; бросает при ошибке. */
  onConfirm: (targetGroupId: string) => Promise<void>;
  onSuccess: () => void;
  onClose: () => void;
}

/**
 * Phase 5C-2 — модалка перезачисления по переаттестации. Загружает группы тенанта
 * (`useGroupsList`, как в массовой загрузке) и делегирует зачисление в `onConfirm`
 * (хук экрана идёт через bulk-enroll path, идемпотентно по черновику). Курс черновика
 * показан для контекста — группы не фильтруются по курсу (связь group→course — отдельный
 * join `GroupCourse`; объёмы справочника групп невелики, как и в массовой загрузке).
 */
export function ApproveRecertModal({
  open,
  learnerName,
  courseTitle,
  pending,
  onConfirm,
  onSuccess,
  onClose
}: ApproveRecertModalProps) {
  const groups = useGroupsList({ page: 1, page_size: 100 });
  const [targetGroupId, setTargetGroupId] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const submit = async () => {
    setError(null);
    try {
      await onConfirm(targetGroupId);
      onSuccess();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось перезачислить слушателя');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Перезачислить на переаттестацию"
      className="ui-modal"
    >
      <div className="ui-modal-content">
        <div className="ui-modal-header">
          <h2>Перезачислить на переаттестацию</h2>
        </div>
        <p>
          Слушатель: <strong>{learnerName || '—'}</strong>
          <br />
          Истекающий курс: <strong>{courseTitle || '—'}</strong>
        </p>

        {groups.loading ? <p>Загрузка групп…</p> : null}
        {groups.error ? (
          <p className="ui-callout ui-callout--danger">Не удалось загрузить группы</p>
        ) : null}

        {!groups.loading && !groups.error ? (
          <div className="ui-stack">
            <label className="ui-stack" style={{ gap: 4 }}>
              <span>Группа для перезачисления</span>
              <select
                value={targetGroupId}
                onChange={(event) => setTargetGroupId(event.target.value)}
              >
                <option value="">— выберите —</option>
                {(groups.data?.items ?? []).map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.code})
                  </option>
                ))}
              </select>
              {(groups.data?.items ?? []).length === 0 ? (
                <small>Нет групп. Создайте группу в /groups.</small>
              ) : null}
            </label>
          </div>
        ) : null}

        {error ? <p className="ui-callout ui-callout--danger">Ошибка: {error}</p> : null}

        <div className="ui-modal-actions">
          <button type="button" className="ui-button" onClick={onClose} disabled={pending}>
            Отмена
          </button>
          <button
            type="button"
            className="ui-button ui-button--primary"
            disabled={!targetGroupId || pending}
            onClick={() => void submit()}
          >
            {pending ? 'Перезачисляем…' : 'Перезачислить'}
          </button>
        </div>
      </div>
    </div>
  );
}
