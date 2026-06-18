'use client';

import { DataTable, StatusChip } from '@cdoprof/ui';

import { signatureBadgeLabel } from './signature-badge';
import { SectionCard, SectionEmpty } from '../../components/state-wrappers';

import type { LearnerDocument } from './types';
import type { Column } from '@cdoprof/ui';
import type { ReactElement } from 'react';

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  certificate: 'Удостоверение',
  protocol: 'Протокол',
  order: 'Приказ',
  diploma: 'Диплом',
  attestation: 'Свидетельство об аттестации',
  reference: 'Справка',
  report: 'Отчёт',
  contract: 'Договор'
};

interface Props {
  title?: string;
  showCourse?: boolean;
  documents: LearnerDocument[];
  onDownload?: (doc: LearnerDocument) => void;
}

const downloadStubMessage =
  'Скачивание PDF — в разработке.\n\n' +
  'В Phase 5 будет подключён background worker для рендера PDF. ' +
  'Сейчас можно проверить подлинность через QR-код на странице публичной проверки.';

const handleDownloadClick = (
  doc: LearnerDocument,
  onDownload: ((doc: LearnerDocument) => void) | undefined
): void => {
  if (onDownload) {
    onDownload(doc);
    return;
  }
  if (!doc.isDownloadable) {
    window.alert(downloadStubMessage);
    return;
  }
  window.open(doc.downloadUrl, '_blank', 'noopener,noreferrer');
};

/**
 * Phase 1 §4.3 — табличный вид «Мои документы».
 *
 * Скачивание stub до Phase 5: если `isDownloadable=false`, клик показывает
 * alert «в разработке» вместо открытия URL. Если есть `qrToken`, добавляем
 * ссылку «Проверить подлинность» — она работает прямо сейчас, не зависит от PDF.
 */
export function LearnerDocumentsList({
  title = 'Мои документы',
  showCourse = true,
  documents,
  onDownload
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
      documentDate: d.documentDate ?? '—',
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
            onClick={() => handleDownloadClick(d, onDownload)}
          >
            {d.isDownloadable ? 'Скачать' : 'Скачать (скоро)'}
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
            {d.documentNumber ?? d.id}: {d.revocationReason}
          </li>
        ))}
      </ul>
    </div>
  );
}
