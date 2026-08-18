'use client';

import { DetailDrawer, DetailLayout, KeyValueList, ProgressBar, StatusChip } from '@trudskill/ui';
import { useMemo, useState } from 'react';

import { PageContainer, PageHeader, SectionCard } from '../../components/state-wrappers';
import { hasPermission } from '../../lib/rbac/permissions';
import { useAuth } from '../auth/context';
import { CloseGroupSection } from '../close-group/screens';
import { IssueOrderModal } from '../group-orders/issue-order-modal';
import { LearnerSelect, learnerNameCell, useLearnerNames } from '../learners/learner-picker';
import { LearningJournalSection } from '../learning-journal/screens';
import {
  useCoursesList,
  useDomainMutations,
  useEnrollments,
  useGroup,
  useGroupCourses,
  useLearnerCourseProgress
} from '../mvp/hooks';
import { ENROLLMENT_STATUS_LABEL, MutationError, readApiMessage } from '../mvp/screen-helpers';
import { proctoringApi } from '../proctoring/api';

/*
 * TPL-002 (Фаза 4 срез 3). Что изменилось против перенесённой версии:
 *
 * 1. Раскладка `DetailLayout`: слева работа с группой, справа сводка — на 1024px
 *    боковая колонка уходит вниз, отдельной вёрстки для этого не нужно.
 * 2. **Единственное первичное действие — «Закрыть группу»** (ТЗ §8.2). Раньше первичным
 *    было «Сгенерировать приказ» — частная операция, а закрытие группы вообще жило на
 *    другом экране, где идентификатор группы приходилось вписывать руками из адресной
 *    строки. Теперь `JOB-A3` («закрыть группу и выдать документы») — два клика от
 *    оперативной панели, а сама механика закрытия переиспользуется, а не дублируется.
 * 3. Приказ и прочее — вторичные действия рядом с первичным.
 */
