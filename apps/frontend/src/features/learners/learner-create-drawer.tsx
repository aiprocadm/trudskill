'use client';

import { DetailDrawer, DrawerCancelButton } from '@trudskill/ui';
import { useState } from 'react';

import { useCreateLearner } from './hooks';
import { isFormDirty } from '../../lib/forms/dirty';

interface LearnerCreateDrawerProps {
  onClose: () => void;
  onCreated: () => void;
}

/**
 * `TPL-001` · заведение слушателя поштучно.
 *
 * До среза 44 такого пути в интерфейсе не было: реестр слушателей — «эталонный» экран
 * редизайна — не отвечал на вопрос «как добавить человека». Единственным способом
 * оставался массовый импорт Excel, даже когда человек один.
 *
 * Поля ровно те, что принимает ручка `POST /learners`. Почта, СНИЛС и должность здесь
 * НЕ спрашиваются намеренно: их принимает правка карточки, а обязательность СНИЛС и даты
 * рождения — открытый вопрос владельца (№12 трекера «Арендной СДО»). Спрашивать поле,
 * назначение которого ещё не решено, значит собирать данные наугад.
 *
 * `CMP-010`: открывается панелью, а не модалкой — список остаётся виден.
 */
export function LearnerCreateDrawer({ onClose, onCreated }: LearnerCreateDrawerProps) {
  const [fullName, setFullName] = useState('');
  const [learnerNo, setLearnerNo] = useState('');
  const [unit, setUnit] = useState('');
  // CMP-010 (порция 28): создание с заполненными полями не должно теряться молча.
  const hasUnsavedChanges = isFormDirty(
    { fullName, learnerNo, unit },
    { fullName: '', learnerNo: '', unit: '' }
  );
  const creation = useCreateLearner();

  const canSubmit = fullName.trim().length > 0 && learnerNo.trim().length > 0;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    const created = await creation.mutate({
      name: fullName.trim(),
      code: learnerNo.trim(),
      ...(unit.trim() ? { organizationUnitId: unit.trim() } : {})
    });
    if (created) onCreated();
  };

  return (
    <DetailDrawer
      open
      onClose={onClose}
      title="Новый слушатель"
      width="md"
      hasUnsavedChanges={hasUnsavedChanges}
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="ui-stack">
        <label className="ui-field">
          <span className="ui-field-label">Фамилия, имя и отчество *</span>
          <input
            className="ui-input"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="Иванов Иван Иванович"
            required
          />
          {/*
            Одно поле, а не три: так пишут в приказе и в удостоверении, и так же данные
            приходят из Excel. Сервер разбирает строку тем же разбором, что и массовый
            импорт, — карточка получается одинаковой независимо от пути ввода.
          */}
          <span className="ui-field-hint">
            Как в паспорте: сначала фамилия. Отчество можно не указывать.
          </span>
        </label>

        <label className="ui-field">
          <span className="ui-field-label">Личный номер *</span>
          <input
            className="ui-input"
            value={learnerNo}
            onChange={(event) => setLearnerNo(event.target.value)}
            placeholder="2026-001"
            required
          />
          <span className="ui-field-hint">
            Ваш внутренний номер слушателя — он попадает в журнал выдачи документов.
          </span>
        </label>

        <label className="ui-field">
          <span className="ui-field-label">Подразделение</span>
          <input
            className="ui-input"
            value={unit}
            onChange={(event) => setUnit(event.target.value)}
            placeholder="Например: цех №2"
          />
        </label>

        {creation.error ? (
          <p className="ui-field-error" role="alert">
            {creation.error}
          </p>
        ) : null}

        <div className="ui-inline">
          <button
            type="submit"
            className={`ui-button ui-button--primary ${creation.isPending ? 'ui-button--loading' : ''}`}
            disabled={!canSubmit || creation.isPending}
          >
            {/* TXT-002/TXT-003: подпись называет результат и не меняется по ходу. */}
            Завести слушателя
          </button>
          <DrawerCancelButton className="ui-button" onFallbackClose={onClose} />
        </div>
      </form>
    </DetailDrawer>
  );
}
