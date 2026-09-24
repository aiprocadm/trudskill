'use client';

import { BlockedHint, DetailDrawer, DrawerCancelButton, blockedProps } from '@trudskill/ui';
import { type FormEvent, useMemo, useState } from 'react';

import { SectionError } from '../../components/state-wrappers';
import { isFormDirty } from '../../lib/forms/dirty';
import { useDomainMutations, useRoles } from '../mvp/hooks';
import { roleNameRu } from '../texts/roles.ru';

import type { InviteUserOutcome } from '../mvp/types';

const FORM_ID = 'user-invite-form';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Не сотрудники: слушатель и представитель заказчика заводятся своими путями (РМ75). */
const NOT_STAFF_ROLES = new Set(['learner', 'counterparty_rep']);

interface InviteForm {
  displayName: string;
  email: string;
  position: string;
  roleCodes: string[];
}

const EMPTY: InviteForm = { displayName: '', email: '', position: '', roleCodes: [] };

/** Что стало с письмом — одной фразой, без кодов (TXT-004). */
export const inviteStatusText = (outcome: InviteUserOutcome): string => {
  switch (outcome.invite.status) {
    case 'sent':
      return `Письмо со ссылкой для входа отправлено на ${outcome.user.email ?? 'почту'} — ссылка действует 15 минут.`;
    case 'throttled':
      return 'Учётная запись создана, но письмо не ушло: слишком много запросов ссылки на этот адрес. Повторить можно через 15 минут — сотрудник сам запросит ссылку формой «Вход по ссылке».';
    case 'logged':
      return 'Учётная запись создана; почта на этом стенде выключена — ссылка для входа записана в журнал сервера.';
    default:
      return 'Учётная запись создана.';
  }
};

/**
 * Приглашение сотрудника (ТЗ перехода МГ-J3.2; CMP-010; срез 8.11).
 *
 * Одна панель — одна ручка `POST /users/invite`: учётка без пароля, роли под лимитом
 * сотрудников, письмо со ссылкой входа. Результат показывается здесь же: кому ушло письмо
 * или почему не ушло — закрывать панель, не зная этого, нельзя.
 */
export function UserInviteDrawer({
  onClose,
  onInvited
}: {
  onClose: () => void;
  onInvited: () => void;
}) {
  const { data: roles } = useRoles();
  const { inviteUser } = useDomainMutations();
  const [form, setForm] = useState<InviteForm>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [outcome, setOutcome] = useState<InviteUserOutcome | null>(null);
  const staffRoles = useMemo(
    () => (roles ?? []).filter((role) => !NOT_STAFF_ROLES.has(role.code)),
    [roles]
  );
  const dirty = isFormDirty(form, EMPTY) && outcome === null;

  const blockedReason =
    form.displayName.trim().length < 3
      ? 'Укажите фамилию и имя сотрудника.'
      : !EMAIL_RE.test(form.email.trim())
        ? 'Укажите рабочую почту — на неё уйдёт ссылка для входа.'
        : form.roleCodes.length === 0
          ? 'Выберите хотя бы одну роль — она определяет, что сотрудник сможет делать.'
          : undefined;

  const toggleRole = (code: string, checked: boolean) =>
    setForm((prev) => ({
      ...prev,
      roleCodes: checked ? [...prev.roleCodes, code] : prev.roleCodes.filter((c) => c !== code)
    }));

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (blockedReason) return;
    setSaving(true);
    setError(null);
    try {
      const result = await inviteUser({
        displayName: form.displayName.trim(),
        email: form.email.trim(),
        roleCodes: form.roleCodes,
        ...(form.position.trim() ? { position: form.position.trim() } : {})
      });
      setOutcome(result);
      onInvited();
    } catch (inviteError) {
      setError(inviteError);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DetailDrawer
      open
      onClose={onClose}
      title="Пригласить сотрудника"
      subtitle="Учётная запись без пароля: сотрудник входит по ссылке из письма"
      width="md"
      hasUnsavedChanges={dirty}
      footer={
        outcome ? (
          <div className="ui-inline">
            <button type="button" className="ui-button ui-button--primary" onClick={onClose}>
              Готово: к списку сотрудников
            </button>
          </div>
        ) : (
          <div className="ui-inline">
            <DrawerCancelButton className="ui-button" disabled={saving} onFallbackClose={onClose} />
            <button
              type="submit"
              form={FORM_ID}
              className={`ui-button ui-button--primary ${saving ? 'ui-button--loading' : ''}`}
              disabled={saving}
              {...blockedProps('user-invite-submit', blockedReason)}
            >
              Пригласить сотрудника
            </button>
            <BlockedHint hintKey="user-invite-submit" reason={blockedReason} />
          </div>
        )
      }
    >
      {outcome ? (
        <div className="ui-stack" role="status">
          <p>
            <strong>{outcome.user.displayName}</strong> —{' '}
            {outcome.roles.map((role) => roleNameRu(role.code)).join(', ')}.
          </p>
          <p>{inviteStatusText(outcome)}</p>
        </div>
      ) : (
        <form
          id={FORM_ID}
          className="ui-stack"
          onSubmit={(event) => void onSubmit(event)}
          noValidate
        >
          {error !== null ? <SectionError error={error} /> : null}
          <label htmlFor="user-invite-name" className="ui-field">
            <span className="ui-field-label">Фамилия, имя и отчество</span>
            <input
              id="user-invite-name"
              required
              value={form.displayName}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, displayName: event.target.value }))
              }
              autoComplete="name"
              placeholder="Иванова Мария Петровна"
            />
          </label>
          <label htmlFor="user-invite-email" className="ui-field">
            <span className="ui-field-label">Рабочая почта</span>
            <input
              id="user-invite-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
              placeholder="имя@компания.рф"
              aria-describedby="user-invite-email-hint"
            />
            <p id="user-invite-email-hint" className="ui-field-hint">
              Почта станет логином; на неё уйдёт письмо со ссылкой для входа.
            </p>
          </label>
          <label htmlFor="user-invite-position" className="ui-field">
            <span className="ui-field-label">Должность</span>
            <input
              id="user-invite-position"
              value={form.position}
              onChange={(event) => setForm((prev) => ({ ...prev, position: event.target.value }))}
              placeholder="Например: методист"
            />
          </label>
          <fieldset className="ui-field">
            <legend className="ui-field-label">Роль в системе</legend>
            <div className="ui-stack" role="group" aria-label="Роли сотрудника">
              {staffRoles.length === 0 ? (
                <p className="ui-hint">Загружаем роли центра…</p>
              ) : (
                staffRoles.map((role) => (
                  <label key={role.code} className="ui-option">
                    <input
                      type="checkbox"
                      checked={form.roleCodes.includes(role.code)}
                      onChange={(event) => toggleRole(role.code, event.target.checked)}
                    />
                    <span>{roleNameRu(role.code)}</span>
                  </label>
                ))
              )}
            </div>
            <p className="ui-field-hint">
              Роль определяет, что человек увидит и сможет сделать. Изменить её можно позже в
              карточке сотрудника.
            </p>
          </fieldset>
        </form>
      )}
    </DetailDrawer>
  );
}
