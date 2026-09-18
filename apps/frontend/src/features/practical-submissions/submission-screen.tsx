'use client';

import { BlockedHint, FilePicker, LoadingState, blockedProps } from '@trudskill/ui';
import { useEffect, useState } from 'react';

import { canSaveDraft, shouldHydrateDraft } from './draft-rules';
import {
  formatAntivirusStatusLearner,
  formatSubmissionStatus,
  isSubmissionEditable,
  submitBlockedReason
} from './format';
import {
  useCreateSubmission,
  useMyAssignments,
  useSubmission,
  useSubmitSubmission,
  useUpdateSubmission,
  useUploadSubmissionFile
} from './hooks';
import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionError
} from '../../components/state-wrappers';
import { SUBMISSION_ACCEPT, UPLOAD_MAX_SIZE_MB } from '../../lib/files/limits';
import { useObjectCrumb } from '../navigation/use-object-crumb';

export function SubmissionScreen({ assignmentId }: { assignmentId: string }) {
  const assignments = useMyAssignments();
  const summary = assignments.data?.find((a) => a.assignmentId === assignmentId);
  useObjectCrumb(summary?.title, {
    failed: Boolean(assignments.error),
    notFound: Boolean(assignments.data) && !summary
  });

  const createSubmission = useCreateSubmission();
  const updateSubmission = useUpdateSubmission();
  const submitSubmission = useSubmitSubmission();
  const uploadFile = useUploadSubmissionFile();

  const [answerText, setAnswerText] = useState('');
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  /*
   * Признак подстановки — СОСТОЯНИЕ, а не ref: при пустом сохранённом ответе
   * `setAnswerText('')` ничего не меняет, перерисовки не будет, и кнопка сохранения
   * осталась бы заблокированной навсегда.
   */
  const [draftHydrated, setDraftHydrated] = useState(false);

  // Resolve the active submission id before the early returns so the data hook is called
  // unconditionally (rules of hooks). The full DTO carries the file's antivirus status (V1.1).
  const activeSubmissionId = submissionId ?? summary?.submissionId ?? null;
  const submission = useSubmission(activeSubmissionId);

  /*
   * Ревизия 2026-08-27 (порция 27, журнал 279): подставляем сохранённый ответ в поле.
   * Экран всегда стартовал с пустого — сервер текст отдавал, но в поле он не попадал
   * никогда, и человек, вернувшийся к заданию, видел пустоту вместо своей работы.
   * Подставляем ОДИН раз: дальше поле принадлежит человеку, перетирать его правки нельзя.
   */
  const serverAnswerText = submission.data?.answerText;
  useEffect(() => {
    if (!shouldHydrateDraft({ alreadyHydrated: draftHydrated, serverText: serverAnswerText }))
      return;
    setDraftHydrated(true);
    setAnswerText(serverAnswerText ?? '');
  }, [serverAnswerText, draftHydrated]);

  // Пока сохранённый ответ не подставлен, сохранять нельзя: пустое поле затёрло бы его.
  const awaitingServerDraft = activeSubmissionId !== null && !draftHydrated;

  if (assignments.isLoading) return <LoadingState />;
  if (!summary) {
    return (
      <PageContainer>
        <SectionError message="Задание недоступно" onRetry={() => void assignments.refetch()} />
      </PageContainer>
    );
  }

  const editable = isSubmissionEditable(summary.status);
  const submitBlocked = submitBlockedReason(summary.status);
  const [fileError, setFileError] = useState<string | null>(null);

  const ensureSubmission = async (): Promise<string | null> => {
    if (activeSubmissionId) return activeSubmissionId;
    const created = await createSubmission.mutate({
      assignmentId: summary.assignmentId,
      enrollmentId: summary.enrollmentId,
      learnerId: summary.learnerId,
      answerText
    });
    if (created) setSubmissionId(created.id);
    return created?.id ?? null;
  };

  const onSaveText = async () => {
    const id = await ensureSubmission();
    if (id && activeSubmissionId) await updateSubmission.mutate(id, { answerText });
  };

  const onUpload = async (file: File) => {
    const id = await ensureSubmission();
    if (id) {
      await uploadFile.mutate(id, file);
      // Refresh the submission so the freshly-attached file's antivirus status appears.
      void submission.refetch();
    }
  };

  const onSubmit = async () => {
    const id = await ensureSubmission();
    if (id) {
      await submitSubmission.mutate(id);
      void assignments.refetch();
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title={summary.title}
        subtitle={`Статус: ${formatSubmissionStatus(summary.status)}`}
      />

      {summary.status === 'returned' && summary.returnComment ? (
        <SectionCard title="Комментарий проверяющего">
          <p>{summary.returnComment}</p>
        </SectionCard>
      ) : null}

      <SectionCard title="Ваш ответ">
        <textarea
          value={answerText}
          disabled={!editable}
          onChange={(e) => setAnswerText(e.target.value)}
          rows={8}
          placeholder="Опишите выполненную работу"
        />
        <button
          type="button"
          disabled={
            !canSaveDraft({
              editable,
              saving: updateSubmission.isPending,
              awaitingServerDraft
            })
          }
          {...(awaitingServerDraft
            ? { title: 'Загружаем сохранённый ответ — секунду, чтобы не затереть написанное' }
            : {})}
          onClick={() => void onSaveText()}
        >
          Сохранить черновик
        </button>
        {awaitingServerDraft && submission.error ? (
          <SectionError
            message="Не удалось загрузить сохранённый ответ. Пока он не загружен, сохранять нельзя — иначе написанное раньше будет затёрто."
            onRetry={() => void submission.refetch()}
          />
        ) : null}
        {updateSubmission.error ? <SectionError message={updateSubmission.error} /> : null}
      </SectionCard>

      <SectionCard title="Файл">
        {/*
          ТЗ 5.9 (Э9): область перетаскивания и требования словами. Раньше здесь была голая
          кнопка: какой файл примут и сколько он может весить, слушатель узнавал отказом уже
          после загрузки (журнал 469).
        */}
        <FilePicker
          ariaLabel="Файл практической работы"
          accept={SUBMISSION_ACCEPT}
          maxSizeMb={UPLOAD_MAX_SIZE_MB}
          variant="dropzone"
          disabled={!editable || uploadFile.isPending}
          resetAfterSelect
          error={fileError}
          onReject={setFileError}
          onSelect={(file) => {
            setFileError(null);
            if (file) void onUpload(file);
          }}
        />
        {uploadFile.isPending ? <LoadingState /> : null}
        {uploadFile.data ? <p>Файл загружен.</p> : null}
        {submission.data?.fileId && submission.data.antivirusStatus ? (
          <p>{formatAntivirusStatusLearner(submission.data.antivirusStatus)}</p>
        ) : null}
        {uploadFile.error ? <SectionError message={uploadFile.error} /> : null}
      </SectionCard>

      {/* ТЗ 5.8 (Э8): выключенная кнопка называет состояние работы, а не молчит. */}
      <button
        type="button"
        {...blockedProps('submit-practical', submitBlocked)}
        disabled={submitBlocked !== undefined || submitSubmission.isPending}
        onClick={() => void onSubmit()}
      >
        Отправить на проверку
      </button>
      <BlockedHint hintKey="submit-practical" reason={submitBlocked} />
      {submitSubmission.error ? <SectionError message={submitSubmission.error} /> : null}
    </PageContainer>
  );
}
