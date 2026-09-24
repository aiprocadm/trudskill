'use client';

import {
  DataTable,
  DetailDrawer,
  DrawerCancelButton,
  LoadingState,
  useConfirmDialog
} from '@trudskill/ui';
import { useState } from 'react';

import { clientPeopleApi } from './people-api';
import { CONTACT_STATUS_LABEL, contactName, inviteOutcomeText } from './people-format';
import { useClientContacts } from './people-hooks';
import { SectionCard, SectionEmpty, SectionError } from '../../components/state-wrappers';
import { hasPermission } from '../../lib/rbac/permissions';
import { useAuth } from '../auth/context';

import type { ClientContact, ContactPayload } from './people-types';

interface ContactForm {
  lastName: string;
  firstName: string;
  position: string;
  email: string;
  phone: string;
  isPrimary: boolean;
}

const toForm = (contact?: ClientContact): ContactForm => ({
  lastName: contact?.lastName ?? '',
  firstName: contact?.firstName ?? '',
  position: contact?.position ?? '',
  email: contact?.email ?? '',
  phone: contact?.phone ?? '',
  isPrimary: contact?.isPrimary ?? false
});

const nullable = (value: string): string | null => (value.trim() ? value.trim() : null);

function ContactDrawer({
  counterpartyId,
  contact,
  onClose,
  onSaved
}: {
  counterpartyId: string;
  contact?: ClientContact;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { session } = useAuth();
  const [form, setForm] = useState<ContactForm>(() => toForm(contact));
  const [initial] = useState<ContactForm>(() => toForm(contact));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const set = <K extends keyof ContactForm>(key: K, value: ContactForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!session || !form.firstName.trim()) return;
    setSaving(true);
    setError(null);
    const payload: ContactPayload = {
      firstName: form.firstName.trim(),
      lastName: nullable(form.lastName),
      position: nullable(form.position),
      email: nullable(form.email),
      phone: nullable(form.phone),
      isPrimary: form.isPrimary
    };
    try {
      const saved = contact
        ? await clientPeopleApi.updateContact(session, counterpartyId, contact.id, payload)
        : await clientPeopleApi.createContact(session, counterpartyId, payload);
      onSaved(`Контакт «${contactName(saved)}» сохранён.`);
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  return (
    <DetailDrawer
      open
      onClose={onClose}
      title={contact ? `Контакт: ${contactName(contact)}` : 'Новый контакт компании'}
      hasUnsavedChanges={dirty}
    >
      <form onSubmit={(e) => void submit(e)} className="ui-stack">
        <label className="ui-field">
          <span className="ui-field-label">Фамилия</span>
          <input
            className="ui-input"
            value={form.lastName}
            onChange={(e) => set('lastName', e.target.value)}
          />
        </label>
        <label className="ui-field">
          <span className="ui-field-label">Имя и отчество *</span>
          <input
            className="ui-input"
            value={form.firstName}
            onChange={(e) => set('firstName', e.target.value)}
            required
          />
        </label>
        <label className="ui-field">
          <span className="ui-field-label">Должность</span>
          <input
            className="ui-input"
            value={form.position}
            onChange={(e) => set('position', e.target.value)}
            placeholder="Например, специалист по кадрам"
          />
        </label>
        <label className="ui-field">
          <span className="ui-field-label">Почта</span>
          <input
            className="ui-input"
            type="email"
            inputMode="email"
            autoComplete="off"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
          />
          <span className="ui-hint">
            На неё позже можно выслать приглашение в портал заказчика.
          </span>
        </label>
        <label className="ui-field">
          <span className="ui-field-label">Телефон</span>
          <input
            className="ui-input"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            value={form.phone}
            onChange={(e) => set('phone', e.target.value)}
          />
        </label>
        <label className="ui-inline">
          <input
            type="checkbox"
            checked={form.isPrimary}
            onChange={(e) => set('isPrimary', e.target.checked)}
          />
          <span>Основной контакт компании — с ним центр согласует обучение</span>
        </label>
        {error !== null ? <SectionError error={error} /> : null}
        <div className="ui-modal-actions">
          <DrawerCancelButton className="ui-button" disabled={saving} onFallbackClose={onClose} />
          <button
            type="submit"
            className={`ui-button ui-button--primary ${saving ? 'ui-button--loading' : ''}`}
            disabled={saving}
          >
            Сохранить контакт
          </button>
        </div>
      </form>
    </DetailDrawer>
  );
}

/**
 * Вкладка «Контакты» карточки компании (МГ-D2.1, срез 14.2): кадровик, директор, бухгалтер —
 * с кем центр согласует обучение. Основной у компании один; ушедшего — в архив, а не удалить:
 * он остаётся в истории переписки и задач.
 */
export function ClientContactsSection({
  counterpartyId,
  active
}: {
  counterpartyId: string;
  active: boolean;
}) {
  const { session } = useAuth();
  const canWrite = hasPermission(session?.permissions ?? [], 'counterparties.write');
  const contacts = useClientContacts(counterpartyId, active);
  const [editing, setEditing] = useState<ClientContact | 'new' | null>(null);
  const { ask, dialog } = useConfirmDialog();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const items = contacts.data?.items ?? [];

  const patch = (row: ClientContact, payload: ContactPayload, message: string) => {
    if (!session) return;
    setBusy(true);
    setActionError(null);
    setNotice(null);
    clientPeopleApi
      .updateContact(session, counterpartyId, row.id, payload)
      .then(async () => {
        await contacts.refetch();
        setNotice(message);
      })
      .catch((err: unknown) => setActionError(err))
      .finally(() => setBusy(false));
  };

  /* МГ-D2.1 (срез 14.3): письмо уходит реальному человеку — сначала подтверждение. */
  const invite = (row: ClientContact) =>
    ask(
      {
        title: `Пригласить в портал: ${contactName(row)}`,
        message: `На почту ${row.email ?? ''} придёт ссылка для входа в портал заказчика. Там видны сотрудники этой компании, их группы и документы — и только они.`,
        confirmLabel: 'Пригласить в портал'
      },
      () => {
        if (!session) return;
        setBusy(true);
        setActionError(null);
        setNotice(null);
        clientPeopleApi
          .inviteContact(session, counterpartyId, row.id)
          .then(async (outcome) => {
            await contacts.refetch();
            setNotice(inviteOutcomeText(contactName(row), outcome.status));
          })
          .catch((err: unknown) => setActionError(err))
          .finally(() => setBusy(false));
      }
    );

  const rowActions = (row: ClientContact) =>
    canWrite
      ? [
          { label: 'Изменить контакт', disabled: busy, onSelect: () => setEditing(row) },
          ...(row.status === 'active' && row.email
            ? [{ label: 'Пригласить в портал', disabled: busy, onSelect: () => invite(row) }]
            : []),
          ...(row.status === 'active' && !row.isPrimary
            ? [
                {
                  label: 'Сделать основным',
                  disabled: busy,
                  onSelect: () =>
                    patch(row, { isPrimary: true }, `«${contactName(row)}» — основной контакт.`)
                }
              ]
            : []),
          row.status === 'active'
            ? {
                label: 'Отправить в архив',
                disabled: busy,
                onSelect: () =>
                  patch(row, { status: 'archived' }, `«${contactName(row)}» — в архиве.`)
              }
            : {
                label: 'Вернуть из архива',
                disabled: busy,
                onSelect: () =>
                  patch(row, { status: 'active' }, `«${contactName(row)}» снова действует.`)
              }
        ]
      : [];

  return (
    <SectionCard title="Контакты">
      {dialog}
      <p className="ui-text-muted">
        Люди компании, с которыми центр согласует обучение и которым отправляет документы.
      </p>
      {contacts.isLoading ? <LoadingState message="Загружаем контакты…" /> : null}
      {contacts.error ? (
        <SectionError error={contacts.error} onRetry={() => void contacts.refetch()} />
      ) : null}
      {actionError !== null ? <SectionError error={actionError} /> : null}
      {notice ? (
        <p className="ui-callout" role="status">
          {notice}
        </p>
      ) : null}

      {contacts.data && items.length === 0 ? (
        <SectionEmpty
          message="Контактов пока нет"
          hint={
            canWrite
              ? 'Добавьте кадровика или директора компании — с кем центр согласует обучение и кому отправляет удостоверения.'
              : 'Контакты компании добавляет сотрудник с правом на правку компаний.'
          }
        />
      ) : null}

      {items.length > 0 ? (
        <DataTable
          columns={[
            { key: 'name', title: 'Контакт' },
            { key: 'position', title: 'Должность' },
            { key: 'email', title: 'Почта' },
            { key: 'phone', title: 'Телефон' },
            { key: 'state', title: 'Статус' }
          ]}
          rows={items.map((row) => ({
            ...row,
            name: contactName(row),
            position: row.position ?? '—',
            email: row.email ?? '—',
            phone: row.phone ?? '—',
            state: [
              row.isPrimary ? 'основной' : CONTACT_STATUS_LABEL[row.status],
              ...(row.userId ? ['в портале'] : [])
            ].join(', ')
          }))}
          rowActions={(row) => rowActions(row)}
        />
      ) : null}

      {canWrite && contacts.data ? (
        <div className="ui-form-actions">
          <button
            type="button"
            className="ui-button"
            disabled={busy}
            onClick={() => setEditing('new')}
          >
            Добавить контакт
          </button>
        </div>
      ) : null}

      {editing ? (
        <ContactDrawer
          counterpartyId={counterpartyId}
          {...(editing === 'new' ? {} : { contact: editing })}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            setEditing(null);
            setNotice(message);
            void contacts.refetch();
          }}
        />
      ) : null}
    </SectionCard>
  );
}
