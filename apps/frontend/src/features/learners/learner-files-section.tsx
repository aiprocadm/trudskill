'use client';

import { DataTable, FilePicker, LoadingState, useConfirmDialog } from '@trudskill/ui';
import { useState } from 'react';

import { learnerFilesApi } from './api';
import { useLearnerFiles } from './hooks';
import { SectionCard, SectionEmpty, SectionError } from '../../components/state-wrappers';
import { hasPermission } from '../../lib/rbac/permissions';
import { useAuth } from '../auth/context';
import { putFileToPresignedUrl } from '../identity-verification/api';
import { formatDateTime } from '../mvp/screen-helpers';

import type { LearnerFile } from './types';

/** Что принимает вкладка: согласия и сканы — PDF, картинки, Word (зеркало серверного списка). */
const ACCEPT = 'application/pdf,image/png,image/jpeg,.doc,.docx';

/** Проверка антивирусом — по-русски; до вердикта и при заражении скачать нельзя. */
export const ANTIVIRUS_LABEL: Record<string, string> = {
  pending: 'проверяется',
  clean: 'проверен',
  infected: 'заражён — скачать нельзя',
  error: 'ошибка проверки'
};

/** Размер файла для человека: 1,2 МБ, а не 1258291. */
export const formatFileSize = (bytes: number): string => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} МБ`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${bytes} Б`;
};

/**
 * Вкладка «Файлы» карточки слушателя (ТЗ перехода §6.4 МГ-C2.1; срез 9.2, РМ94–РМ96):
 * согласия и сканы до N файлов (предел — настройка центра). Загрузка в два шага, как у всех
 * файлов платформы: подписанная ссылка → прямая отправка в хранилище → «прикрепить».
 * Скачивание — только после проверки антивирусом (гейт сервера).
 */
export function LearnerFilesSection({ learnerId }: { learnerId: string }) {
  const { session } = useAuth();
  const canWrite = hasPermission(session?.permissions ?? [], 'learners.write');
  const files = useLearnerFiles(learnerId);
  const { ask, dialog } = useConfirmDialog();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const items = files.data?.items ?? [];
  const limit = files.data?.limit ?? 0;
  const limitReached = Boolean(files.data) && items.length >= limit;

  const run = (work: () => Promise<string | null>) => {
    if (!session) return;
    setBusy(true);
    setActionError(null);
    setNotice(null);
    work()
      .then((message) => {
        if (message) setNotice(message);
      })
      .catch((err: unknown) => setActionError(err))
      .finally(() => setBusy(false));
  };

  const upload = (file: File) =>
    run(async () => {
      const intent = await learnerFilesApi.uploadUrl(session!, learnerId, {
        originalName: file.name,
        contentType: file.type,
        sizeBytes: file.size
      });
      await putFileToPresignedUrl(intent.uploadUrl, file);
      await learnerFilesApi.attach(session!, learnerId, intent.fileId);
      await files.refetch();
      return `Файл «${file.name}» добавлен в личное дело.`;
    });

  const download = (row: LearnerFile) =>
    run(async () => {
      const { url } = await learnerFilesApi.downloadUrl(session!, learnerId, row.fileId);
      window.open(url, '_blank', 'noopener');
      return null;
    });

  const remove = (row: LearnerFile) =>
    ask(
      {
        title: `Удалить файл: ${row.name}`,
        message: `Файл «${row.name}» будет удалён из личного дела и из хранилища — вернуть его нельзя.`,
        confirmLabel: 'Удалить файл',
        tone: 'danger'
      },
      () =>
        run(async () => {
          await learnerFilesApi.remove(session!, learnerId, row.fileId);
          await files.refetch();
          return `Файл «${row.name}» удалён.`;
        })
    );

  const rowActions = (row: LearnerFile) => [
    ...(row.antivirusStatus === 'clean'
      ? [{ label: 'Скачать файл', disabled: busy, onSelect: () => download(row) }]
      : []),
    ...(canWrite
      ? [{ label: 'Удалить файл', danger: true, disabled: busy, onSelect: () => remove(row) }]
      : [])
  ];

  return (
    <SectionCard title="Файлы">
      {dialog}
      <p className="ui-text-muted">
        Согласия, сканы документов и другие файлы по этому слушателю.
        {files.data ? ` Загружено ${items.length} из ${limit}.` : ''}
      </p>
      {files.isLoading ? <LoadingState message="Загружаем файлы…" /> : null}
      {files.error ? (
        <SectionError error={files.error} onRetry={() => void files.refetch()} />
      ) : null}
      {actionError !== null ? <SectionError error={actionError} /> : null}
      {notice ? (
        <p className="ui-callout" role="status">
          {notice}
        </p>
      ) : null}

      {files.data && items.length === 0 ? (
        <SectionEmpty
          message="Файлов пока нет"
          hint={
            canWrite
              ? 'Загрузите бумажное согласие на обработку данных или скан документа — файл проверится антивирусом и останется в личном деле.'
              : 'Файлы в личное дело добавляет сотрудник с правом на правку слушателей.'
          }
        />
      ) : null}

      {items.length > 0 ? (
        <DataTable
          columns={[
            { key: 'name', title: 'Файл' },
            { key: 'size', title: 'Размер' },
            { key: 'uploadedAt', title: 'Загружен' },
            { key: 'antivirus', title: 'Проверка' }
          ]}
          rows={items.map((row) => ({
            ...row,
            size: formatFileSize(row.sizeBytes),
            uploadedAt: formatDateTime(row.uploadedAt),
            antivirus: ANTIVIRUS_LABEL[row.antivirusStatus] ?? row.antivirusStatus
          }))}
          rowActions={rowActions}
        />
      ) : null}

      {canWrite && files.data && !limitReached ? (
        <FilePicker
          ariaLabel="Добавить файл в личное дело"
          buttonLabel="Добавить файл"
          accept={ACCEPT}
          disabled={busy}
          resetAfterSelect
          variant="dropzone"
          onSelect={(file) => {
            if (file) upload(file);
          }}
        />
      ) : null}
      {canWrite && limitReached ? (
        <p className="ui-hint">
          Достигнут предел: {limit} файлов на слушателя. Удалите ненужный файл, чтобы добавить
          новый.
        </p>
      ) : null}
    </SectionCard>
  );
}
