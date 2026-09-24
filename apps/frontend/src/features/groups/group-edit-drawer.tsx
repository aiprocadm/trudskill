'use client';

import { BlockedHint, DetailDrawer, DrawerCancelButton, blockedProps } from '@trudskill/ui';
import { type FormEvent, useMemo, useState } from 'react';

import {
  GROUP_LOCKED_REASON,
  groupEditDiff,
  groupEditErrors,
  groupEditFormOf
} from './group-edit-model';
import { ClientSelect } from './group-picker';
import { STUDY_FORM_LABEL, isGroupLocked } from './group-status';
import { FieldError, FormErrorSummary } from '../../components/form-feedback';
import { SectionError } from '../../components/state-wrappers';
import { isFormDirty } from '../../lib/forms/dirty';
import { hasPermission } from '../../lib/rbac/permissions';
import { useAuth } from '../auth/context';
import { useDomainMutations } from '../mvp/hooks';
import { StaffSelect } from '../tasks/staff-select';

import type { GroupEditForm } from './group-edit-model';
import type { Group } from '../mvp/types';

const FORM_ID = 'group-edit-form';

/**
 * Дровер правки группы (ТЗ перехода §6.3 МГ-B4.1; CMP-010; срез 8.9).
 *
 * Те же поля, что у шагов 1–2 мастера, без курсов (РМ68). У закрытой, отменённой и архивной
 * группы даты, код и компания заблокированы с объяснением — то же правило держит сервер
 * (409 `group_closed`); в запрос уходит только разница с исходной формой (РМ69), поэтому
 * правка комментария у закрытой группы проходит. Закрытие с правками — подтверждение панели.
 */