export const GroupDetailsScreen = ({ id }: { id: string }) => {
  const { session } = useAuth();
  const { data: group } = useGroup(id);
  const { data: courses } = useCoursesList({ page: 1, page_size: 20 });
  const { data: groupCourses, refetch: refetchCourses } = useGroupCourses(id);
  const { data: enrollments, refetch: refetchEnrollments } = useEnrollments({ group_id: id });
  const learnerNames = useLearnerNames();
  const { data: progress } = useLearnerCourseProgress(groupCourses?.items[0]?.courseId);
  const { createGroupCourse, createEnrollment } = useDomainMutations();
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [learnerId, setLearnerId] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [issueOrderOpen, setIssueOrderOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);

  // Pillar A Plan B §5.7: caller отвечает за фильтрацию только completed-enrollment'ов.
  const completedEnrollmentIds = useMemo(
    () => (enrollments?.items ?? []).filter((e) => e.status === 'completed').map((e) => e.id),
    [enrollments]
  );

  const averageProgress = useMemo(() => {
    if (!progress?.items.length) return 0;
    const total = progress.items.reduce((sum, item) => sum + item.progressPercent, 0);
    return Math.round(total / progress.items.length);
  }, [progress]);

  // Карта id→название курса для читаемого списка курсов группы (вместо сырых id).
  const courseTitleById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const course of courses?.items ?? []) map[course.id] = course.title;
    return map;
  }, [courses]);

  const enrollmentCount = enrollments?.items.length ?? 0;

  return (
    <PageContainer>
      <PageHeader
        title={group?.name ?? 'Карточка группы'}
        // exactOptionalPropertyTypes: undefined как значение не принимается — условный спред.
        {...(group?.code ? { subtitle: `Код группы: ${group.code}` } : {})}
        actions={
          <>
            {/* UI-007: одно первичное действие. Остальное — вторичным видом. */}
            <button
              type="button"
              className="ui-button ui-button--primary"
              onClick={() => setCloseOpen(true)}
            >
              Закрыть группу
            </button>
            <button
              type="button"
              className="ui-button-secondary"
              onClick={() => setIssueOrderOpen(true)}
            >
              Сгенерировать приказ
            </button>
          </>
        }
      />

      <DetailLayout
        aside={
          <SectionCard title="Сводка">
            <KeyValueList
              items={[
                { label: 'Код', value: group?.code ?? '—' },
                {
                  label: 'Статус',
                  value: <StatusChip status={group?.status ?? 'draft'} />
                },
                { label: 'Слушателей', value: String(enrollmentCount) },
                { label: 'Завершили', value: String(completedEnrollmentIds.length) },
                { label: 'Курсов назначено', value: String(groupCourses?.items.length ?? 0) }
              ]}
            />
            <ProgressBar
              value={averageProgress}
              label="Средний прогресс группы"
              caption={`Средний прогресс группы — ${averageProgress}%`}
            />
          </SectionCard>
        }
      >
        <SectionCard title="Курсы группы">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!selectedCourseId) return;
              void createGroupCourse({ groupId: id, courseId: selectedCourseId })
                .then(() => {
                  setSelectedCourseId('');
                  return refetchCourses();
                })
                .catch((groupCourseError) => setSaveError(readApiMessage(groupCourseError)));
            }}
            className="ui-inline"
            style={{ marginBottom: 8 }}
          >
            <select
              className="ui-select"
              value={selectedCourseId}
              onChange={(event) => setSelectedCourseId(event.target.value)}
              aria-label="Курс для назначения"
            >
              <option value="">Выберите курс для назначения</option>
              {courses?.items.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </select>
            <button type="submit" className="ui-button-secondary" disabled={!selectedCourseId}>
              Назначить курс
            </button>
          </form>
          <ul className="ui-stack" style={{ gap: 0, listStyle: 'none', padding: 0, margin: 0 }}>
            {groupCourses?.items.map((item) => (
              <li key={item.id} className="ui-list-row">
                {courseTitleById[item.courseId] ?? item.courseId}
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="Слушатели группы">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!learnerId.trim()) return;
              void createEnrollment({ groupId: id, learnerId: learnerId.trim() })
                .then(() => {
                  setLearnerId('');
                  return refetchEnrollments();
                })
                .catch((enrollmentError) => setSaveError(readApiMessage(enrollmentError)));
            }}
            className="ui-inline"
            style={{ marginBottom: 8 }}
          >
            {/* Фаза 6 срез 6 (id-input-ban): выбор по фамилии вместо «вставьте идентификатор». */}
            <LearnerSelect value={learnerId} onChange={setLearnerId} />
            <button type="submit" className="ui-button-secondary" disabled={!learnerId.trim()}>
              Зачислить слушателя
            </button>
          </form>
          <ul className="ui-stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {enrollments?.items.map((item) => (
              <li key={item.id} className="ui-inline" style={{ gap: 8, flexWrap: 'wrap' }}>
                {/* Список зачисленных состоял из идентификаторов вместо фамилий. */}
                <span>{learnerNameCell(learnerNames, item.learnerId)}</span>
                {/* TXT-006: статус словом, а не кодом `active`/`completed`. */}
                <StatusChip status={item.status} label={ENROLLMENT_STATUS_LABEL[item.status] ?? item.status} />
                {/* Phase 4 Plan B: per-student proctoring override (PATCH needs learners.write). */}
                {session && hasPermission(session.permissions, 'learners.write') ? (
                  <label className="ui-inline" style={{ gap: 4 }}>
                    <span>Прокторинг:</span>
                    <select
                      className="ui-select"
                      value={item.proctoringOverride ?? ''}
                      aria-label={`Прокторинг для слушателя ${item.learnerId}`}
                      onChange={(event) => {
                        const value = event.target.value;
                        void proctoringApi
                          .setOverride(session, item.id, {
                            override: value === 'require' || value === 'exempt' ? value : null
                          })
                          .then(() => refetchEnrollments())
                          .catch((overrideError) => setSaveError(readApiMessage(overrideError)));
                      }}
                    >
                      <option value="">наследуется</option>
                      <option value="require">требуется</option>
                      <option value="exempt">освобождён</option>
                    </select>
                  </label>
                ) : null}
              </li>
            ))}
          </ul>
          <MutationError message={saveError} />
        </SectionCard>

        {/* ФТ-B3.4: доказательная база на проверке ГИТ/Минтруда. */}
        <LearningJournalSection groupId={id} />
      </DetailLayout>

      {/* CMP-010: закрытие идёт панелью рядом со списком — карточка остаётся видна,
          а группа подставлена сама (раньше её вписывали руками на другом экране). */}
      <DetailDrawer
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        title="Закрыть группу"
        subtitle={group?.name ?? ''}
        width="lg"
      >
        <CloseGroupSection groupId={id} />
      </DetailDrawer>

      <IssueOrderModal
        open={issueOrderOpen}
        groupId={id}
        enrollmentIds={completedEnrollmentIds}
        onClose={() => setIssueOrderOpen(false)}
      />
    </PageContainer>
  );
};
