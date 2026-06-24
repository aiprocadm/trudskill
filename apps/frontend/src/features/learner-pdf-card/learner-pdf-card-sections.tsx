'use client';

import { DataTable, LoadingState, StatusChip } from '@cdoprof/ui';

import { useLearnerPdfCard } from './hooks';
import { SectionCard, SectionEmpty, SectionError } from '../../components/state-wrappers';

import type { ReactElement } from 'react';

const TRAINING_TYPE_LABELS: Record<string, string> = {
  primary: 'Первичное',
  repeat: 'Повторное',
  target: 'Целевое',
  extraordinary: 'Внеочередное'
};

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

/**
 * Pillar A Plan C §5.11 — секции «Учебная история», «Выданные документы»
 * и кнопка PDF-экспорта для карточки ученика.
 *
 * PDF-кнопка показывает alert «В разработке» — реальный binary render
 * отложен до Phase 5 (см. deviation в Plan C Task 12).
 */
export function LearnerPdfCardSections({ learnerId }: { learnerId: string }) {
  const { data, isLoading, error } = useLearnerPdfCard(learnerId);

  const onExportPdf = () => {
    window.alert(
      'Экспорт PDF-карточки ученика пока недоступен.\n\n' +
        'Данные карточки можно просмотреть в секциях выше.'
    );
  };

  if (isLoading) return <LoadingState message="Загрузка карточки ученика…" />;
  if (error) return <SectionError message="Не удалось загрузить карточку ученика" />;
  if (!data) return null;

  return (
    <>
      <SectionCard title="Личные данные (для PDF)">
        <p>
          <strong>{data.learner.fullName || '—'}</strong>
        </p>
        <p>СНИЛС: {data.learner.snils ?? '—'}</p>
        <p>Должность: {data.learner.position ?? '—'}</p>
        <p>Код (learnerNo): {data.learner.learnerNo ?? '—'}</p>
        <p>
          <button type="button" className="ui-button" onClick={onExportPdf}>
            Экспорт PDF: карточка ученика
          </button>
        </p>
      </SectionCard>

      <SectionCard title="Учебная история">
        {data.enrollments.length === 0 ? (
          <SectionEmpty
            message="У ученика нет зачислений"
            hint="История появится после первого зачисления на программу"
          />
        ) : (
          <DataTable
            columns={[
              { key: 'courseTitle', title: 'Программа' },
              { key: 'academicHours', title: 'Часы' },
              { key: 'trainingType', title: 'Вид подготовки' },
              { key: 'enrolledAt', title: 'Зачислен' },
              { key: 'completedAt', title: 'Завершил' },
              { key: 'status', title: 'Статус' }
            ]}
            rows={data.enrollments.map((e) => ({
              courseTitle: e.courseTitle || '—',
              academicHours: e.academicHours ?? '—',
              trainingType: e.trainingType
                ? (TRAINING_TYPE_LABELS[e.trainingType] ?? e.trainingType)
                : '—',
              enrolledAt: e.enrolledAt.slice(0, 10),
              completedAt: e.completedAt?.slice(0, 10) ?? '—',
              status: e.status
            }))}
          />
        )}
      </SectionCard>

      <SectionCard title="Выданные документы">
        {data.documents.length === 0 ? (
          <SectionEmpty message="Документы не выданы" />
        ) : (
          <DataTable
            columns={[
              { key: 'documentNumber', title: '№ документа' },
              { key: 'documentDate', title: 'Дата' },
              { key: 'documentType', title: 'Тип' },
              {
                key: 'statusView',
                title: 'Статус',
                render: (row: { statusView: ReactElement }) => row.statusView
              }
            ]}
            rows={data.documents.map((d) => ({
              documentNumber: d.documentNumber ?? '—',
              documentDate: d.documentDate ?? '—',
              documentType: DOCUMENT_TYPE_LABELS[d.documentType] ?? d.documentType,
              statusView: <StatusChip status={d.status} />
            }))}
          />
        )}
      </SectionCard>
    </>
  );
}
