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
import { useUnsavedForm } from '../../components/use-unsaved-form';
import { useCourseNames } from '../courses/course-picker';
import { useObjectCrumb } from '../navigation/use-object-crumb';

import type { UpdateTestRulePayload } from './types';

interface Props {
  testId: string;
}

export function TestBuilderScreen({ testId }: Props) {
  const test = useTest(testId);
  useObjectCrumb(test.data?.title, { failed: Boolean(test.error) });
  const questions = useTestQuestions(testId);
  const courseNames = useCourseNames();
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

  /*
   * Защита от потери правок (ТЗ 10.3): исходное — то, чем форму наполнил сервер.
   *
   * Вызов стоит ДО первого раннего возврата намеренно: ниже экран уходит в «Загрузка теста…»,
   * и хук, объявленный после, при переходе «грузится → загрузилось» менял бы число хуков —
   * React падает с потерей всего набранного.
   */
  const unsavedGuard = useUnsavedForm(
    { title, description, ruleForm },
    {
      saving: updateTest.isPending || upsertRule.isPending,
      baselineKey: hydrated ? 'ready' : 'loading'
    }
  );

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

  /*
   * После сохранения форма перечитывается с сервера: `setHydrated(false)` заставляет блок выше
   * наполнить её заново. Без этого защита от потери правок (ТЗ 10.3) продолжала бы считать
   * форму изменённой — она сравнивала бы её с тем, что было ДО сохранения, и спрашивала «уйти
   * без сохранения?» у человека, который только что сохранил. Ответ сервера приходится
   * дожидаться: иначе форма на миг вернётся к досохранённому виду.
   */
  const saveMeta = async () => {
    await updateTest.mutate(testId, { title: title.trim(), description: description.trim() });
    await test.refetch();
    setHydrated(false);
  };

  const saveRule = async () => {
    await upsertRule.mutate(testId, ruleForm);
    await test.refetch();
    setHydrated(false);
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
      {unsavedGuard}
      <PageHeader
        title={t.title}
        subtitle={
          courseNames.get(t.courseId) ? `Курс «${courseNames.get(t.courseId)}»` : 'Тест курса'
        }
        toolsSlot={<StatusChip status={t.status} label={formatEntityStatus(t.status)} />}
        {...(!isPublished && !isArchived
          ? {
              primaryAction: {
                label: 'Опубликовать',
                onSelect: onPublish,
                disabled: !hasQuestions || publish.isPending,
                busy: publish.isPending
              }
            }
          : {})}
        {...(!isArchived
          ? {
              secondaryActions: [
                {
                  label: 'Архивировать',
                  onSelect: onArchive,
                  disabled: archive.isPending,
                  busy: archive.isPending
                }
              ]
            }
          : {})}
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
        {/* UI-003: один акцент на экран — главное действие черновика «Опубликовать» в шапке,
            кнопки сохранения секций вторичные. */}
        <button
          type="button"
          className={`ui-button ${updateTest.isPending ? 'ui-button--loading' : ''}`}
          onClick={saveMeta}
          disabled={updateTest.isPending}
        >
          Сохранить параметры
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
          className={`ui-button ${upsertRule.isPending ? 'ui-button--loading' : ''}`}
          onClick={saveRule}
          disabled={upsertRule.isPending}
        >
          Сохранить правила
        </button>
        {upsertRule.error ? <p className="ui-field-error">{upsertRule.error}</p> : null}
      </SectionCard>

      <SectionCard title="Вопросы теста">
        <div className="ui-toolbar">
          <button type="button" className="ui-button" onClick={() => setPickerOpen(true)}>
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
                >
                  Удалить вопрос
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
