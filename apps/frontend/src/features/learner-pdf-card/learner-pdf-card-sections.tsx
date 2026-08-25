'use client';

import { DataTable, LoadingState, StatusChip } from '@trudskill/ui';

import { useLearnerPdfCard } from './hooks';
import { SectionCard, SectionEmpty, SectionError } from '../../components/state-wrappers';
import { DOCUMENT_TYPE_LABELS, ENROLLMENT_STATUS_LABEL, formatDate } from '../mvp/screen-helpers';

import type { ReactElement } from 'react';

const TRAINING_TYPE_LABELS: Record<string, string> = {
  primary: 'Первичное',
  repeat: 'Повторное',
  target: 'Целевое',
  extraordinary: 'Внеочередное'
};

/**
 * Pillar A Plan C §5.11 — секции «Учебная история», «Выданные документы»
 * и кнопка PDF-экспорта для карточки слушателя.
 *
 * PDF-кнопка выключена с пояснением рядом — реальный binary render
 * отложен до Phase 5 (см. deviation в Plan C Task 12).
 */
export function LearnerPdfCardSections({ learnerId }: { learnerId: string }) {
  const { data, isLoading, error } = useLearnerPdfCard(learnerId);

  if (isLoading) return <LoadingState message="Загружаем карточку слушателя…" />;
  if (error) return <SectionError message="Не удалось загрузить карточку слушателя" />;
  if (!data) return null;

  return (
    <>
      <SectionCard title="Личные данные (для PDF)">
        <p>
          <strong>{data.learner.fullName || '—'}</strong>
        </p>
        <p>СНИЛС: {data.learner.snils ?? '—'}</p>
        <p>Должность: {data.learner.position ?? '—'}</p>
        <p>Личный номер: {data.learner.learnerNo ?? '—'}</p>
        <p className="ui-inline">
          {/* Недоступное действие не притворяется живой кнопкой и не открывает
              браузерное окно (CMP-006): выключено с пояснением рядом. */}
          <button type="button" className="ui-button" disabled>
            Экспорт PDF: карточка слушателя
          </button>
          <span className="ui-hint">
            Выгрузка в PDF появится позже — данные карточки уже видны в секциях выше.
          </span>
        </p>
      </SectionCard>

      <SectionCard title="Учебная история">
        {data.enrollments.length === 0 ? (
          <SectionEmpty
            message="У слушателя нет зачислений"
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
              enrolledAt: formatDate(e.enrolledAt),
              completedAt: e.completedAt ? formatDate(e.completedAt) : '—',
              status: ENROLLMENT_STATUS_LABEL[e.status] ?? e.status
            }))}
          />
        )}
      </SectionCard>

      <SectionCard title="Выданные документы">
        {data.documents.length === 0 ? (
          <SectionEmpty
            message="Документы не выданы"
            hint="Удостоверения и протоколы появляются после закрытия группы — тогда же их увидит и слушатель в своём кабинете."
          />
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
              documentDate: formatDate(d.documentDate),
              documentType: DOCUMENT_TYPE_LABELS[d.documentType] ?? d.documentType,
              statusView: <StatusChip status={d.status} />
            }))}
          />
        )}
      </SectionCard>
    </>
  );
}
