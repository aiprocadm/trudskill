'use client';

import { BlockedHint, LoadingState, OperationOutcome, blockedProps } from '@trudskill/ui';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import {
  ACCESS_MODE_LABEL,
  ROW_STATUS_LABEL,
  accessSummary,
  canProceed,
  parseLearnerLines,
  wizardOutcomeSummary,
  wizardRowLabel
} from './group-wizard-model';
import { FieldError } from '../../../components/form-feedback';
import { SectionCard } from '../../../components/state-wrappers';
import { LearnerSelect, useLearnerNames } from '../../learners/learner-picker';
import { useCounterpartiesList, useCoursesList } from '../../mvp/hooks';
import { ClientSelect } from '../group-picker';
import { STUDY_FORM_LABEL, formatDateRu } from '../group-status';

import type { WizardState, WizardStepId } from './group-wizard-model';
import type { GroupWizardOutcome, WizardAccessMode } from '../../mvp/types';
import type { ReactElement } from 'react';

/**
 * Шаги мастера создания группы (ТЗ перехода §6.2, МГ-B2; срез 8.5). Состояние держит
 * экран (`group-wizard-screen.tsx`), здесь — только поля шага и его единственная кнопка
 * «Далее: …» / «Создать группу». Защита от ухода со страницы — на экране, у которого
 * состояние; поэтому этот файл в исключениях сторожа `page-unsaved-changes`.
 */
interface StepProps {
  state: WizardState;
  patch: (next: Partial<WizardState>) => void;
  busy: boolean;
  onNext: () => void;
  onBack?: () => void;
}

const COURSES_PAGE = { page: 1, page_size: 200 } as const;

/** Кнопка шага: недоступность объясняется словами (Э8), а не молчаливым `disabled`. */
const StepActions = ({
  step,
  state,
  busy,
  label,
  busyLabel,
  onNext,
  onBack,
  backLabel
}: StepProps & { step: WizardStepId; label: string; busyLabel: string; backLabel?: string }) => {
  const check = canProceed(step, state);
  const reason = check.ok ? undefined : check.reason;
  return (
    <>
      <BlockedHint hintKey={`wizard-${step}`} reason={reason} />
      <div className="ui-form-actions">
        {onBack && backLabel ? (
          <button type="button" className="ui-button-link" onClick={onBack} disabled={busy}>
            {backLabel}
          </button>
        ) : (
          <Link className="ui-button-link" href="/groups">
            Отмена
          </Link>
        )}
        <button
          type="button"
          className="ui-button--primary"
          onClick={onNext}
          disabled={busy}
          {...blockedProps(`wizard-${step}`, reason)}
        >
          {busy ? busyLabel : label}
        </button>
      </div>
    </>
  );
};

