'use client';

import { LoadingState } from '@cdoprof/ui';
import { useState } from 'react';

import {
  formatAntivirusStatusLearner,
  formatSubmissionStatus,
  isSubmissionEditable
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

export function SubmissionScreen({ assignmentId }: { assignmentId: string }) {
  const assignments = useMyAssignments();
  const summary = assignments.data?.find((a) => a.assignmentId === assignmentId);

  const createSubmission = useCreateSubmission();
  const updateSubmission = useUpdateSubmission();
  const submitSubmission = useSubmitSubmission();
  const uploadFile = useUploadSubmissionFile();

  const [answerText, setAnswerText] = useState('');
  const [submissionId, setSubmissionId] = useState<string | null>(null);

  // Resolve the active submission id before the early returns so the data hook is called
  // unconditionally (rules of hooks). The full DTO carries the file's antivirus status (V1.1).
  const activeSubmissionId = submissionId ?? summary?.submissionId ?? null;
  const submission = useSubmission(activeSubmissionId);

  if (assignments.isLoading) return <LoadingState />;
  if (!summary) {
    return (
      <PageContainer>
        <SectionError message="Задание недоступно" onRetry={() => void assignments.refetch()} />
      </PageContainer>
    );
  }

  const editable = isSubmissionEditable(summary.status);

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
          disabled={!editable || updateSubmission.isPending}
          onClick={() => void onSaveText()}
        >
          Сохранить черновик
        </button>
        {updateSubmission.error ? <SectionError message={updateSubmission.error} /> : null}
      </SectionCard>

      <SectionCard title="Файл">
        <input
          type="file"
          disabled={!editable || uploadFile.isPending}
          onChange={(e) => {
            const file = e.target.files?.[0];
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

      <button
        type="button"
        disabled={!editable || submitSubmission.isPending}
        onClick={() => void onSubmit()}
      >
        Отправить на проверку
      </button>
      {submitSubmission.error ? <SectionError message={submitSubmission.error} /> : null}
    </PageContainer>
  );
}
