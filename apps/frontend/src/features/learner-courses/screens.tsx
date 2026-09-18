'use client';

import { useEffect } from 'react';

import { completeMetricTimer, startMetricTimer } from '../../lib/analytics/ux-metrics';
import { CourseViewerScreen } from '../course-viewer/course-viewer-screen';

/*
 * Здесь остался ОДИН экран — карточка курса `/learner/courses/[id]`.
 *
 * Список курсов отсюда убран в ТЗ 6.1 (С1): страница `/learner/courses` показывала ровно то
 * же, что главная кабинета, — назначенные курсы с прогрессом и документы об обучении. Второй
 * вход в то же место противоречит правилу «один раздел — одно имя — одно место» (3.4), и
 * адрес слит редиректом на `/learner` (решение владельца Р2, журнал 493).
 */

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
