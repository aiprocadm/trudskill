'use client';

import { LoadingState } from '@cdoprof/ui';
import { useState } from 'react';

import { formatQuestionType } from './format';
import { useAddTestQuestion, useQuestionBanksList, useQuestionsForBank } from './hooks';

import type { QuestionType } from './types';

interface Props {
  testId: string;
  defaultBankId?: string;
  onClose: () => void;
  onAdded?: () => void;
}

export function TestQuestionPicker({ testId, defaultBankId, onClose, onAdded }: Props) {
  const banks = useQuestionBanksList({ pageSize: 100 });
  const [bankId, setBankId] = useState<string>(defaultBankId ?? '');
  const [typeFilter, setTypeFilter] = useState<'' | QuestionType>('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const questions = useQuestionsForBank(bankId || null, {
    ...(typeFilter ? { type: typeFilter } : {}),
    pageSize: 100
  });

  const add = useAddTestQuestion();

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async () => {
    for (const qid of selected) {
      const ok = await add.mutate(testId, { questionId: qid });
      if (!ok) break;
    }
    onAdded?.();
    onClose();
  };

  return (
    <div className="ui-modal" role="dialog" aria-label="Подбор вопросов">
      <div className="ui-modal-content">
        <header className="ui-modal-header">
          <h2>Подбор вопросов</h2>
          <button type="button" className="ui-button-ghost" onClick={onClose}>
            Закрыть
          </button>
        </header>

        <div className="ui-toolbar">
          <select
            className="ui-select"
            value={bankId}
            onChange={(e) => setBankId(e.target.value)}
            aria-label="Банк вопросов"
          >
            <option value="">— выберите банк —</option>
            {banks.data?.items.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </select>
          <select
            className="ui-select"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as '' | QuestionType)}
            aria-label="Фильтр по типу"
          >
            <option value="">Все типы</option>
            <option value="single_choice">Один из списка</option>
            <option value="multiple_choice">Несколько из списка</option>
            <option value="number_input">Числовой ответ</option>
            <option value="text">Краткий текст</option>
            <option value="essay">Развёрнутый ответ</option>
          </select>
        </div>

        {!bankId ? (
          <p className="ui-hint">Выберите банк, чтобы посмотреть его вопросы.</p>
        ) : questions.isLoading ? (
          <LoadingState message="Загрузка вопросов…" />
        ) : !questions.data || questions.data.items.length === 0 ? (
          <p className="ui-hint">В этом банке нет вопросов выбранного типа.</p>
        ) : (
          <ul className="ui-list">
            {questions.data.items.map((q) => (
              <li key={q.id} className="ui-list-row">
                <label className="ui-inline">
                  <input
                    type="checkbox"
                    checked={selected.has(q.id)}
                    onChange={() => toggle(q.id)}
                  />
                  <span>
                    <strong>{q.title || '(без заголовка)'}</strong> — {formatQuestionType(q.type)}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}

        {add.error ? <p className="ui-field-error">{add.error}</p> : null}

        <div className="ui-form-actions">
          <button type="button" className="ui-button" onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className="ui-button-primary"
            onClick={submit}
            disabled={add.isPending || selected.size === 0}
          >
            {add.isPending ? 'Добавление…' : `Добавить ${selected.size}`}
          </button>
        </div>
      </div>
    </div>
  );
}
