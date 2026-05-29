'use client';

import { Dialog } from '@cdoprof/ui';
import { useState } from 'react';

import {
  CLIENT_STATUS_LABEL,
  buildClientCreatePayload,
  buildClientUpdatePayload,
  emptyClientForm,
  toEditFormState
} from './format';
import { useCreateClient, useUpdateClientProfile } from './hooks';

import type { ClientEditFormState, ClientListItem, ClientStatus } from './types';

interface ClientEditDrawerProps {
  /** Если задан — drawer в режиме edit; если нет — create. */
  client?: ClientListItem;
  onClose: () => void;
  onSaved: () => void;
}

export function ClientEditDrawer({ client, onClose, onSaved }: ClientEditDrawerProps) {
  const mode: 'create' | 'edit' = client ? 'edit' : 'create';
  const [form, setForm] = useState<ClientEditFormState>(() =>
    client ? toEditFormState(client) : emptyClientForm()
  );
  const createMut = useCreateClient();
  const updateMut = useUpdateClientProfile();
  const mutation = mode === 'edit' ? updateMut : createMut;

  function setField<K extends keyof ClientEditFormState>(key: K, value: ClientEditFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim()) return;
    if (mode === 'create') {
      const result = await createMut.mutate(buildClientCreatePayload(form));
      if (result) onSaved();
    } else if (client) {
      const result = await updateMut.mutate(client.id, buildClientUpdatePayload(form));
      if (result) onSaved();
    }
  };

  const title = mode === 'create' ? 'Добавить компанию' : `Редактировать «${client?.name ?? ''}»`;

  return (
    <Dialog open onClose={onClose} title={title}>
      <form onSubmit={(e) => void handleSubmit(e)} className="ui-stack">
        <label className="ui-field">
          <span className="ui-field-label">Код *</span>
          <input
            className="ui-input"
            value={form.code}
            onChange={(e) => setField('code', e.target.value)}
            required
          />
        </label>

        <label className="ui-field">
          <span className="ui-field-label">Название *</span>
          <input
            className="ui-input"
            value={form.name}
            onChange={(e) => setField('name', e.target.value)}
            required
          />
        </label>

        <label className="ui-field">
          <span className="ui-field-label">Юр. название</span>
          <input
            className="ui-input"
            value={form.legalName}
            onChange={(e) => setField('legalName', e.target.value)}
          />
        </label>

        <label className="ui-field">
          <span className="ui-field-label">ИНН</span>
          <input
            className="ui-input"
            value={form.inn}
            onChange={(e) => setField('inn', e.target.value)}
            placeholder="10 или 12 цифр"
            inputMode="numeric"
          />
        </label>

        <label className="ui-field">
          <span className="ui-field-label">КПП</span>
          <input
            className="ui-input"
            value={form.kpp}
            onChange={(e) => setField('kpp', e.target.value)}
            placeholder="9 цифр"
            inputMode="numeric"
          />
        </label>

        <label className="ui-field">
          <span className="ui-field-label">Email</span>
          <input
            className="ui-input"
            type="email"
            value={form.contactEmail}
            onChange={(e) => setField('contactEmail', e.target.value)}
            autoComplete="off"
          />
        </label>

        <label className="ui-field">
          <span className="ui-field-label">Телефон</span>
          <input
            className="ui-input"
            value={form.contactPhone}
            onChange={(e) => setField('contactPhone', e.target.value)}
          />
        </label>

        <label className="ui-field">
          <span className="ui-field-label">Юридический адрес</span>
          <input
            className="ui-input"
            value={form.legalAddress}
            onChange={(e) => setField('legalAddress', e.target.value)}
          />
        </label>

        <label className="ui-field">
          <span className="ui-field-label">Заметка</span>
          <textarea
            className="ui-textarea"
            value={form.note}
            onChange={(e) => setField('note', e.target.value)}
            rows={3}
          />
        </label>

        {mode === 'edit' ? (
          <label className="ui-field">
            <span className="ui-field-label">Статус</span>
            <select
              className="ui-select"
              value={form.status}
              onChange={(e) => setField('status', e.target.value as ClientStatus)}
            >
              <option value="active">{CLIENT_STATUS_LABEL.active}</option>
              <option value="archived">{CLIENT_STATUS_LABEL.archived}</option>
            </select>
          </label>
        ) : null}

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
