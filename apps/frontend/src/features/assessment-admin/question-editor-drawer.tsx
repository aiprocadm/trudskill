'use client';

import { useState } from 'react';

import { QUESTION_TYPE_LABEL } from './format';
import { useCreateQuestion, useUpdateQuestion } from './hooks';

import type {
  AnswerOptionPayload,
  CreateQuestionPayload,
  QuestionListItem,
  QuestionType,
  UpdateQuestionPayload
} from './types';

interface Props {
  bankId: string;
  question?: QuestionListItem | null;
  onClose: () => void;
  onSaved?: (q: QuestionListItem) => void;
}

const TYPE_VALUES: QuestionType[] = [
  'single_choice',
  'multiple_choice',
  'number_input',
  'text',
  'essay'
];

const EMPTY_OPTIONS: AnswerOptionPayload[] = [
  { text: '', isCorrect: false },
  { text: '', isCorrect: false }
];

export function QuestionEditorDrawer({ bankId, question, onClose, onSaved }: Props) {
  const isEditing = Boolean(question);
  const [type, setType] = useState<QuestionType>(question?.type ?? 'single_choice');
  const [title, setTitle] = useState(question?.title ?? '');
  const [body, setBody] = useState(question?.body ?? '');
  const [score, setScore] = useState<string>(String(question?.score ?? 1));
  const [answerOptions, setAnswerOptions] = useState<AnswerOptionPayload[]>(
    question?.answerOptions?.map((o) => ({ text: o.text, isCorrect: o.isCorrect })) ?? EMPTY_OPTIONS
  );
  const [numericExpected, setNumericExpected] = useState<string>(
    question?.numericExpected !== undefined ? String(question.numericExpected) : ''
  );
  const [numericTolerance, setNumericTolerance] = useState<string>(
    question?.numericTolerance !== undefined ? String(question.numericTolerance) : ''
  );
  const [expectedAnswer, setExpectedAnswer] = useState(question?.expectedAnswer ?? '');

  const create = useCreateQuestion();
  const update = useUpdateQuestion();
  const isPending = create.isPending || update.isPending;
  const error = create.error || update.error;

  const updateOption = (idx: number, patch: Partial<AnswerOptionPayload>) => {
    setAnswerOptions((prev) => prev.map((o, i) => (i === idx ? { ...o, ...patch } : o)));
  };

  const addOption = () => {
    setAnswerOptions((prev) => [...prev, { text: '', isCorrect: false }]);
  };

  const removeOption = (idx: number) => {
    setAnswerOptions((prev) => (prev.length > 2 ? prev.filter((_, i) => i !== idx) : prev));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const scoreNum = Number(score);
    if (Number.isNaN(scoreNum) || scoreNum < 0) return;
    if (!title.trim()) return;

    const base = {
      title: title.trim(),
      ...(body.trim() ? { body: body.trim() } : {}),
      score: scoreNum
    };

    let extras: Partial<CreateQuestionPayload> = {};
    if (type === 'single_choice' || type === 'multiple_choice') {
      const cleaned = answerOptions
        .filter((o) => o.text.trim().length > 0)
        .map((o, i) => ({ text: o.text.trim(), isCorrect: o.isCorrect, sortOrder: i }));
      if (cleaned.length < 2) return;
      if (!cleaned.some((o) => o.isCorrect)) return;
      extras = { answerOptions: cleaned };
    } else if (type === 'number_input') {
      const expected = Number(numericExpected);
      if (Number.isNaN(expected)) return;
      const tolerance = numericTolerance ? Number(numericTolerance) : undefined;
      extras = {
        numericExpected: expected,
        ...(tolerance !== undefined && !Number.isNaN(tolerance)
          ? { numericTolerance: tolerance }
          : {})
      };
    } else if (type === 'text') {
      extras = expectedAnswer.trim() ? { expectedAnswer: expectedAnswer.trim() } : {};
    }
    // essay — нет extras

    if (isEditing && question) {
      const patch: UpdateQuestionPayload = { type, ...base, ...extras };
      const result = await update.mutate(question.id, patch);
      if (result) onSaved?.(result);
    } else {
      const payload: CreateQuestionPayload = {
        questionBankId: bankId,
        type,
        ...base,
        ...extras
      };
      const result = await create.mutate(payload);
      if (result) onSaved?.(result);
    }
  };

  return (
    <aside
      className="ui-drawer"
      role="dialog"
      aria-label={isEditing ? 'Редактирование вопроса' : 'Создание вопроса'}
    >
      <header className="ui-drawer-header">
        <h2>{isEditing ? 'Редактирование вопроса' : 'Создание вопроса'}</h2>
        <button type="button" className="ui-button-ghost" onClick={onClose}>
          Закрыть
        </button>
      </header>

      <form className="ui-form" onSubmit={submit}>
        <label className="ui-field">
          <span>Тип вопроса</span>
          <select
            className="ui-select"
            value={type}
            onChange={(e) => setType(e.target.value as QuestionType)}
          >
            {TYPE_VALUES.map((t) => (
              <option key={t} value={t}>
                {QUESTION_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>

        <label className="ui-field">
          <span>Заголовок</span>
          <input
            type="text"
            className="ui-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={255}
          />
        </label>

        <label className="ui-field">
          <span>Текст вопроса</span>
          <textarea
            className="ui-input"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={5000}
          />
        </label>

        <label className="ui-field">
          <span>Баллы за правильный ответ</span>
          <input
            type="number"
            className="ui-input"
            value={score}
            onChange={(e) => setScore(e.target.value)}
            min={0}
            step="any"
          />
        </label>

        {(type === 'single_choice' || type === 'multiple_choice') && (
          <fieldset className="ui-fieldset">
            <legend>Варианты ответов</legend>
            {answerOptions.map((opt, idx) => (
              <div key={idx} className="ui-inline ui-option-row">
                <input
                  type={type === 'single_choice' ? 'radio' : 'checkbox'}
                  name="answer-correct"
                  checked={opt.isCorrect}
                  onChange={(e) => {
                    if (type === 'single_choice') {
                      setAnswerOptions((prev) =>
                        prev.map((o, i) => ({
                          ...o,
                          isCorrect: i === idx ? e.target.checked : false
                        }))
                      );
                    } else {
                      updateOption(idx, { isCorrect: e.target.checked });
                    }
                  }}
                  aria-label={`Правильный вариант ${idx + 1}`}
                />
                <input
                  type="text"
                  className="ui-input"
                  value={opt.text}
                  onChange={(e) => updateOption(idx, { text: e.target.value })}
                  placeholder={`Вариант ${idx + 1}`}
                  maxLength={2000}
                />
                {answerOptions.length > 2 && (
                  <button
                    type="button"
                    className="ui-button-ghost"
                    onClick={() => removeOption(idx)}
                    aria-label={`Удалить вариант ${idx + 1}`}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="ui-button" onClick={addOption}>
              + Добавить вариант
            </button>
          </fieldset>
        )}

        {type === 'number_input' && (
          <fieldset className="ui-fieldset">
            <legend>Числовой ответ</legend>
            <label className="ui-field">
              <span>Ожидаемое значение</span>
              <input
                type="number"
                className="ui-input"
                value={numericExpected}
                onChange={(e) => setNumericExpected(e.target.value)}
                required
                step="any"
              />
            </label>
            <label className="ui-field">
              <span>Допустимая погрешность (±)</span>
              <input
                type="number"
                className="ui-input"
                value={numericTolerance}
                onChange={(e) => setNumericTolerance(e.target.value)}
                min={0}
                step="any"
              />
            </label>
          </fieldset>
        )}

        {type === 'text' && (
          <label className="ui-field">
            <span>Ожидаемый ответ (опционально, для автогрейдинга)</span>
            <input
              type="text"
              className="ui-input"
              value={expectedAnswer}
              onChange={(e) => setExpectedAnswer(e.target.value)}
              maxLength={2000}
            />
          </label>
        )}

        {type === 'essay' && (
          <p className="ui-hint">
            Эссе проверяется ревьюером вручную (Plan C). Дополнительных полей не требуется.
          </p>
        )}

        {error ? <p className="ui-field-error">{error}</p> : null}

        <div className="ui-form-actions">
          <button type="button" className="ui-button" onClick={onClose} disabled={isPending}>
            Отмена
          </button>
          <button type="submit" className="ui-button-primary" disabled={isPending || !title.trim()}>
            {isPending ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      </form>
    </aside>
  );
}
