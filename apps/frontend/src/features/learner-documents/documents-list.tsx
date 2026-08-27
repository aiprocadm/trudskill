'use client';

import { DataTable, StatusChip } from '@trudskill/ui';

import { signatureBadgeLabel } from './signature-badge';
import { SectionCard, SectionEmpty } from '../../components/state-wrappers';
// Словарь видов и формат дат — из общего слоя: здесь жила ЧЕТВЁРТАЯ копия словаря.
import { DOCUMENT_TYPE_LABELS, formatDate } from '../mvp/screen-helpers';

import type { LearnerDocument } from './types';
import type { Column } from '@trudskill/ui';
import type { ReactElement } from 'react';

interface Props {
  title?: string;
  showCourse?: boolean;
  documents: LearnerDocument[];
  /**
   * Ревизия 2026-08-26 (порция 21): обязателен. Скачивание идёт через ручку
   * с авторизацией (см. useDocumentDownload) — прежний запасной путь открывал
   * адрес прямым переходом без Bearer-заголовка и всегда получал отказ.
   */
  onDownload: (doc: LearnerDocument) => void;
  /** id документа, который сейчас скачивается — его кнопка выключена. */
  downloadBusyId?: string | null;
}

const downloadStubMessage =
  'Скачивание PDF пока недоступно — подлинность можно проверить по QR-коду (ссылка «Проверить»)';

/**
 * Phase 1 §4.3 — табличный вид «Мои документы».
 *
 * Пока PDF не выпускается (`isDownloadable=false`), кнопка «Скачать» выключена
 * с пояснением в подсказке. Если есть `qrToken`, добавляем ссылку «Проверить» —
 * она работает прямо сейчас, не зависит от PDF.
 */
export function LearnerDocumentsList({
  title = 'Мои документы',
  showCourse = true,
  documents,
  onDownload,
  downloadBusyId
}: Props): ReactElement {
  if (documents.length === 0) {
    return (
      <SectionCard title={title}>
        <SectionEmpty
          message="Документы пока не выданы"
          hint="Они появятся здесь сразу после завершения курса и выпуска документов учебным центром."
        />
      </SectionCard>
    );
  }

  type Row = {
    documentNumber: string;
    documentDate: string;
    documentType: string;
    courseTitle: string;
    statusView: ReactElement;
    actions: ReactElement;
  };
  const columns: Column<Row>[] = [
    { key: 'documentNumber', title: '№ документа' },
    { key: 'documentDate', title: 'Дата' },
    { key: 'documentType', title: 'Тип' },
    ...(showCourse ? ([{ key: 'courseTitle', title: 'Программа' }] as Column<Row>[]) : []),
    { key: 'statusView', title: 'Статус', render: (row) => row.statusView },
    { key: 'actions', title: '', render: (row) => row.actions }
  ];
  const rows: Row[] = documents.map((d) => {
    const sigBadge = signatureBadgeLabel(d.signatureStatus);
    return {
      documentNumber: d.documentNumber ?? '—',
      documentDate: formatDate(d.documentDate),
      documentType: DOCUMENT_TYPE_LABELS[d.documentType] ?? d.documentType,
      courseTitle: d.courseTitle || '—',
      statusView: (
        <span className="learner-documents-status">
          <StatusChip status={d.status} />
          {sigBadge ? (
            <span className="learner-documents-signature-badge" data-testid={`signature-${d.id}`}>
              {sigBadge}
            </span>
          ) : null}
        </span>
      ),
      actions: (
        <div className="learner-documents-actions">
          <button
            type="button"
            className="ui-button ui-button--ghost"
            data-testid={`download-${d.id}`}
            disabled={!d.isDownloadable || downloadBusyId === d.id}
            {...(d.isDownloadable ? {} : { title: downloadStubMessage })}
            onClick={() => {
              if (d.isDownloadable) onDownload(d);
            }}
          >
            Скачать документ
          </button>
          {d.qrToken ? (
            <a
              className="ui-link"
              href={`/verify/${d.qrToken}`}
              target="_blank"
              rel="noreferrer noopener"
              data-testid={`verify-${d.id}`}
            >
              Проверить
            </a>
          ) : null}
        </div>
      )
    };
  });

  return (
    <SectionCard title={title}>
      <DataTable columns={columns} rows={rows} />
      {documents.some((d) => d.status === 'revoked') ? (
        <RevocationNotes documents={documents} />
      ) : null}
    </SectionCard>
  );
}

function RevocationNotes({ documents }: { documents: LearnerDocument[] }): ReactElement {
  const revoked = documents.filter((d) => d.status === 'revoked' && d.revocationReason);
  return (
    <div className="learner-documents-revocation-notes">
      <strong>Аннулированные документы:</strong>
      <ul>
        {revoked.map((d) => (
          <li key={d.id}>
            {d.documentNumber ?? 'Документ без номера'}: {d.revocationReason}
          </li>
        ))}
      </ul>
    </div>
  );
}
