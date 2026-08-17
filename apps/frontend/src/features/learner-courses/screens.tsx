'use client';

import { LoadingState, StatusChip } from '@trudskill/ui';
import Link from 'next/link';
import { useEffect, useMemo } from 'react';

import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../components/state-wrappers';
import { completeMetricTimer, startMetricTimer } from '../../lib/analytics/ux-metrics';
import { frontendEnv } from '../../lib/config/env';
import { CourseViewerScreen } from '../course-viewer/course-viewer-screen';
import { useLearnerHomeData } from '../learner-home/use-learner-home-data';
import { type EnrollmentCertsBundle, useEnrollmentCertificatesForCompleted } from '../mvp/hooks';
import { ListSkeleton } from '../mvp/screen-helpers';

import type { EnrollmentCertificateRow } from '../mvp/types';

/*
 * Перенесены «как есть» из features/mvp/screens.tsx (§8.3, порядок 10 — последний;
 * правило SCR-001: перенос и редизайн не смешиваются в одном коммите).
 */

const resolveCertificateDownloadHref = (downloadPath: string): string => {
  try {
    const apiRoot = new URL(frontendEnv.NEXT_PUBLIC_API_BASE_URL);
    return `${apiRoot.origin}${downloadPath}`;
  } catch {
    return downloadPath;
  }
};

export const LearnerCoursesScreen = () => {
  const { data, isLoading, error } = useLearnerHomeData();

  const completedEnrollmentIds = useMemo(
    () => data.filter((e) => e.enrollment.status === 'completed').map((e) => e.enrollment.id),
    [data]
  );

  const certsQuery = useEnrollmentCertificatesForCompleted(completedEnrollmentIds);
  const certLoading = certsQuery.isLoading;

  return (
    <PageContainer>
      <PageHeader
        title="Мои курсы"
        subtitle="Ваши назначения — открывайте курс и продолжайте обучение"
      />
      <SectionCard title="Назначенные курсы">
        {error ? <SectionError message={error} /> : null}
        {isLoading ? <ListSkeleton lines={5} /> : null}
        {!isLoading && !error && data.length ? (
          <ul className="course-grid">
            {data.map((entry) => {
              const courseId = entry.enrollment.courseId;
              const title = entry.course?.title ?? `Курс ${courseId ?? entry.enrollment.id}`;
              const percent =
                entry.progress.length === 0
                  ? 0
                  : Math.round(
                      entry.progress.reduce((acc, p) => acc + p.progressPercent, 0) /
                        entry.progress.length
                    );
              const href = `/learner/courses/${courseId ?? entry.enrollment.id}`;
              const ctaLabel =
                entry.enrollment.status === 'completed'
                  ? 'Открыть курс'
                  : percent > 0
                    ? 'Продолжить'
                    : 'Начать';
              return (
                <li key={entry.enrollment.id} className="course-card">
                  <span className="course-card__banner" aria-hidden />
                  <div className="course-card__head">
                    <h3 className="course-card__title">{title}</h3>
                    <StatusChip status={entry.enrollment.status} />
                  </div>
                  <div className="course-card__body">
                    <progress max={100} value={percent} aria-label={`Прогресс по курсу ${title}`} />
                    <div className="course-card__meta">
                      <span>Прогресс курса</span>
                      <span className="course-card__percent">{percent}%</span>
                    </div>
                    <Link href={href} className="ui-button ui-button--primary course-card__cta">
                      {ctaLabel}
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
        {!isLoading && !error && !data.length ? (
          <SectionEmpty
            message="Нет назначенных курсов"
            hint="Если вы ожидаете обучение, обратитесь к куратору или администратору учебного центра — вас ещё не зачислили в группу или курс."
          />
        ) : null}
      </SectionCard>
      <SectionCard title="Сертификаты по завершённым программам">
        {!completedEnrollmentIds.length ? (
          <SectionEmpty message="Завершите обучение, чтобы получить выпуск документа" />
        ) : null}
        {certLoading ? <LoadingState message="Загрузка списка документов…" /> : null}
        {!certLoading && completedEnrollmentIds.length ? (
          <ul className="ui-stack">
            {(certsQuery.data ?? []).map((row: EnrollmentCertsBundle) =>
              row.items.length ? (
                <li key={row.enrollmentId}>
                  <span className="ui-text-muted">Назначение {row.enrollmentId}</span>
                  <ul>
                    {row.items.map((doc: EnrollmentCertificateRow) => (
                      <li key={doc.id}>
                        <a
                          href={resolveCertificateDownloadHref(doc.downloadUrl)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {doc.name}
                        </a>{' '}
                        ({doc.documentType})
                      </li>
                    ))}
                  </ul>
                </li>
              ) : (
                <li key={row.enrollmentId}>
                  Назначение {row.enrollmentId}: документов пока нет (проверьте привязку шаблона в
                  разделе «Документы»).
                </li>
              )
            )}
          </ul>
        ) : null}
      </SectionCard>
    </PageContainer>
  );
};

export const LearnerCourseDetailsScreen = ({ id }: { id: string }) => {
  useEffect(() => {
    startMetricTimer('time_to_start_learning');
    completeMetricTimer('time_to_start_learning', {
      source: 'learner_course_viewer',
      courseId: id
    });
  }, [id]);

  return <CourseViewerScreen courseId={id} />;
};
