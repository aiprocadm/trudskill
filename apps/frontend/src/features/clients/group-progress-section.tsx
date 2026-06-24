'use client';

import { LoadingState } from '@trudskill/ui';

import { formatProgressLabel } from './format';
import { useClientProgress } from './hooks';
import { SectionCard, SectionEmpty, SectionError } from '../../components/state-wrappers';

interface GroupProgressSectionProps {
  clientId: string;
}

export function GroupProgressSection({ clientId }: GroupProgressSectionProps) {
  const progress = useClientProgress(clientId);

  if (progress.isLoading) {
    return (
      <SectionCard title="Прогресс обучения">
        <LoadingState message="Загрузка прогресса…" />
      </SectionCard>
    );
  }

  if (progress.error) {
    return (
      <SectionCard title="Прогресс обучения">
        <SectionError
          message={
            progress.error instanceof Error
              ? progress.error.message
              : 'Не удалось загрузить прогресс'
          }
          onRetry={() => void progress.refetch()}
        />
      </SectionCard>
    );
  }

  if (!progress.data) {
    return (
      <SectionCard title="Прогресс обучения">
        <SectionEmpty message="Нет прогресса" hint="У компании нет зачислений." />
      </SectionCard>
    );
  }

  const s = progress.data;
  const percent = Math.round(s.avgCompletionRate * 100);

  return (
    <SectionCard title="Прогресс обучения">
      <dl className="ui-data-list">
        <div className="ui-data-list__row">
          <dt>Учеников</dt>
          <dd>{s.totalLearners}</dd>
        </div>
        <div className="ui-data-list__row">
          <dt>Зачислений всего</dt>
          <dd>{s.enrollments.total}</dd>
        </div>
        <div className="ui-data-list__row">
          <dt>Завершено</dt>
          <dd>{s.enrollments.completed}</dd>
        </div>
        <div className="ui-data-list__row">
          <dt>В процессе</dt>
          <dd>{s.enrollments.inProgress}</dd>
        </div>
        <div className="ui-data-list__row">
          <dt>Не начато</dt>
          <dd>{s.enrollments.notStarted}</dd>
        </div>
        <div className="ui-data-list__row">
          <dt>Средний прогресс</dt>
          <dd>{percent}%</dd>
        </div>
      </dl>

      {s.perCourse.length > 0 ? (
        <div className="ui-stack">
          <h4 className="ui-subheading">По курсам</h4>
          <ul className="ui-bare-list">
            {s.perCourse.map((c) => (
              <li key={c.courseId}>
                <span className="ui-muted">{c.courseId}:</span>{' '}
                {formatProgressLabel(c.completed, c.total)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </SectionCard>
  );
}
