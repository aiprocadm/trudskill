'use client';

import { StatusChip } from '@trudskill/ui';
import { useMemo, useState } from 'react';

import { PageContainer, PageHeader, SectionCard } from '../../components/state-wrappers';
import { hasPermission } from '../../lib/rbac/permissions';
import { useAuth } from '../auth/context';
import { IssueOrderModal } from '../group-orders/issue-order-modal';
import { LearningJournalSection } from '../learning-journal/screens';
import {
  useCoursesList,
  useDomainMutations,
  useEnrollments,
  useGroup,
  useGroupCourses,
  useLearnerCourseProgress
} from '../mvp/hooks';
import { MutationError, ProgressBar, readApiMessage } from '../mvp/screen-helpers';
import { proctoringApi } from '../proctoring/api';

/*
 * Перенесён «как есть» из features/mvp/screens.tsx (§8.3, порядок 2; правило SCR-001).
 * Редизайн под TPL-002 (DetailLayout, «Закрыть группу» как единственное первичное
 * действие) — следующий срез.
 */
export const GroupDetailsScreen = ({ id }: { id: string }) => {
  const { session } = useAuth();
  const { data: group } = useGroup(id);
  const { data: courses } = useCoursesList({ page: 1, page_size: 20 });
  const { data: groupCourses, refetch: refetchCourses } = useGroupCourses(id);
  const { data: enrollments, refetch: refetchEnrollments } = useEnrollments({ group_id: id });
  const { data: progress } = useLearnerCourseProgress(groupCourses?.items[0]?.courseId);
  const { createGroupCourse, createEnrollment } = useDomainMutations();
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [learnerId, setLearnerId] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [issueOrderOpen, setIssueOrderOpen] = useState(false);

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

  return (
    <PageContainer>
      <PageHeader
        title={group?.name ?? 'Карточка группы'}
        actions={
          <button type="button" className="ui-button" onClick={() => setIssueOrderOpen(true)}>
            Сгенерировать приказ
          </button>
        }
      />
      <SectionCard title="Общая информация">
        <dl className="kv-list">
          <div className="kv-list__row">
            <dt>Код</dt>
            <dd>{group?.code ?? '—'}</dd>
          </div>
          <div className="kv-list__row">
            <dt>Статус</dt>
            <dd>
              <StatusChip status={group?.status ?? 'draft'} />
            </dd>
          </div>
        </dl>
      </SectionCard>
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
            value={selectedCourseId}
            onChange={(event) => setSelectedCourseId(event.target.value)}
          >
            <option value="">Выберите курс для назначения</option>
            {courses?.items.map((course) => (
              <option key={course.id} value={course.id}>
                {course.title}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="ui-button ui-button--primary"
            disabled={!selectedCourseId}
          >
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
      <SectionCard title="Зачисления и прогресс">
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
          <input
            value={learnerId}
            onChange={(event) => setLearnerId(event.target.value)}
            placeholder="ID слушателя"
          />
          <button
            type="submit"
            className="ui-button ui-button--primary"
            disabled={!learnerId.trim()}
          >
            Зачислить слушателя
          </button>
        </form>
        <ul>
          {enrollments?.items.map((item) => (
            <li key={item.id} className="ui-inline" style={{ gap: 8, flexWrap: 'wrap' }}>
              <span>{item.learnerId}</span>
              <StatusChip status={item.status} />
              {/* Phase 4 Plan B: per-student proctoring override (PATCH needs learners.write). */}
              {session && hasPermission(session.permissions, 'learners.write') ? (
                <label className="ui-inline" style={{ gap: 4 }}>
                  <span>Прокторинг:</span>
                  <select
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
        <ProgressBar value={averageProgress} />
        <MutationError message={saveError} />
      </SectionCard>
      {/* ФТ-B3.4: доказательная база на проверке ГИТ/Минтруда. */}
      <LearningJournalSection groupId={id} />
      <IssueOrderModal
        open={issueOrderOpen}
        groupId={id}
        enrollmentIds={completedEnrollmentIds}
        onClose={() => setIssueOrderOpen(false)}
      />
    </PageContainer>
  );
};
