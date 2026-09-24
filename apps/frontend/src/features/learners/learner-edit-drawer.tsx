'use client';

import {
  ComboInput,
  DetailDrawer,
  DrawerCancelButton,
  LookupSelect,
  PageTabs,
  TabPanel
} from '@trudskill/ui';
import { useState } from 'react';

import { STATUS_LABEL, buildUpdatePayload, passportFormHint, toEditFormState } from './format';
import { useUpdateLearnerProfile } from './hooks';
import { LearnerPiiPanel } from './learner-pii-panel';
import { isFormDirty } from '../../lib/forms/dirty';
import { snilsInputHint } from '../../lib/snils';
import { ClientSelect } from '../groups/group-picker';
import { useCountries, useEducationLevels, usePositionSuggestions } from '../lookup/hooks';

import type { LearnerEditFormState, LearnerListItem, LearnerStatus } from './types';

interface LearnerEditDrawerProps {
  learner: LearnerListItem;
  onClose: () => void;
  onSaved: () => void;
}

/* Строки формы строит общая утилита (`format.ts`) — она же считает разницу для запроса. */
const toFormState = toEditFormState;

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
  /* МГ-C1.1 (срез 8.12b, РМ79): личное дело — паспорт, адрес, образование, доставка, компания. */
  { id: 'personal', label: 'Личное дело' },
  { id: 'erase', label: 'Обезличивание' }
];
const FORM_ID = 'learner-edit-form';

