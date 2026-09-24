'use client';

import {
  BlockedHint,
  DetailDrawer,
  DrawerCancelButton,
  FormSection,
  blockedProps
} from '@trudskill/ui';
import { useState } from 'react';

import {
  CLIENT_REQUISITE_SECTIONS,
  CLIENT_STATUS_LABEL,
  applyInnSuggestion,
  buildClientCreatePayload,
  buildClientUpdatePayload,
  emptyClientForm,
  isInnForSuggest,
  toEditFormState
} from './format';
import { useCreateClient, useInnSuggest, useUpdateClientProfile } from './hooks';
import { isFormDirty } from '../../lib/forms/dirty';
import { hasPermission } from '../../lib/rbac/permissions';
import { useAuth } from '../auth/context';
import { StaffSelect } from '../tasks/staff-select';

import type { ClientEditFormState, ClientListItem, ClientStatus } from './types';

interface ClientEditDrawerProps {
  /** Если задан — drawer в режиме edit; если нет — create. */
  client?: ClientListItem;
  onClose: () => void;
  onSaved: () => void;
}

const SUGGEST_KEY = 'client-inn-suggest';

/** Итог «Заполнить по ИНН» словами: сколько подставлено и что проверить. */
interface SuggestNote {
  text: string;
  warning?: string;
}

export function ClientEditDrawer({ client, onClose, onSaved }: ClientEditDrawerProps) {
  const mode: 'create' | 'edit' = client ? 'edit' : 'create';
  const { session } = useAuth();
  const [form, setForm] = useState<ClientEditFormState>(() =>
    client ? toEditFormState(client) : emptyClientForm()
  );
  // CMP-010 (порция 28): панель обязана предупредить, что закрытие потеряет правки.
  const [initialForm] = useState<ClientEditFormState>(() =>
    client ? toEditFormState(client) : emptyClientForm()
  );
  const [managerName, setManagerName] = useState(client?.managerName ?? '');
  const [suggestNote, setSuggestNote] = useState<SuggestNote | null>(null);
  const createMut = useCreateClient();
  const updateMut = useUpdateClientProfile();
  const suggest = useInnSuggest();
  const mutation = mode === 'edit' ? updateMut : createMut;
  // Список сотрудников отдаёт ручка задач (`tasks.write`); у кого её нет — поле не показываем.
  const canPickManager = hasPermission(session?.permissions ?? [], 'tasks.write');

  function setField<K extends keyof ClientEditFormState>(key: K, value: ClientEditFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const suggestBlocked = isInnForSuggest(form.inn)
    ? undefined
    : 'Введите ИНН — 10 цифр у организации или 12 у предпринимателя.';

  const fillByInn = async () => {
    setSuggestNote(null);
    const found = await suggest.run(form.inn);
    if (!found) return;
    const { form: next, filled } = applyInnSuggestion(form, found);
    setForm(next);
    setSuggestNote({
      text:
        filled > 0
          ? `Заполнено полей: ${filled}. Проверьте их и сохраните компанию.`
          : 'Все поля, которые знает справочник, уже заполнены — ничего не заменено.',
      ...(found.liquidated
        ? {
            warning:
              'По данным реестра организация ликвидирована или ликвидируется — проверьте, с ней ли заключён договор.'
          }
        : {})
    });
  };

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
    <DetailDrawer
      open
      onClose={onClose}
      title={title}
      hasUnsavedChanges={isFormDirty(form, initialForm)}
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="ui-stack">
        <FormSection title="Основное">
          <label className="ui-field">
            <span className="ui-field-label">ИНН</span>
            <input
              className="ui-input"
              value={form.inn}
              onChange={(e) => setField('inn', e.target.value)}
              placeholder="10 или 12 цифр"
              inputMode="numeric"
            />
            <span className="ui-hint">
              По ИНН можно заполнить реквизиты из реестра — заполняются только пустые поля.
            </span>
          </label>
          <div className="ui-form-actions">
            <button
              type="button"
              className={`ui-button ${suggest.isPending ? 'ui-button--loading' : ''}`}
              disabled={suggest.isPending}
              {...blockedProps(SUGGEST_KEY, suggestBlocked)}
              onClick={() => void fillByInn()}
            >
              Заполнить по ИНН
            </button>
            <BlockedHint hintKey={SUGGEST_KEY} reason={suggestBlocked} />
          </div>
          {suggest.error ? (
            <div role="alert" className="ui-error">
              {suggest.error}
            </div>
          ) : null}
          {suggestNote ? (
            <div role="status" className="ui-stack">
              <span>{suggestNote.text}</span>
              {suggestNote.warning ? (
                <p className="ui-callout ui-callout--warning">{suggestNote.warning}</p>
              ) : null}
            </div>
          ) : null}

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
            <span className="ui-field-label">Почта</span>
            <input
              className="ui-input"
              type="email"
              inputMode="email"
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
              type="tel"
              inputMode="tel"
              autoComplete="tel"
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
        </FormSection>

        {CLIENT_REQUISITE_SECTIONS.map((section) => (
          <FormSection key={section.title} title={section.title}>
            {section.fields.map((field) => (
              <label key={field.key} className="ui-field">
                <span className="ui-field-label">{field.label}</span>
                <input
                  className="ui-input"
                  value={form[field.key]}
                  onChange={(e) => setField(field.key, e.target.value)}
                  {...(field.date ? { type: 'date' } : {})}
                  {...(field.numeric ? { inputMode: 'numeric' as const } : {})}
                />
                {field.hint ? <span className="ui-hint">{field.hint}</span> : null}
              </label>
            ))}
            {section.title === 'Договор' && canPickManager ? (
              <StaffSelect
                label="Ответственный за компанию"
                value={form.managerUserId}
                selectedLabel={managerName}
                emptyLabel="— не назначен —"
                onChange={(userId, name) => {
                  setField('managerUserId', userId);
                  setManagerName(name);
                }}
              />
            ) : null}
          </FormSection>
        ))}

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
          <DrawerCancelButton
            className="ui-button"
            disabled={mutation.isPending}
            onFallbackClose={onClose}
          />
          <button
            type="submit"
            className={`ui-button ui-button--primary ${mutation.isPending ? 'ui-button--loading' : ''}`}
            disabled={mutation.isPending}
          >
            Сохранить компанию
          </button>
        </div>
      </form>
    </DetailDrawer>
  );
}
