'use client';

import { Dialog } from '@trudskill/ui';
import { useState } from 'react';

import { STATUS_LABEL, buildUpdatePayload } from './format';
import { useUpdateLearnerProfile } from './hooks';

import type { LearnerEditFormState, LearnerListItem, LearnerStatus } from './types';

interface LearnerEditDrawerProps {
  learner: LearnerListItem;
  onClose: () => void;
  onSaved: () => void;
}

function toFormState(learner: LearnerListItem): LearnerEditFormState {
  return {
    firstName: learner.firstName,
    lastName: learner.lastName,
    middleName: learner.middleName ?? '',
    email: learner.email ?? '',
    snils: learner.snils ?? '',
    position: learner.position ?? '',
    organizationUnitId: learner.organizationUnitId ?? '',
    learnerNo: learner.learnerNo ?? '',
    status: learner.status
  };
}

export function LearnerEditDrawer({ learner, onClose, onSaved }: LearnerEditDrawerProps) {
  const [form, setForm] = useState<LearnerEditFormState>(() => toFormState(learner));
  const mutation = useUpdateLearnerProfile();

  function setField<K extends keyof LearnerEditFormState>(key: K, value: LearnerEditFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) return;
    const payload = buildUpdatePayload(form);
    const result = await mutation.mutate(learner.id, payload);
    if (result) onSaved();
  };

  return (
    <Dialog open onClose={onClose} title="Редактировать ученика">
      <form onSubmit={(e) => void handleSubmit(e)} className="ui-stack">
        <label className="ui-field">
          <span className="ui-field-label">Фамилия *</span>
          <input
            className="ui-input"
            value={form.lastName}
            onChange={(e) => setField('lastName', e.target.value)}
            required
          />
        </label>

        <label className="ui-field">
          <span className="ui-field-label">Имя *</span>
          <input
            className="ui-input"
            value={form.firstName}
            onChange={(e) => setField('firstName', e.target.value)}
            required
          />
        </label>

        <label className="ui-field">
          <span className="ui-field-label">Отчество</span>
          <input
            className="ui-input"
            value={form.middleName}
            onChange={(e) => setField('middleName', e.target.value)}
          />
        </label>

        <label className="ui-field">
          <span className="ui-field-label">Email</span>
          <input
            className="ui-input"
            type="email"
            value={form.email}
            onChange={(e) => setField('email', e.target.value)}
            autoComplete="off"
          />
        </label>

        <label className="ui-field">
          <span className="ui-field-label">СНИЛС</span>
          <input
            className="ui-input"
            value={form.snils}
            onChange={(e) => setField('snils', e.target.value)}
            placeholder="123-456-789 01"
          />
        </label>

        <label className="ui-field">
          <span className="ui-field-label">Должность</span>
          <input
            className="ui-input"
            value={form.position}
            onChange={(e) => setField('position', e.target.value)}
          />
        </label>

        <label className="ui-field">
          <span className="ui-field-label">Подразделение</span>
          <input
            className="ui-input"
            value={form.organizationUnitId}
            onChange={(e) => setField('organizationUnitId', e.target.value)}
          />
        </label>

        <label className="ui-field">
          <span className="ui-field-label">Учётный номер</span>
          <input
            className="ui-input"
            value={form.learnerNo}
            onChange={(e) => setField('learnerNo', e.target.value)}
          />
        </label>

        <label className="ui-field">
          <span className="ui-field-label">Статус</span>
          <select
            className="ui-select"
            value={form.status}
            onChange={(e) => setField('status', e.target.value as LearnerStatus)}
          >
            <option value="active">{STATUS_LABEL.active}</option>
            <option value="archived">{STATUS_LABEL.archived}</option>
          </select>
        </label>

        {mutation.error ? (
          <div role="alert" className="ui-error">
            {mutation.error}
          </div>
        ) : null}

        <div className="ui-modal-actions">
          <button
            type="button"
            className="ui-button"
            onClick={onClose}
            disabled={mutation.isPending}
          >
            Отмена
          </button>
          <button
            type="submit"
            className="ui-button ui-button--primary"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
