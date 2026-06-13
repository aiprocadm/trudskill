'use client';

import { DataTable, LoadingState, StatusChip } from '@cdoprof/ui';
import { useRef, useState } from 'react';

import { putFileToPresignedUrl, scormApi } from './api';
import { useScormPackages } from './hooks';
import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../components/state-wrappers';
import { useAuth } from '../auth/context';

import type { ScormPackageDto, ScormPackageStatus } from './types';
import type { Column } from '@cdoprof/ui';
import type { ReactElement } from 'react';

function humanizeBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU');
}

/** Map ScormPackageStatus → an EntityStatus-compatible key for StatusChip colour. */
function statusChipKey(s: ScormPackageStatus): string {
  if (s === 'ready') return 'active';
  if (s === 'failed') return 'failed';
  return 'inactive';
}

/** Human-readable Russian label for each package status. */
function statusLabel(s: ScormPackageStatus): string {
  if (s === 'ready') return 'Готов';
  if (s === 'failed') return 'Ошибка';
  if (s === 'processing') return 'Обработка';
  return 'Загружен';
}

function readErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null) {
    const e = err as Record<string, unknown>;
    // API envelope shape: { response: { code, message } }
    if (typeof e['response'] === 'object' && e['response'] !== null) {
      const r = e['response'] as Record<string, unknown>;
      if (typeof r['message'] === 'string') return r['message'];
      if (typeof r['code'] === 'string') return r['code'];
    }
    if (typeof e['message'] === 'string') return e['message'];
  }
  return 'Произошла ошибка';
}

function getApiCode(err: unknown): string {
  if (typeof err === 'object' && err !== null) {
    const e = err as Record<string, unknown>;
    if (typeof e['response'] === 'object' && e['response'] !== null) {
      const r = e['response'] as Record<string, unknown>;
      if (typeof r['code'] === 'string') return r['code'];
    }
  }
  return '';
}

interface TableRow {
  id: string;
  title: string;
  packageStatus: ScormPackageStatus;
  error: string | undefined;
  entryCount: number | undefined;
  totalBytes: number | undefined;
  createdAt: string;
  _raw: ScormPackageDto;
}

export function ScormPackagesScreen(): ReactElement {
  const { session } = useAuth();
  const { packages, loading, error, reload } = useScormPackages();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleUpload = async () => {
    if (!session) return;
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setUploadError('Выберите zip-файл с SCORM-пакетом.');
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      // If the file.type is empty (common with .zip on some OS), default to application/zip
      const contentType = file.type && file.type !== '' ? file.type : 'application/zip';
      const intent = await scormApi.uploadUrl(session, {
        originalName: file.name,
        contentType,
        sizeBytes: file.size
      });
      await putFileToPresignedUrl(intent.uploadUrl, file, contentType);
      const pkg = await scormApi.register(session, {
        zipFileId: intent.fileId,
        title: file.name
      });
      await scormApi.process(session, pkg.id);
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
      reload();
    } catch (err) {
      setUploadError(readErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const handleProcess = async (id: string) => {
    if (!session) return;
    setActionError(null);
    try {
      await scormApi.process(session, id);
      reload();
    } catch (err) {
      setActionError(readErrorMessage(err));
    }
  };

  const handleDelete = async (pkg: ScormPackageDto) => {
    if (!session) return;
    if (!window.confirm(`Удалить пакет «${pkg.title}»?`)) return;
    setActionError(null);
    try {
      await scormApi.remove(session, pkg.id);
      reload();
    } catch (err) {
      const code = getApiCode(err);
      if (code === 'scorm_package_in_use') {
        setActionError('Пакет привязан к материалу курса — отвяжите материал перед удалением.');
      } else {
        setActionError(readErrorMessage(err));
      }
    }
  };

  const rows: TableRow[] = packages.map((p) => ({
    id: p.id,
    title: p.title,
    packageStatus: p.packageStatus,
    error: p.error,
    entryCount: p.entryCount,
    totalBytes: p.totalBytes,
    createdAt: p.createdAt,
    _raw: p
  }));

  const columns: Column<TableRow>[] = [
    {
      key: 'title',
      title: 'Название'
    },
    {
      key: 'packageStatus',
      title: 'Статус',
      render: (row) => (
        <span>
          <StatusChip
            status={statusChipKey(row.packageStatus)}
            label={statusLabel(row.packageStatus)}
          />
          {row.packageStatus === 'failed' && row.error ? (
            <span style={{ marginLeft: 6, fontSize: '0.8em', color: 'var(--ui-text-muted)' }}>
              {row.error}
            </span>
          ) : null}
        </span>
      )
    },
    {
      key: 'entryCount',
      title: 'Файлов',
      render: (row) => (row.entryCount != null ? String(row.entryCount) : '—')
    },
    {
      key: 'totalBytes',
      title: 'Размер',
      render: (row) => (row.totalBytes != null ? humanizeBytes(row.totalBytes) : '—')
    },
    {
      key: 'createdAt',
      title: 'Создан',
      render: (row) => formatDate(row.createdAt)
    },
    {
      key: 'id',
      title: 'Действия',
      render: (row) => (
        <span style={{ display: 'flex', gap: 6 }}>
          {row.packageStatus === 'uploaded' || row.packageStatus === 'failed' ? (
            <button type="button" onClick={() => void handleProcess(row.id)}>
              Обработать
            </button>
          ) : null}
          <button type="button" onClick={() => void handleDelete(row._raw)}>
            Удалить
          </button>
        </span>
      )
    }
  ];

  return (
    <PageContainer>
      <PageHeader
        title="SCORM-пакеты"
        subtitle="Загружайте готовые курсы SCORM 1.2 (zip) — после обработки их можно привязать к материалу курса."
      />
      <SectionCard title="Загрузить пакет">
        {uploadError ? <SectionError message={uploadError} /> : null}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,application/zip,application/x-zip-compressed"
            disabled={uploading}
          />
          <button type="button" onClick={() => void handleUpload()} disabled={uploading}>
            {uploading ? 'Загрузка...' : 'Загрузить'}
          </button>
        </div>
      </SectionCard>
      <SectionCard title="Пакеты">
        {actionError ? <SectionError message={actionError} /> : null}
        {loading ? (
          <LoadingState message="Загрузка пакетов..." />
        ) : error ? (
          <SectionError message={error} onRetry={reload} />
        ) : rows.length === 0 ? (
          <SectionEmpty message="Пока нет пакетов — загрузите zip с курсом SCORM 1.2" />
        ) : (
          <DataTable<TableRow> columns={columns} rows={rows} />
        )}
      </SectionCard>
    </PageContainer>
  );
}
