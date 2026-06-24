'use client';

import { LoadingState, StatusChip } from '@trudskill/ui';
import { useState } from 'react';

import { formatEntityStatus } from './format';
import {
  useArchiveTest,
  usePublishTest,
  useRemoveTestQuestion,
  useTest,
  useTestQuestions,
  useUpdateTest,
  useUpsertTestRule
} from './hooks';
import { TestQuestionPicker } from './test-question-picker';
import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../components/state-wrappers';

import type { UpdateTestRulePayload } from './types';

interface Props {
  testId: string;
}

export function TestBuilderScreen({ testId }: Props) {
  const test = useTest(testId);
  const questions = useTestQuestions(testId);
  const updateTest = useUpdateTest();
  const upsertRule = useUpsertTestRule();
  const publish = usePublishTest();
  const archive = useArchiveTest();
  const removeQ = useRemoveTestQuestion();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [ruleForm, setRuleForm] = useState<UpdateTestRulePayload>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Sync from server response on first load.
  if (!hydrated && test.data) {
    setTitle(test.data.title);
    setDescription(test.data.description ?? '');
    setRuleForm({
      attemptLimit: test.data.rules.attemptLimit,
      passingScore: test.data.rules.passingScore,
      randomizeQuestions: test.data.rules.randomizeQuestions,
      ...(test.data.rules.questionCount !== undefined
        ? { questionCount: test.data.rules.questionCount }
        : {}),
      ...(test.data.rules.timeLimitMinutes !== undefined
        ? { timeLimitMinutes: test.data.rules.timeLimitMinutes }
        : {}),
      dailyResetEnabled: test.data.rules.dailyResetEnabled
    });
    setHydrated(true);
  }

  if (test.isLoading) return <LoadingState message="Загрузка теста…" />;
  if (test.error || !test.data) {
    return (
      <SectionError
        message={test.error instanceof Error ? test.error.message : 'Тест не найден'}
        onRetry={() => void test.refetch()}
      />
    );
  }
  const t = test.data;
  const hasQuestions = (questions.data?.length ?? 0) > 0;
  const isPublished = t.status === 'published';
  const isArchived = t.isArchived;

  const saveMeta = async () => {
    await updateTest.mutate(testId, { title: title.trim(), description: description.trim() });
    void test.refetch();
  };

  const saveRule = async () => {
    await upsertRule.mutate(testId, ruleForm);
    void test.refetch();
  };

  const onPublish = async () => {
    await publish.mutate(testId);
    void test.refetch();
  };

  const onArchive = async () => {
    await archive.mutate(testId);
    void test.refetch();
  };

  const onRemoveQuestion = async (questionId: string) => {
    await removeQ.mutate(testId, questionId);
    void questions.refetch();
  };

  return (
    <PageContainer>
      <PageHeader
        title={t.title}
        subtitle={`Курс ${t.courseId}`}
        actions={
          <>
            {!isPublished && !isArchived && (
              <button
                type="button"
                className="ui-button-primary"
                onClick={onPublish}
                disabled={!hasQuestions || publish.isPending}
                title={!hasQuestions ? 'Сначала добавьте вопросы' : ''}
              >
                {publish.isPending ? 'Публикация…' : 'Опубликовать'}
              </button>
            )}
            {!isArchived && (
              <button
                type="button"
                className="ui-button"
                onClick={onArchive}
                disabled={archive.isPending}
              >
                {archive.isPending ? 'Архивация…' : 'Архивировать'}
              </button>
            )}
            <StatusChip status={formatEntityStatus(t.status)} />
          </>
        }
      />

      <SectionCard title="Параметры">
        <label className="ui-field">
          <span>Название</span>
          <input
            type="text"
            className="ui-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="ui-field">
          <span>Описание</span>
          <textarea
            className="ui-input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="ui-button-primary"
          onClick={saveMeta}
          disabled={updateTest.isPending}
        >
          {updateTest.isPending ? 'Сохранение…' : 'Сохранить параметры'}
        </button>
        {updateTest.error ? <p className="ui-field-error">{updateTest.error}</p> : null}
      </SectionCard>

      <SectionCard title="Правила">
        <div className="ui-grid">
          <label className="ui-field">
            <span>Лимит попыток</span>
            <input
              type="number"
              className="ui-input"
              min={1}
              value={ruleForm.attemptLimit ?? 1}
              onChange={(e) => setRuleForm((p) => ({ ...p, attemptLimit: Number(e.target.value) }))}
            />
          </label>
          <label className="ui-field">
            <span>Кол-во вопросов</span>
            <input
              type="number"
              className="ui-input"
              min={1}
              value={ruleForm.questionCount ?? ''}
              onChange={(e) =>
                setRuleForm((p) => ({
                  ...p,
                  ...(e.target.value ? { questionCount: Number(e.target.value) } : {})
                }))
              }
            />
          </label>
          <label className="ui-field">
            <span>Лимит времени (мин)</span>
            <input
              type="number"
              className="ui-input"
              min={1}
              value={ruleForm.timeLimitMinutes ?? ''}
              onChange={(e) =>
                setRuleForm((p) => ({
                  ...p,
                  ...(e.target.value ? { timeLimitMinutes: Number(e.target.value) } : {})
                }))
              }
            />
          </label>
          <label className="ui-field">
            <span>Проходной балл</span>
            <input
              type="number"
              className="ui-input"
              min={0}
              step="any"
              value={ruleForm.passingScore ?? 1}
              onChange={(e) => setRuleForm((p) => ({ ...p, passingScore: Number(e.target.value) }))}
            />
          </label>
          <label className="ui-inline">
            <input
              type="checkbox"
              checked={Boolean(ruleForm.randomizeQuestions)}
              onChange={(e) => setRuleForm((p) => ({ ...p, randomizeQuestions: e.target.checked }))}
            />
            <span>Перемешивать вопросы</span>
          </label>
          <label className="ui-inline">
            <input
              type="checkbox"
              checked={Boolean(ruleForm.dailyResetEnabled)}
              onChange={(e) => setRuleForm((p) => ({ ...p, dailyResetEnabled: e.target.checked }))}
            />
            <span>Дневной сброс попыток</span>
          </label>
        </div>
        <button
          type="button"
          className="ui-button-primary"
          onClick={saveRule}
          disabled={upsertRule.isPending}
        >
          {upsertRule.isPending ? 'Сохранение…' : 'Сохранить правила'}
        </button>
        {upsertRule.error ? <p className="ui-field-error">{upsertRule.error}</p> : null}
      </SectionCard>

      <SectionCard title="Вопросы теста">
        <div className="ui-toolbar">
          <button type="button" className="ui-button-primary" onClick={() => setPickerOpen(true)}>
            Добавить вопросы
          </button>
        </div>
        {questions.isLoading ? (
          <LoadingState message="Загрузка вопросов…" />
        ) : hasQuestions ? (
          <ul className="ui-list">
            {questions.data!.map((tq) => (
              <li key={tq.id} className="ui-list-row">
                <span>
                  <strong>#{tq.sortOrder}</strong> — вопрос {tq.questionId}
                </span>
                <button
                  type="button"
                  className="ui-button-ghost"
                  onClick={() => void onRemoveQuestion(tq.questionId)}
                  aria-label={`Удалить вопрос ${tq.questionId}`}
                >
                  Удалить
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <SectionEmpty
            message="Вопросов нет"
            hint="Подберите вопросы из банков, чтобы опубликовать тест."
          />
        )}
      </SectionCard>

      {pickerOpen && (
        <TestQuestionPicker
          testId={testId}
          {...(t.questionBankId ? { defaultBankId: t.questionBankId } : {})}
          onClose={() => setPickerOpen(false)}
          onAdded={() => void questions.refetch()}
        />
      )}
    </PageContainer>
  );
}
