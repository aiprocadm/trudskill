'use client';

import { ProgressBar, StatusChip } from '@trudskill/ui';
import Link from 'next/link';

import { SectionCard, SectionEmpty } from '../../components/state-wrappers';
import { ENROLLMENT_STATUS_LABEL } from '../mvp/screen-helpers';

import type { EnrollmentWithDetails } from './types';

interface Props {
  entries: EnrollmentWithDetails[];
  loading: boolean;
}

const computeProgress = (entry: EnrollmentWithDetails): number => {
  if (entry.progress.length === 0) return 0;
  const sum = entry.progress.reduce((acc, item) => acc + item.progressPercent, 0);
  return Math.round(sum / entry.progress.length);
};

const PlaceholderRows = () => (
  <div className="ui-skeleton-block" aria-hidden>
    {[0, 1, 2].map((index) => (
      <div key={index} className="ui-skeleton-line" style={{ width: `${70 + index * 10}%` }} />
    ))}
  </div>
);

export const MyCoursesList = ({ entries, loading }: Props) => {
  if (loading) {
    return (
      <SectionCard title="Мои курсы">
        <PlaceholderRows />
      </SectionCard>
    );
  }

  if (entries.length === 0) {
    return (
      <SectionCard title="Мои курсы">
        <SectionEmpty
          message="Курсы пока не назначены"
          hint="Обратитесь к куратору учебного центра — он зачислит вас на обучение, и курс появится здесь."
        />
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Мои курсы">
      <ul className="learner-home-courses">
        {entries.map((entry) => {
          const title =
            entry.course?.title ?? 'Курс без названия';
          const percent = computeProgress(entry);
          const href = entry.enrollment.courseId
            ? `/learner/courses/${entry.enrollment.courseId}`
            : `/learner/courses/${entry.enrollment.id}`;
          return (
            <li key={entry.enrollment.id} className="learner-home-course">
              <div className="learner-home-course__head">
                <Link href={href} className="learner-home-course__title">
                  {title}
                </Link>
                <StatusChip
                  status={entry.enrollment.status}
                  label={ENROLLMENT_STATUS_LABEL[entry.enrollment.status] ?? entry.enrollment.status}
                />
              </div>
              <ProgressBar
                value={percent}
                label={`Прогресс по курсу ${title}`}
                caption={`Пройдено ${percent}%`}
              />
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
};
