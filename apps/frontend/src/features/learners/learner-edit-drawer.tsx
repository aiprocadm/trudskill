'use client';

import { DetailDrawer, DrawerCancelButton, PageTabs, TabPanel } from '@trudskill/ui';
import { useState } from 'react';

import { STATUS_LABEL, buildUpdatePayload } from './format';
import { useUpdateLearnerProfile } from './hooks';
import { LearnerPiiPanel } from './learner-pii-panel';
import { isFormDirty } from '../../lib/forms/dirty';
import { snilsInputHint } from '../../lib/snils';

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
    dateOfBirth: learner.dateOfBirth ?? '',
    position: learner.position ?? '',
    organizationUnitId: learner.organizationUnitId ?? '',
    learnerNo: learner.learnerNo ?? '',
    status: learner.status
  };
}

/**
 * Вкладки карточки слушателя (ТЗ 5.13 / Э13).
 *
 * Правка и уничтожение разведены. Раньше форма профиля и блок «Обезличивание данных
 * (152-ФЗ)» с пометкой «необратимо» стояли в одной ленте подряд: человек прокручивал вниз к
 * кнопке «Сохранить» и проезжал мимо необратимой операции (журнал 487).
 *
 * Идентификатор формы нужен, чтобы кнопка отправки жила В ЗАКРЕПЛЁННОМ НИЗУ панели, а не
 * внутри формы: `form="..."` — обычная возможность HTML, кнопка снаружи отправляет ту же
 * форму.
 */
const LEARNER_TABS = [
  { id: 'profile', label: 'Данные слушателя' },
  { id: 'erase', label: 'Обезличивание' }
];
const FORM_ID = 'learner-edit-form';

export function LearnerEditDrawer({ learner, onClose, onSaved }: LearnerEditDrawerProps) {
  const [tab, setTab] = useState<string>('profile');
  const [form, setForm] = useState<LearnerEditFormState>(() => toFormState(learner));
  // CMP-010 (порция 28): панель обязана предупредить, что закрытие потеряет правки.
  const [initialForm] = useState<LearnerEditFormState>(() => toFormState(learner));
  const mutation = useUpdateLearnerProfile();

  function setField<K extends keyof LearnerEditFormState>(key: K, value: LearnerEditFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // Подсказка по СНИЛС считается на каждый ввод: правило одно на весь фронт (`lib/snils`)
  // и зеркалит серверное — сервер всё равно отклонит, но человек узнает об этом сразу.
  const snilsHint = snilsInputHint(form.snils);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) return;
    // Не отправляем заведомо неверный номер: иначе ответ придёт ошибкой 400, и человеку
    // придётся возвращаться к тому же полю через сообщение об ошибке сверху формы.
    if (snilsHint) return;
    const payload = buildUpdatePayload(form);
    const result = await mutation.mutate(learner.id, payload);
    if (result) onSaved();
  };

  // CMP-010: карточка открывается боковой панелью, а не модалкой поверх экрана —
  // список остаётся виден, и правка не выбивает из контекста.
  return (
    <DetailDrawer
      open
      onClose={onClose}
      hasUnsavedChanges={isFormDirty(form, initialForm)}
      title="Карточка слушателя"
      subtitle={[learner.lastName, learner.firstName].filter(Boolean).join(' ')}
      width="md"
      /*
        ТЗ 5.13: «Сохранить» и «Отмена» закреплены внизу панели — до них не надо прокручивать.
        Возможность у панели была и раньше, ею пользовался один экран из тридцати (журнал 488).
        «Сохранить» показывается только на вкладке данных: на вкладке обезличивания сохранять
        нечего, и кнопка там обещала бы несуществующее действие (Э2).
      */
      footer={
        <div className="ui-inline">
          <DrawerCancelButton
            className="ui-button"
            disabled={mutation.isPending}
            onFallbackClose={onClose}
          />
          {tab === 'profile' ? (
            <button
              type="submit"
              form={FORM_ID}
              className={`ui-button ui-button--primary ${mutation.isPending ? 'ui-button--loading' : ''}`}
              disabled={mutation.isPending}
            >
              Сохранить слушателя
            </button>
          ) : null}
        </div>
      }
    >
      <PageTabs
        tabs={LEARNER_TABS}
        activeId={tab}
        onSelect={setTab}
        label="Разделы карточки слушателя"
      />

      <TabPanel id="profile" activeId={tab}>
        <form id={FORM_ID} onSubmit={(e) => void handleSubmit(e)} className="ui-stack">
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
              inputMode="email"
              value={form.email}
              onChange={(e) => setField('email', e.target.value)}
              autoComplete="off"
            />
          </label>

          {/* Образец в поле сам проходит контрольную сумму: прежний «123-456-789 01» её
            не проходил — форма показывала пример номера, который сама же и отвергнет,
            если его перепечатать. */}
          <label className="ui-field">
            <span className="ui-field-label">СНИЛС</span>
            <input
              className="ui-input"
              value={form.snils}
              onChange={(e) => setField('snils', e.target.value)}
              placeholder="112-233-445 95"
              inputMode="numeric"
              aria-invalid={snilsHint ? true : undefined}
              aria-describedby={snilsHint ? 'learner-snils-hint' : undefined}
            />
            {/*
            ФТ-C4.1: опечатка в СНИЛС ловится здесь, а не через месяцы на выгрузке в
            госреестр. Подсказка появляется только когда номер набран целиком — иначе
            она горела бы на каждой промежуточной цифре.
          */}
            {snilsHint ? (
              <span id="learner-snils-hint" className="ui-field-error" role="alert">
                {snilsHint}
              </span>
            ) : null}
          </label>

          {/*
          Вопрос №12 (решение 08.09.2026): дата рождения обязательна для ВЫГРУЗКИ в
          госреестры, но не для заведения слушателя — поэтому поле здесь есть, а звёздочки
          у него нет. Без него отказ выгрузки «заполните дату рождения в карточке» отправлял
          бы человека туда, где заполнить её нечем.
        */}
          <label className="ui-field">
            <span className="ui-field-label">Дата рождения</span>
            <input
              className="ui-input"
              type="date"
              value={form.dateOfBirth}
              onChange={(e) => setField('dateOfBirth', e.target.value)}
            />
            <span className="ui-field-hint">
              Нужна для выгрузки в государственные реестры: по ней там различают однофамильцев.
            </span>
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
        </form>
      </TabPanel>

      {/* ФТ-G6: панель вне <form> — обезличивание не должно уехать по случайному Enter
          в текстовом поле, как отправка формы. Механизм подтверждения набором слова
          «обезличить» ТЗ велит не трогать: он сделан правильно и служит образцом (5.3). */}
      <TabPanel id="erase" activeId={tab}>
        <LearnerPiiPanel
          learnerId={learner.id}
          learnerLabel={[learner.lastName, learner.firstName].filter(Boolean).join(' ')}
          onErased={onSaved}
        />
      </TabPanel>
    </DetailDrawer>
  );
}
