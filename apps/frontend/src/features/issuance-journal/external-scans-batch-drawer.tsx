'use client';

import {
  BlockedHint,
  DataTable,
  DetailDrawer,
  DrawerCancelButton,
  FilePicker,
  blockedProps
} from '@trudskill/ui';
import { type ReactElement, useState } from 'react';

import {
  type BatchScanRow,
  EXTERNAL_SCAN_ACCEPT,
  batchSummary,
  externalDocumentsApi
} from './external-documents';
import { SectionError } from '../../components/state-wrappers';
import { hasPermission } from '../../lib/rbac/permissions';
import { useAuth } from '../auth/context';
import { putFileToPresignedUrl } from '../identity-verification/api';

const RESULT_LABELS: Record<BatchScanRow['status'], string> = {
  attached: 'Прикреплён',
  skipped: 'Пропущен',
  failed: 'Не прикреплён'
};

/**
 * «Загрузить сканы пачкой» (МГ-K6.1, срез 23.6): много файлов разом, каждый — к своему внешнему
 * документу по номеру в имени файла. Что не нашлось, названо поимённо с причиной: такие сканы
 * прикрепляются по одному через «Загрузить скан» в строке документа.
 */
export function ExternalScansBatchDrawer({
  onClose,
  onDone
}: {
  onClose: () => void;
  onDone: () => void | Promise<void>;
}): ReactElement | null {
  const { session } = useAuth();
  const batchHint = 'external-scans-batch';
  const [files, setFiles] = useState<File[]>([]);
  const [rejected, setRejected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [rows, setRows] = useState<BatchScanRow[] | null>(null);
  const blockedReason = files.length === 0 ? 'Выберите файлы сканов' : undefined;

  if (!session || !hasPermission(session.permissions, 'documents.write')) return null;

  const submit = async () => {
    if (files.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const uploaded: Array<{ fileId: string; fileName: string }> = [];
      const failedUploads: BatchScanRow[] = [];
      for (const file of files) {
        try {
          const intent = await externalDocumentsApi.externalScanUploadUrl(session, file);
          await putFileToPresignedUrl(intent.uploadUrl, file);
          uploaded.push({ fileId: intent.fileId, fileName: file.name });
        } catch {
          /* Частичный успех: файл, который не загрузился, — строка отчёта, остальные идут дальше. */
          failedUploads.push({
            fileName: file.name,
            status: 'failed',
            message: 'Файл не загрузился — попробуйте ещё раз.'
          });
        }
      }
      const result =
        uploaded.length > 0
          ? await externalDocumentsApi.attachExternalScans(session, uploaded)
          : { rows: [] };
      setRows([...result.rows, ...failedUploads]);
      setFiles([]);
      await onDone();
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DetailDrawer
      open
      onClose={onClose}
      width="lg"
      title="Загрузить сканы пачкой"
      hasUnsavedChanges={files.length > 0}
    >
      <div className="ui-stack">
        <p className="ui-hint">
          Назовите файлы номерами документов — например, «264501-3.pdf». Если номер повторяется у
          разных людей, добавьте фамилию: «Иванов 264501-3.pdf». Скан прикрепляется только к
          внешнему документу без скана; уже прикреплённый пачкой не заменяется.
        </p>
        <FilePicker
          ariaLabel="Сканы документов"
          buttonLabel={files.length > 0 ? `Выбрано файлов: ${files.length}` : 'Выбрать файлы'}
          accept={EXTERNAL_SCAN_ACCEPT}
          disabled={saving}
          variant="dropzone"
          resetAfterSelect
          onSelectMany={(picked) => {
            setFiles(picked);
            setRows(null);
          }}
          onReject={(reason) => setRejected((prev) => [...prev, reason])}
        />
        {rejected.length > 0 ? (
          <ul className="ui-hint">
            {rejected.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : null}
        {error !== null ? <SectionError error={error} /> : null}
        {rows ? (
          <>
            <p role="status">{batchSummary(rows)}</p>
            <DataTable
              columns={[
                { key: 'fileName', title: 'Файл' },
                { key: 'resultView', title: 'Итог' },
                { key: 'message', title: 'Пояснение' }
              ]}
              rows={rows.map((row, index) => ({
                ...row,
                id: `${index}`,
                resultView: RESULT_LABELS[row.status]
              }))}
            />
          </>
        ) : null}
        <div className="ui-modal-actions">
          <DrawerCancelButton className="ui-button" disabled={saving} onFallbackClose={onClose} />
          <button
            type="button"
            className={`ui-button ui-button--primary ${saving ? 'ui-button--loading' : ''}`}
            onClick={() => void submit()}
            disabled={saving}
            {...blockedProps(batchHint, blockedReason)}
          >
            Прикрепить сканы
          </button>
        </div>
        <BlockedHint hintKey={batchHint} reason={blockedReason} />
      </div>
    </DetailDrawer>
  );
}