export function LearnerEditDrawer({ learner, onClose, onSaved }: LearnerEditDrawerProps) {
  const [tab, setTab] = useState<string>('profile');
  const [form, setForm] = useState<LearnerEditFormState>(() => toFormState(learner));
  // CMP-010 (порция 28): панель обязана предупредить, что закрытие потеряет правки.
  const [initialForm] = useState<LearnerEditFormState>(() => toFormState(learner));
  const mutation = useUpdateLearnerProfile();
  /* МГ-C1.2 (срез 8.13): подсказки справочников — должность и гражданство с вводом, образование списком. */
  const [positionQuery, setPositionQuery] = useState('');
  const positionOptions = usePositionSuggestions(positionQuery);
  const countryOptions = useCountries();
  const educationLevels = useEducationLevels();

  function setField<K extends keyof LearnerEditFormState>(key: K, value: LearnerEditFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // Подсказка по СНИЛС считается на каждый ввод: правило одно на весь фронт (`lib/snils`)
  // и зеркалит серверное — сервер всё равно отклонит, но человек узнает об этом сразу.
  /* Маска сервера в поле (`***-***-*** 95`) — не ввод человека: подсказку не показываем и не отправляем. */
  const snilsHint = form.snils.includes('*') ? undefined : snilsInputHint(form.snils);
  const passportHint = passportFormHint(form);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) return;
    // Не отправляем заведомо неверный номер: иначе ответ придёт ошибкой 400, и человеку
    // придётся возвращаться к тому же полю через сообщение об ошибке сверху формы.
    if (snilsHint || passportHint) return;
    /* Только разница с исходной формой (РМ69/МГ-C1.1): маски сервера в запрос не попадают. */
    const payload = buildUpdatePayload(form, initialForm);
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
          {tab === 'profile' || tab === 'personal' ? (
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

          {/* Справочник должностей центра (МГ-C1.2, РМ83): подсказки + свободный ввод, новое значение попадёт в справочник при сохранении. */}
          <ComboInput
            id="learner-position"
            label="Должность"
            value={form.position}
            onChange={(value) => setField('position', value)}
            options={positionOptions}
            onQueryChange={setPositionQuery}
            hint="Начните печатать — подскажем из должностей центра; новая запомнится при сохранении."
          />

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

      {/* МГ-C1.1: личное дело — та же форма (одна кнопка «Сохранить слушателя»), поля на второй вкладке. */}
      <TabPanel id="personal" activeId={tab}>
        <div className="ui-stack">
          <p className="ui-hint">
            Паспорт и дата рождения показаны частично; чтобы изменить, введите значение заново.
            Пустое поле при сохранении очищает данные.
          </p>
          <label className="ui-field">
            <span className="ui-field-label">Пол</span>
            <select
              className="ui-select"
              form={FORM_ID}
              value={form.gender}
              onChange={(e) => setField('gender', e.target.value as LearnerEditFormState['gender'])}
            >
              <option value="">не указан</option>
              <option value="m">мужской</option>
              <option value="f">женский</option>
            </select>
          </label>
          <label className="ui-field">
            <span className="ui-field-label">Телефон</span>
            <input
              className="ui-input"
              form={FORM_ID}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={form.phone}
              onChange={(e) => setField('phone', e.target.value)}
            />
          </label>
          <ComboInput
            id="learner-citizenship"
            label="Гражданство"
            value={form.citizenship}
            onChange={(value) => setField('citizenship', value)}
            options={countryOptions}
            form={FORM_ID}
            placeholder="Россия"
          />
          <label className="ui-field">
            <span className="ui-field-label">Место рождения</span>
            <input
              className="ui-input"
              form={FORM_ID}
              value={form.birthPlace}
              onChange={(e) => setField('birthPlace', e.target.value)}
            />
          </label>
          <label className="ui-field">
            <span className="ui-field-label">Адрес регистрации</span>
            <input
              className="ui-input"
              form={FORM_ID}
              value={form.registrationAddress}
              onChange={(e) => setField('registrationAddress', e.target.value)}
            />
          </label>
          <fieldset className="ui-field">
            <legend className="ui-field-label">Паспорт</legend>
            <div className="ui-inline">
              <input
                className="ui-input"
                form={FORM_ID}
                aria-label="Серия паспорта"
                value={form.passportSeries}
                onChange={(e) => setField('passportSeries', e.target.value)}
                placeholder="Серия"
                inputMode="numeric"
              />
              <input
                className="ui-input"
                form={FORM_ID}
                aria-label="Номер паспорта"
                value={form.passportNumber}
                onChange={(e) => setField('passportNumber', e.target.value)}
                placeholder="Номер"
                inputMode="numeric"
              />
            </div>
            <input
              className="ui-input"
              form={FORM_ID}
              type="date"
              aria-label="Дата выдачи паспорта"
              value={form.passportIssuedAt}
              onChange={(e) => setField('passportIssuedAt', e.target.value)}
            />
            <input
              className="ui-input"
              form={FORM_ID}
              aria-label="Кем выдан паспорт"
              value={form.passportIssuedBy}
              onChange={(e) => setField('passportIssuedBy', e.target.value)}
              placeholder="Кем выдан"
            />
            {passportHint ? (
              <span className="ui-field-error" role="alert">
                {passportHint}
              </span>
            ) : null}
          </fieldset>
          <div className="ui-field">
            <span className="ui-field-label">Образование</span>
            {/* Фиксированный список ФРДО (РМ81): значение — код уровня, на экране — подпись. */}
            <LookupSelect
              label="Уровень образования"
              value={form.educationLevel}
              onChange={(value) => setField('educationLevel', value)}
              items={[
                { value: '', label: 'не указано' },
                ...educationLevels.map((level) => ({ value: level.code, label: level.name }))
              ]}
            />
          </div>
          <fieldset className="ui-field">
            <legend className="ui-field-label">Диплом об образовании</legend>
            <div className="ui-inline">
              <input
                className="ui-input"
                form={FORM_ID}
                aria-label="Серия диплома"
                value={form.diplomaSeries}
                onChange={(e) => setField('diplomaSeries', e.target.value)}
                placeholder="Серия"
              />
              <input
                className="ui-input"
                form={FORM_ID}
                aria-label="Номер диплома"
                value={form.diplomaNumber}
                onChange={(e) => setField('diplomaNumber', e.target.value)}
                placeholder="Номер"
              />
            </div>
            <input
              className="ui-input"
              form={FORM_ID}
              aria-label="Учебное заведение"
              value={form.diplomaInstitution}
              onChange={(e) => setField('diplomaInstitution', e.target.value)}
              placeholder="Учебное заведение"
            />
            <input
              className="ui-input"
              form={FORM_ID}
              aria-label="Фамилия в дипломе"
              value={form.diplomaSurname}
              onChange={(e) => setField('diplomaSurname', e.target.value)}
              placeholder="Фамилия в дипломе, если менялась"
            />
          </fieldset>
          <div className="ui-field">
            <ClientSelect
              value={form.counterpartyId}
              onChange={(counterpartyId) => setField('counterpartyId', counterpartyId)}
              label="Компания-работодатель"
              emptyLabel="— без компании —"
            />
          </div>
          <label className="ui-field">
            <span className="ui-field-label">Способ доставки документов</span>
            <input
              className="ui-input"
              form={FORM_ID}
              value={form.deliveryMethod}
              onChange={(e) => setField('deliveryMethod', e.target.value)}
              placeholder="Например: почтой, курьером, лично"
            />
          </label>
          <label className="ui-field">
            <span className="ui-field-label">Трек-номер отправления</span>
            <input
              className="ui-input"
              form={FORM_ID}
              value={form.trackingNumber}
              onChange={(e) => setField('trackingNumber', e.target.value)}
            />
          </label>
        </div>
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
