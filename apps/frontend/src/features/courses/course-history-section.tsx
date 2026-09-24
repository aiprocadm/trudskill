'use client';

import { DataTable, LoadingState } from '@trudskill/ui';
import { useState } from 'react';

import { useCourseHistory } from './course-history';
import { SectionCard, SectionEmpty, SectionError } from '../../components/state-wrappers';
import { describeAction, entityLabel } from '../audit/labels';
import { formatDateTime } from '../mvp/screen-helpers';

/**
 * «История изменений» курса (МГ-E2.3, срез 16.4): кто и когда завёл курс, менял основное,
 * выпускал и публиковал версии. Отдельной вкладкой не сделана: вкладки карточки курса
 * закреплены ТЗ (Параметры · Программа · Аттестация · Документы), а история — свойство
 * параметров, как и версии.
 */
export function CourseHistorySection({ courseId }: { courseId: string }) {
  const [shown, setShown] = useState(false);
  const history = useCourseHistory(courseId, shown);

  return (
    <SectionCard title="История изменений">
      {!shown ? (
        <>
          <p className="ui-hint">
            Кто и когда заводил курс, менял основное, выпускал и публиковал версии программы.
          </p>
          <div className="ui-form-actions">
            <button type="button" className="ui-button-secondary" onClick={() => setShown(true)}>
              Показать историю
            </button>
          </div>
        </>
      ) : null}
      {history.isLoading ? <LoadingState message="Загружаем историю…" /> : null}
      {history.error ? (
        <SectionError error={history.error} onRetry={() => void history.refetch()} />
      ) : null}
      {history.data && history.data.items.length === 0 ? (
        <SectionEmpty
          message="Событий пока нет"
          hint="Здесь появятся заведение курса, правки основного, новые версии и публикации — с датой и именем сотрудника."
        />
      ) : null}
      {history.data && history.data.items.length > 0 ? (
        <DataTable
          columns={[
            { key: 'when', title: 'Когда' },
            { key: 'who', title: 'Кто' },
            { key: 'what', title: 'Что произошло' },
            { key: 'over', title: 'Над чем' }
          ]}
          rows={history.data.items.map((item) => ({
            id: item.id,
            when: formatDateTime(item.createdAt),
            who: item.system ? 'Система' : (item.actorName ?? 'сотрудник не найден'),
            what: describeAction(item.action),
            over: entityLabel(item.entityType)
          }))}
        />
      ) : null}
      {history.data?.truncated ? (
        <p className="ui-hint">
          Показаны последние события; полный журнал — в разделе «Журнал действий».
        </p>
      ) : null}
    </SectionCard>
  );
}