/** Шаг 1 «Кто учится»: название, код, компания, комментарий (ответственный — я, РМ54). */
export const StepWho = (props: StepProps & { suggestedCode: string | null }): ReactElement => {
  const { state, patch } = props;
  const nameError =
    state.name.trim().length > 0 && state.name.trim().length < 3
      ? 'Название: минимум 3 символа.'
      : undefined;
  return (
    <SectionCard title="Кто учится">
      <label htmlFor="wizard-name" className="ui-field">
        <span className="ui-field-label">Название группы</span>
        <input
          id="wizard-name"
          required
          value={state.name}
          onChange={(event) => patch({ name: event.target.value })}
          aria-invalid={Boolean(nameError)}
          aria-describedby={nameError ? 'wizard-name-error' : 'wizard-name-hint'}
        />
        <p id="wizard-name-hint" className="ui-field-hint">
          Так группу будут искать в реестре — например, «Охрана труда, октябрь 2026».
        </p>
        <FieldError id="wizard-name-error" message={nameError} />
      </label>
      <label htmlFor="wizard-code" className="ui-field">
        <span className="ui-field-label">Короткий код</span>
        <input
          id="wizard-code"
          value={state.code}
          onChange={(event) => patch({ code: event.target.value })}
          aria-describedby="wizard-code-hint"
        />
        <p id="wizard-code-hint" className="ui-field-hint">
          {props.suggestedCode
            ? `Пусто — группа получит код ${props.suggestedCode} по шаблону центра (год, неделя, номер).`
            : 'Пусто — код подставится по шаблону центра (год, неделя, номер).'}{' '}
          Свой код: 2–10 символов.
        </p>
      </label>
      <div className="ui-field">
        <ClientSelect
          value={state.counterpartyId}
          onChange={(counterpartyId) => patch({ counterpartyId })}
          label="Компания-заказчик"
          emptyLabel="— без компании: учатся физлица —"
        />
        {!state.counterpartyId ? (
          <p className="ui-field-hint">
            Без компании тоже можно: документы и счета тогда оформляются на самих слушателей. Новую
            компанию заводят в разделе «Компании».
          </p>
        ) : null}
      </div>
      <label htmlFor="wizard-comment" className="ui-field">
        <span className="ui-field-label">Комментарий</span>
        <textarea
          id="wizard-comment"
          rows={2}
          value={state.comment}
          onChange={(event) => patch({ comment: event.target.value })}
        />
      </label>
      <StepActions
        {...props}
        step="who"
        label="Далее: что и когда"
        busyLabel="Сохраняем черновик…"
      />
    </SectionCard>
  );
};