export function GroupEditDrawer({
  group,
  onClose,
  onSaved
}: {
  group: Group;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { saveGroup } = useDomainMutations();
  const { session } = useAuth();
  const canPickResponsible = hasPermission(session?.permissions ?? [], 'tasks.write');
  const [responsibleName, setResponsibleName] = useState(group.responsibleName ?? '');
  const [initial] = useState<GroupEditForm>(() => groupEditFormOf(group));
  const [form, setForm] = useState<GroupEditForm>(() => groupEditFormOf(group));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [submitted, setSubmitted] = useState(false);
  const locked = isGroupLocked(group.status);
  const lockedReason = locked ? GROUP_LOCKED_REASON : undefined;

  const set = <K extends keyof GroupEditForm>(key: K, value: GroupEditForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const errors = useMemo(() => groupEditErrors(form), [form]);
  const diff = useMemo(() => groupEditDiff(initial, form, locked), [initial, form, locked]);
  const dirty = isFormDirty(form, initial);
  const formErrors = submitted
    ? Object.entries(errors).map(([field, message]) => ({ field, message: message ?? '' }))
    : [];
  const saveBlockedReason = !dirty
    ? 'Изменений нет — нечего сохранять.'
    : Object.keys(diff).length === 0
      ? GROUP_LOCKED_REASON
      : undefined;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0 || saveBlockedReason) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveGroup(group.id, diff);
      onSaved();
    } catch (error) {
      setSaveError(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DetailDrawer
      open
      onClose={onClose}
      title={`Редактировать группу: ${group.name}`}
      {...(locked ? { subtitle: 'Группа закрыта — правятся только описательные поля' } : {})}
      width="md"
      hasUnsavedChanges={dirty}
      footer={
        <div className="ui-inline">
          <DrawerCancelButton className="ui-button" disabled={saving} onFallbackClose={onClose} />
          <button
            type="submit"
            form={FORM_ID}
            className={`ui-button ui-button--primary ${saving ? 'ui-button--loading' : ''}`}
            disabled={saving}
            {...blockedProps('group-edit-save', saveBlockedReason)}
          >
            Сохранить группу
          </button>
          <BlockedHint hintKey="group-edit-save" reason={saveBlockedReason} />
        </div>
      }
    >
      <form id={FORM_ID} className="ui-stack" onSubmit={(event) => void onSubmit(event)} noValidate>
        <FormErrorSummary id="group-edit-summary" errors={formErrors} />
        {saveError !== null ? <SectionError error={saveError} /> : null}

        <label htmlFor="group-edit-name" className="ui-field">
          <span className="ui-field-label">Название группы</span>
          <input
            id="group-edit-name"
            required
            value={form.name}
            onChange={(event) => set('name', event.target.value)}
            aria-invalid={Boolean(submitted && errors.name)}
            aria-describedby={submitted && errors.name ? 'group-edit-name-error' : undefined}
          />
          <FieldError id="group-edit-name-error" message={submitted ? errors.name : undefined} />
        </label>

        {/* Замок закрытой группы — одним блоком с объяснением, а не молчаливым disabled (Э8). */}
        <fieldset
          className="ui-stack"
          aria-label="Код, компания и даты"
          {...blockedProps('group-edit-locked', lockedReason)}
        >
          <BlockedHint hintKey="group-edit-locked" reason={lockedReason} />
          <label htmlFor="group-edit-code" className="ui-field">
            <span className="ui-field-label">Короткий код</span>
            <input
              id="group-edit-code"
              value={form.code}
              onChange={(event) => set('code', event.target.value)}
              aria-invalid={Boolean(submitted && errors.code)}
              aria-describedby={
                submitted && errors.code ? 'group-edit-code-error' : 'group-edit-code-hint'
              }
            />
            <p id="group-edit-code-hint" className="ui-field-hint">
              Код должен быть уникальным в центре — занятый код сервер отклонит.
            </p>
            <FieldError id="group-edit-code-error" message={submitted ? errors.code : undefined} />
          </label>
          <div className="ui-field">
            <ClientSelect
              value={form.counterpartyId}
              onChange={(counterpartyId) => set('counterpartyId', counterpartyId)}
              label="Компания-заказчик"
              emptyLabel="— без компании: учатся физлица —"
            />
          </div>
          {/* МГ-B1.2 (срез 17.2): ответственный — выбор из сотрудников центра (список — право задач). */}
          {canPickResponsible ? (
            <StaffSelect
              label="Ответственный за группу"
              value={form.responsibleUserId}
              selectedLabel={responsibleName}
              emptyLabel="— не назначен —"
              onChange={(userId, name) => {
                set('responsibleUserId', userId);
                setResponsibleName(name);
              }}
            />
          ) : null}
          <label htmlFor="group-edit-start" className="ui-field">
            <span className="ui-field-label">Начало обучения</span>
            <input
              id="group-edit-start"
              type="date"
              value={form.startDate}
              onChange={(event) => set('startDate', event.target.value)}
            />
          </label>
          <label htmlFor="group-edit-end" className="ui-field">
            <span className="ui-field-label">Окончание обучения</span>
            <input
              id="group-edit-end"
              type="date"
              value={form.endDate}
              onChange={(event) => set('endDate', event.target.value)}
              aria-invalid={Boolean(submitted && errors.endDate)}
              aria-describedby={submitted && errors.endDate ? 'group-edit-end-error' : undefined}
            />
            <FieldError
              id="group-edit-end-error"
              message={submitted ? errors.endDate : undefined}
            />
          </label>
          <label htmlFor="group-edit-exam" className="ui-field">
            <span className="ui-field-label">Дата экзамена</span>
            <input
              id="group-edit-exam"
              type="date"
              value={form.examDate}
              onChange={(event) => set('examDate', event.target.value)}
              aria-invalid={Boolean(submitted && errors.examDate)}
              aria-describedby={
                submitted && errors.examDate ? 'group-edit-exam-error' : 'group-edit-exam-hint'
              }
            />
            <p id="group-edit-exam-hint" className="ui-field-hint">
              Пусто — экзамен совпадает с окончанием обучения.
            </p>
            <FieldError
              id="group-edit-exam-error"
              message={submitted ? errors.examDate : undefined}
            />
          </label>
        </fieldset>

        <label htmlFor="group-edit-study-form" className="ui-field">
          <span className="ui-field-label">Форма обучения</span>
          <select
            id="group-edit-study-form"
            className="ui-select"
            value={form.studyForm}
            onChange={(event) => set('studyForm', event.target.value)}
          >
            <option value="">По умолчанию центра</option>
            {Object.entries(STUDY_FORM_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="group-edit-dot" className="ui-field">
          <span className="ui-field-label">Дистанционные технологии</span>
          <select
            id="group-edit-dot"
            className="ui-select"
            value={form.isDot}
            onChange={(event) => set('isDot', event.target.value as GroupEditForm['isDot'])}
          >
            <option value="">По умолчанию центра</option>
            <option value="yes">Да</option>
            <option value="no">Нет</option>
          </select>
        </label>
        <label htmlFor="group-edit-comment" className="ui-field">
          <span className="ui-field-label">Комментарий</span>
          <textarea
            id="group-edit-comment"
            rows={2}
            value={form.comment}
            onChange={(event) => set('comment', event.target.value)}
          />
        </label>
        <label htmlFor="group-edit-message" className="ui-field">
          <span className="ui-field-label">Сообщение слушателям</span>
          <textarea
            id="group-edit-message"
            rows={2}
            value={form.learnerMessage}
            onChange={(event) => set('learnerMessage', event.target.value)}
            aria-describedby="group-edit-message-hint"
          />
          <p id="group-edit-message-hint" className="ui-field-hint">
            Слушатели увидят его в кабинете рядом с курсами группы.
          </p>
        </label>
      </form>
    </DetailDrawer>
  );
}
