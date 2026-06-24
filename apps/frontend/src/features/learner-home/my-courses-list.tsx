'use client';

import { StatusChip } from '@trudskill/ui';
import Link from 'next/link';

import { SectionCard, SectionEmpty } from '../../components/state-wrappers';

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
        <SectionEmpty message="Курсы пока не назначены" />
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Мои курсы">
      <ul className="learner-home-courses">
        {entries.map((entry) => {
          const title =
            entry.course?.title ?? `Курс ${entry.enrollment.courseId ?? entry.enrollment.id}`;
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
                <StatusChip status={entry.enrollment.status} />
              </div>
              <progress max={100} value={percent} aria-label={`Прогресс по курсу ${title}`} />
              <div className="learner-home-course__meta">
                <span>Прогресс курса</span>
                <span className="learner-home-course__percent">{percent}%</span>
              </div>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
};
