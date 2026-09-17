'use client';

import { DetailLayout, KeyValueList, ListPage, LoadingState, StatusChip } from '@trudskill/ui';
import Link from 'next/link';
import { useMemo } from 'react';

import {
  PageContainer,
  PageHeader,
  RecordNotFound,
  SectionCard,
  SectionError
} from '../../components/state-wrappers';
import { LearnerPdfCardSections } from '../learner-pdf-card/learner-pdf-card-sections';
import { useCoursesList, useGroupsList, useLearner, useLearnerCourses } from '../mvp/hooks';
import { ENROLLMENT_STATUS_LABEL, formatDate } from '../mvp/screen-helpers';
import { useObjectCrumb } from '../navigation/use-object-crumb';

/*
 * TPL-002 — эталон карточки (ТЗ §8.2). Что изменилось против перенесённой версии:
 *
 * 1. Раскладка `DetailLayout`: слева работа со слушателем, справа сводка `KeyValueList`.
 * 2. **Из карточки убраны сырые идентификаторы.** Было: заголовок «Карточка слушателя»
 *    (одинаковый для всех людей), строка `ID: 3f7a…`, подпись «Код (learnerNo)»,
 *    «Связанный IAM user» с идентификатором, а в зачислениях — «Курс (id)» и «Группа»
 *    кодами, статус кодом, дата машинной строкой. Ни одно из этих значений человеку
 *    ничего не сообщает (правило «ни одного сырого ID как значения»).
 * 3. Названия курса и группы берутся из справочников по идентификаторам — ручки,
 *    отдающей зачисления сразу с названиями, в контракте нет, а контракт в фазах
 *    редизайна не меняется.
 */

const PAGE_SIZE = 100;

export const LearnerDetailsScreen = ({ id }: { id: string }) => {
  const { data: learner, loading, error, notFound, refetch } = useLearner(id);
  const { data: enrollmentPage, loading: enrollmentsLoading } = useLearnerCourses(id);
  const { data: coursePage } = useCoursesList({ page: 1, page_size: PAGE_SIZE });
  const { data: groupPage } = useGroupsList({ page: 1, page_size: PAGE_SIZE });

  const enrollments = enrollmentPage?.items ?? [];

  const courseName = useMemo(
    () => new Map((coursePage?.items ?? []).map((course) => [course.id, course.title])),
    [coursePage]
  );
  const groupName = useMemo(
    () => new Map((groupPage?.items ?? []).map((group) => [group.id, group.name])),
    [groupPage]
  );

  const fullName = learner ? `${learner.lastName} ${learner.firstName}`.trim() : '';
  useObjectCrumb(fullName || undefined, { notFound, failed: Boolean(error) });

  /*
   * Записи нет — говорим это прямо. Прежде открывалась карточка-призрак: заголовок на месте,
   * разделы пустые, кнопки действий рабочие, а под ними строка ошибки, которую человек
   * принимает за временный сбой.
   */
  if (notFound) {
    return <RecordNotFound what="Слушатель" backHref="/learners" backLabel="К списку слушателей" />;
  }

  return (
    <PageContainer>
      <PageHeader
        title={fullName || 'Слушатель'}
        subtitle="Личное дело: где учится, что уже получил"
      />
      {loading ? <LoadingState message="Загружаем карточку…" /> : null}
      {error ? <SectionError message={error} onRetry={() => void refetch()} /> : null}
      {learner ? (
        <DetailLayout
          aside={
            <SectionCard title="Коротко">
              <KeyValueList
                items={[
                  { label: 'Статус', value: <StatusChip status={learner.status} /> },
                  { label: 'Личный номер', value: learner.learnerNo ?? 'не присвоен' },
                  { label: 'Почта', value: learner.email ?? 'не указана' },
                  {
                    /*
                     * Раньше здесь печатался идентификатор учётной записи. Администратору
                     * важно другое: сможет ли человек войти в кабинет.
                     */
                    label: 'Вход в кабинет',
                    value: learner.linkedIamUserId ? 'открыт' : 'не открыт'
                  },
                  { label: 'Заведён', value: formatDate(learner.createdAt) }
                ]}
              />
            </SectionCard>
          }
        >
          <SectionCard title="Обучение">
            {/* GOAL-4 волна 4: секция с таблицей — на общем каркасе, состояния не вручную. */}
            <ListPage
              isLoading={enrollmentsLoading}
              rows={enrollments.map((item) => ({
                course: courseName.get(item.courseId ?? '') ?? '—',
                group: groupName.get(item.groupId) ? (
                  <Link className="ui-link" href={`/groups/${item.groupId}`}>
                    {groupName.get(item.groupId)}
                  </Link>
                ) : (
                  '—'
                ),
                status: ENROLLMENT_STATUS_LABEL[item.status] ?? item.status,
                enrolledAt: formatDate(item.enrolledAt)
              }))}
              emptyMessage="Слушатель пока никуда не зачислен"
              emptyHint="Зачисление делается в карточке учебной группы — там же виден весь её состав."
              columns={[
                { key: 'course', title: 'Курс' },
                { key: 'group', title: 'Группа' },
                { key: 'status', title: 'Статус' },
                { key: 'enrolledAt', title: 'Зачислен' }
              ]}
            />
          </SectionCard>
          {/* Pillar A Plan C §5.11 — личное дело: учебная история + документы + PDF stub */}
          <LearnerPdfCardSections learnerId={id} />
        </DetailLayout>
      ) : null}
    </PageContainer>
  );
};