/** Шаг 2 «Что и когда»: курсы флажками (с поиском), даты, форма обучения. */
export const StepWhat = (props: StepProps): ReactElement => {
  const { state, patch } = props;
  const [query, setQuery] = useState('');
  const { data, loading } = useCoursesList({
    ...COURSES_PAGE,
    ...(query.trim() ? { q: query.trim() } : {})
  });
  const courses = (data?.items ?? []).filter((course) => !course.isArchived);
  const toggle = (courseId: string, checked: boolean) =>
    patch({
      courseIds: checked
        ? [...state.courseIds, courseId]
        : state.courseIds.filter((id) => id !== courseId)
    });
  const dateError =
    state.startDate && state.endDate && state.endDate < state.startDate
      ? 'Окончание обучения не может быть раньше начала.'
      : undefined;
  const examError =
    state.startDate && state.examDate && state.examDate < state.startDate
      ? 'Дата экзамена не может быть раньше начала обучения.'
      : undefined;
  return (
    <SectionCard title="Что и когда">
      <label htmlFor="wizard-course-search" className="ui-field">
        <span className="ui-field-label">
          Курсы {state.courseIds.length > 0 ? `— выбрано ${state.courseIds.length}` : ''}
        </span>
        <input
          id="wizard-course-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Название курса"
          aria-describedby="wizard-course-hint"
        />
        <p id="wizard-course-hint" className="ui-field-hint">
          Отметьте один или несколько курсов. Показаны действующие курсы центра
          {data && data.total > courses.length ? ` (${courses.length} из ${data.total})` : ''}.
        </p>
      </label>
      {loading ? <LoadingState message="Загружаем курсы…" /> : null}
      {!loading && courses.length === 0 ? (
        <p className="ui-hint">
          {query.trim()
            ? 'По этому названию курсов нет — измените запрос.'
            : 'Курсов пока нет — сначала заведите курс в разделе «Курсы».'}
        </p>
      ) : null}
      {courses.length > 0 ? (
        <div className="ui-stack" role="group" aria-label="Курсы группы">
          {courses.map((course) => (
            <label key={course.id} className="ui-option">
              <input
                type="checkbox"
                checked={state.courseIds.includes(course.id)}
                onChange={(event) => toggle(course.id, event.target.checked)}
              />
              <span>
                {course.title}
                {course.code ? <span className="ui-muted"> · {course.code}</span> : null}
              </span>
            </label>
          ))}
        </div>
      ) : null}
      <label htmlFor="wizard-start" className="ui-field">
        <span className="ui-field-label">Начало обучения</span>
        <input
          id="wizard-start"
          type="date"
          value={state.startDate}
          onChange={(event) => patch({ startDate: event.target.value })}
          aria-describedby="wizard-start-hint"
        />
        <p id="wizard-start-hint" className="ui-field-hint">
          Если начало уже наступило, группа сразу получит статус «Учатся».
        </p>
      </label>
      <label htmlFor="wizard-end" className="ui-field">
        <span className="ui-field-label">Окончание обучения</span>
        <input
          id="wizard-end"
          type="date"
          value={state.endDate}
          onChange={(event) => patch({ endDate: event.target.value })}
          aria-invalid={Boolean(dateError)}
          aria-describedby={dateError ? 'wizard-end-error' : 'wizard-end-hint'}
        />
        <p id="wizard-end-hint" className="ui-field-hint">
          Пусто — начало плюс срок обучения из настроек центра.
        </p>
        <FieldError id="wizard-end-error" message={dateError} />
      </label>
      <label htmlFor="wizard-exam" className="ui-field">
        <span className="ui-field-label">Дата экзамена</span>
        <input
          id="wizard-exam"
          type="date"
          value={state.examDate}
          onChange={(event) => patch({ examDate: event.target.value })}
          aria-invalid={Boolean(examError)}
          aria-describedby={examError ? 'wizard-exam-error' : 'wizard-exam-hint'}
        />
        <p id="wizard-exam-hint" className="ui-field-hint">
          Пусто — совпадает с окончанием обучения.
        </p>
        <FieldError id="wizard-exam-error" message={examError} />
      </label>
      <label htmlFor="wizard-study-form" className="ui-field">
        <span className="ui-field-label">Форма обучения</span>
        <select
          id="wizard-study-form"
          className="ui-select"
          value={state.studyForm}
          onChange={(event) => patch({ studyForm: event.target.value })}
        >
          <option value="">По умолчанию центра</option>
          {Object.entries(STUDY_FORM_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <StepActions
        {...props}
        step="what"
        label="Далее: слушатели"
        busyLabel="Сохраняем…"
        backLabel="Назад: кто учится"
      />
    </SectionCard>
  );
};

/** Шаг 3 «Слушатели»: из базы по одному и вставка списка построчно (РМ53). */
export const StepLearners = (props: StepProps): ReactElement => {
  const { state, patch } = props;
  const [picked, setPicked] = useState('');
  const names = useLearnerNames();
  const rows = useMemo(() => parseLearnerLines(state.learnerText), [state.learnerText]);
  const addExisting = (learnerId: string) => {
    setPicked('');
    if (!learnerId || state.existingLearnerIds.includes(learnerId)) return;
    patch({ existingLearnerIds: [...state.existingLearnerIds, learnerId] });
  };
  const total = state.existingLearnerIds.length + rows.length;
  return (
    <SectionCard title="Слушатели">
      <p className="ui-hint">
        Слушателей можно добавить сейчас или позже из карточки группы. Кто уже есть в базе — найдите
        по фамилии; новых — вставьте списком, по одному человеку в строке.
      </p>
      <div className="ui-field">
        <LearnerSelect
          value={picked}
          onChange={addExisting}
          label="Из базы центра"
          emptyLabel="— найти слушателя по фамилии —"
        />
      </div>
      {state.existingLearnerIds.length > 0 ? (
        <ul className="ui-bare-list" aria-label="Выбранные слушатели">
          {state.existingLearnerIds.map((learnerId) => (
            <li key={learnerId} className="ui-inline">
              <span>{names.get(learnerId) ?? 'Слушатель из базы'}</span>
              <button
                type="button"
                className="ui-button-link"
                onClick={() =>
                  patch({
                    existingLearnerIds: state.existingLearnerIds.filter((id) => id !== learnerId)
                  })
                }
              >
                Убрать из группы
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <label htmlFor="wizard-learner-text" className="ui-field">
        <span className="ui-field-label">Новые слушатели списком</span>
        <textarea
          id="wizard-learner-text"
          rows={6}
          value={state.learnerText}
          onChange={(event) => patch({ learnerText: event.target.value })}
          aria-describedby="wizard-learner-text-hint"
          placeholder={
            'Иванов Иван Иванович; инженер; 123-456-789 00; ivan@mail.ru; +7 900 000-00-00'
          }
        />
        <p id="wizard-learner-text-hint" className="ui-field-hint">
          Один человек — одна строка: ФИО; должность; СНИЛС; почта; телефон. Обязательно только ФИО,
          разделитель — точка с запятой (столбец из Excel вставится сам). Кто уже есть в базе по
          СНИЛС или почте — не задвоится.
        </p>
      </label>
      {rows.length > 0 ? (
        <ul className="ui-bare-list" aria-label="Разобранные строки">
          {rows.map((row) => (
            <li key={row.rowNumber}>
              <span className="ui-muted">Строка {row.rowNumber}:</span> {row.fullName || '—'}
              {row.position ? `, ${row.position}` : ''}
              {row.email ? ` · ${row.email}` : ''}
              {row.snils ? ' · СНИЛС указан' : ''}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="ui-hint">
        {total === 0
          ? 'Пока никого — группа создастся пустой, слушателей добавите позже.'
          : `В группу попадут: ${total}. Проверку ФИО и СНИЛС сделает сервер — строки с ошибками покажет по именам, остальных зачислит.`}
      </p>
      <StepActions
        {...props}
        step="learners"
        label="Далее: доступы и проверка"
        busyLabel="Сохраняем…"
        backLabel="Назад: что и когда"
      />
    </SectionCard>
  );
};

/** Шаг 4 «Доступы и проверка»: способ выдачи доступов, сообщение, сводка, «Создать группу». */
export const StepAccess = (props: StepProps & { suggestedCode: string | null }): ReactElement => {
  const { state, patch } = props;
  const { data: coursesData } = useCoursesList(COURSES_PAGE);
  const { data: clientsData } = useCounterpartiesList(COURSES_PAGE);
  const courseTitles = state.courseIds.map(
    (id) => coursesData?.items.find((course) => course.id === id)?.title ?? 'курс'
  );
  const clientName = state.counterpartyId
    ? (clientsData?.items.find((item) => item.id === state.counterpartyId)?.name ?? 'выбрана')
    : 'без компании (физлица)';
  const learnersTotal =
    state.existingLearnerIds.length + parseLearnerLines(state.learnerText).length;
  const sheetReason =
    'Лист доступов появится вместе с входом по логину (Фаза 6) — пока выберите письмо или «позже».';
  const modes: WizardAccessMode[] = ['email', 'sheet', 'later'];
  return (
    <SectionCard title="Доступы и проверка">
      <fieldset className="ui-field">
        <legend className="ui-field-label">Как выдать доступ слушателям</legend>
        <div className="ui-stack">
          {modes.map((mode) => (
            <label key={mode} className="ui-option">
              <input
                type="radio"
                name="wizard-access"
                value={mode}
                checked={state.accessMode === mode}
                onChange={() => patch({ accessMode: mode })}
                {...(mode === 'sheet' ? blockedProps('wizard-access-sheet', sheetReason) : {})}
              />
              <span>{ACCESS_MODE_LABEL[mode]}</span>
            </label>
          ))}
        </div>
        <BlockedHint hintKey="wizard-access-sheet" reason={sheetReason} />
        <p className="ui-field-hint">
          Письмо со ссылкой для входа уйдёт каждому зачисленному, у кого есть почта; остальным
          доступ выдаётся из карточки группы.
        </p>
      </fieldset>
      {state.accessMode === 'email' ? (
        <label htmlFor="wizard-message" className="ui-field">
          <span className="ui-field-label">Сообщение слушателю</span>
          <textarea
            id="wizard-message"
            rows={3}
            value={state.message}
            onChange={(event) => patch({ message: event.target.value })}
            aria-describedby="wizard-message-hint"
          />
          <p id="wizard-message-hint" className="ui-field-hint">
            Необязательно. Добавится к письму с приглашением.
          </p>
        </label>
      ) : null}
      <dl className="ui-kv" aria-label="Что создадим">
        <dt>Название</dt>
        <dd>{state.name.trim()}</dd>
        <dt>Код</dt>
        <dd>{state.code.trim() || props.suggestedCode || 'по шаблону центра'}</dd>
        <dt>Компания</dt>
        <dd>{clientName}</dd>
        <dt>Курсы</dt>
        <dd>{courseTitles.join(', ')}</dd>
        <dt>Период</dt>
        <dd>
          {state.startDate ? formatDateRu(state.startDate) : 'начало не задано'} —{' '}
          {state.endDate ? formatDateRu(state.endDate) : 'по сроку центра'}
          {state.examDate ? `, экзамен ${formatDateRu(state.examDate)}` : ''}
        </dd>
        <dt>Слушателей</dt>
        <dd>{learnersTotal}</dd>
      </dl>
      <StepActions
        {...props}
        step="access"
        label="Создать группу"
        busyLabel="Создаём группу…"
        backLabel="Назад: слушатели"
      />
    </SectionCard>
  );
};

/** Результат: частичный успех построчно, доступы одной фразой, первичное — открыть группу. */
export const WizardResult = ({
  outcome,
  state,
  onReset
}: {
  outcome: GroupWizardOutcome;
  state: WizardState;
  onReset: () => void;
}): ReactElement => {
  const learnerNames = useLearnerNames();
  const names = useMemo(
    () => ({
      byRow: new Map(
        parseLearnerLines(state.learnerText).map((row) => [row.rowNumber, row.fullName])
      ),
      byLearner: learnerNames
    }),
    [state.learnerText, learnerNames]
  );
  const summary = wizardOutcomeSummary(outcome, names);
  const succeeded = outcome.enrollments.rows.filter((row) => row.status !== 'failed');
  return (
    <SectionCard title={`Группа «${outcome.group.name}» создана`}>
      <p className="ui-hint">
        Код {outcome.group.code}, курсов назначено: {outcome.coursesAssigned}.{' '}
        {accessSummary(outcome)}
      </p>
      {outcome.enrollments.rows.length > 0 ? (
        <OperationOutcome
          outcome={summary}
          successVerb="Зачислено"
          failuresTitle="Не зачислены — построчно:"
        >
          {summary.failures.length > 0 ? (
            <p className="ui-hint">
              Группа создана, остальные зачислены. Исправьте эти строки и добавьте людей из карточки
              группы — уже зачисленных повтор не тронет.
            </p>
          ) : null}
        </OperationOutcome>
      ) : null}
      {succeeded.length > 0 ? (
        <ul className="ui-bare-list">
          {succeeded.map((row) => (
            <li key={`${row.rowNumber}-${row.learnerId ?? ''}`}>
              {row.learnerId ? (
                <Link className="ui-link" href={`/learners/${row.learnerId}`}>
                  {wizardRowLabel(row, names)}
                </Link>
              ) : (
                wizardRowLabel(row, names)
              )}{' '}
              — {ROW_STATUS_LABEL[row.status]}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="ui-form-actions">
        <button type="button" className="ui-button-link" onClick={onReset}>
          Создать ещё одну группу
        </button>
        {/* Импорт списком сам спрашивает группу — она уже есть в его списке. */}
        <Link className="ui-button" href="/admin/bulk-enrollments">
          Зачислить список из файла
        </Link>
        <Link className="ui-button--primary" href={`/groups/${outcome.group.id}`}>
          Открыть группу
        </Link>
      </div>
    </SectionCard>
  );
};
