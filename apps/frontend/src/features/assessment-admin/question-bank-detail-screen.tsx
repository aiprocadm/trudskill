'use client';

import { DataTable, LoadingState, StatusChip } from '@cdoprof/ui';
import { useState } from 'react';

import { formatEntityStatus, formatQuestionScore, formatQuestionType } from './format';
import { useArchiveQuestionBank, useQuestionBank, useQuestionsForBank } from './hooks';
import { QuestionBankEditDrawer } from './question-bank-edit-drawer';
import { QuestionEditorDrawer } from './question-editor-drawer';
import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../components/state-wrappers';

import type { QuestionListItem, QuestionType } from './types';
import type { Column } from '@cdoprof/ui';

interface Props {
  bankId: string;
}

export function QuestionBankDetailScreen({ bankId }: Props) {
  const bankQuery = useQuestionBank(bankId);
  const [editing, setEditing] = useState(false);
  const [creatingQuestion, setCreatingQuestion] = useState(false);
  const [typeFilter, setTypeFilter] = useState<'' | QuestionType>('');
  const archive = useArchiveQuestionBank();

  const questionsQuery = useQuestionsForBank(bankId, {
    ...(typeFilter ? { type: typeFilter } : {}),
    page: 1,
    pageSize: 100
  });

  if (bankQuery.isLoading) return <LoadingState message="Загрузка банка…" />;
  if (bankQuery.error || !bankQuery.data) {
    return (
      <SectionError
        message={bankQuery.error instanceof Error ? bankQuery.error.message : 'Банк не найден'}
        onRetry={() => void bankQuery.refetch()}
      />
    );
  }
  const bank = bankQuery.data;

  const columns: Column<QuestionListItem>[] = [
    { key: 'type', title: 'Тип', render: (q) => formatQuestionType(q.type) },
    { key: 'title', title: 'Заголовок', render: (q) => q.title || '—' },
    { key: 'score', title: 'Баллы', render: (q) => formatQuestionScore(q.score) },
    {
      key: 'status',
      title: 'Статус',
      render: (q) => <StatusChip status={formatEntityStatus(q.status)} />
    }
  ];

  return (
    <PageContainer>
      <PageHeader
        title={bank.title}
        subtitle={bank.description ?? 'Банк вопросов для тестов и заданий'}
        actions={
          <>
            <button
              type="button"
              className="ui-button ui-button--primary"
              onClick={() => setEditing(true)}
            >
              Редактировать
            </button>
            {!bank.isArchived && (
              <button
                type="button"
                className="ui-button"
                onClick={() => void archive.mutate(bankId).then(() => void bankQuery.refetch())}
                disabled={archive.isPending}
              >
                {archive.isPending ? 'Архивация…' : 'Архивировать'}
              </button>
            )}
          </>
        }
      />

      <SectionCard title="Параметры">
        <dl className="ui-defs">
          <dt>Код</dt>
          <dd>{bank.code ?? '—'}</dd>
          <dt>Курс</dt>
          <dd>{bank.courseId ?? '—'}</dd>
          <dt>Статус</dt>
          <dd>{formatEntityStatus(bank.status)}</dd>
        </dl>
      </SectionCard>

      <SectionCard title="Вопросы">
        <div className="ui-toolbar">
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
          <button
            type="button"
            className="ui-button-primary"
            onClick={() => setCreatingQuestion(true)}
          >
            Добавить вопрос
          </button>
        </div>
        {questionsQuery.isLoading ? (
          <LoadingState message="Загрузка…" />
        ) : questionsQuery.data && questionsQuery.data.items.length > 0 ? (
          <DataTable<QuestionListItem> columns={columns} rows={questionsQuery.data.items} />
        ) : (
          <SectionEmpty message="Вопросов нет" hint="Добавьте первый вопрос в банк." />
        )}
      </SectionCard>

      {editing && (
        <QuestionBankEditDrawer
          bank={bank}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            void bankQuery.refetch();
          }}
        />
      )}

      {creatingQuestion && (
        <QuestionEditorDrawer
          bankId={bankId}
          onClose={() => setCreatingQuestion(false)}
          onSaved={() => {
            setCreatingQuestion(false);
            void questionsQuery.refetch();
          }}
        />
      )}
    </PageContainer>
  );
}
