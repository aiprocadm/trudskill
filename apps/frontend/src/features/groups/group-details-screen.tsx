'use client';

import { DetailDrawer, DetailLayout, KeyValueList, ProgressBar, StatusChip } from '@trudskill/ui';
import { useMemo, useState } from 'react';

import {
  PageContainer,
  PageHeader,
  RecordNotFound,
  SectionCard
} from '../../components/state-wrappers';
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
import { useObjectCrumb } from '../navigation/use-object-crumb';
import { proctoringApi } from '../proctoring/api';

/*
 * TPL-002 (Фаза 4 срез 3). Что изменилось против перенесённой версии:
 *
 * 1. Раскладка `DetailLayout`: слева работа с группой, справа сводка — на 1024px
 *    боковая колонка уходит вниз, отдельной вёрстки для этого не нужно.
 * 2. Закрытие группы переехало сюда с отдельного экрана, где идентификатор группы
 *    приходилось вписывать руками из адресной строки: `JOB-A3` («закрыть группу и выдать
 *    документы») — два клика от оперативной панели, механика переиспользуется, а не дублируется.
 *
 * **ТЗ 5.4 (Э4) переставило акценты.** До него первичным действием карточки было «Закрыть
 * группу» — и ТЗ называет ровно этот экран своим примером нарушения: «самая яркая кнопка —
 * „Закрыть группу“ (оранжевая, справа вверху)». Правило: главная кнопка экрана — всегда
 * конструктивное действие, необратимое — вторичная кнопка или пункт «Ещё». Поэтому первичное
 * действие теперь «Зачислить слушателя» (повседневная работа с группой), а закрытие стоит
 * вторичным, красным, под тем же подтверждением с вводом названия группы (Э3).
 */
export const GroupDetailsScreen = ({ id }: { id: string }) => {
  const { session } = useAuth();
  const { data: group, error: groupLoadError, notFound } = useGroup(id);
  useObjectCrumb(group?.name, { notFound, failed: Boolean(groupLoadError) });
  const canGenerateDocuments = hasPermission(session?.permissions ?? [], 'documents.generate');
  const canWriteDocuments = hasPermission(session?.permissions ?? [], 'documents.write');
  /*
   * Э2: недоступное действие не показывается вхолостую. Обе формы карточки стояли открытыми
   * любому, кто может ЧИТАТЬ группу, — человек заполнял и получал отказ сервера. Права взяты
   * те же, что требуют ручки (`POST /enrollments`, `POST /group-courses`), и сверены по живой
   * `iam.role_permissions`: оба есть у руководителя, администратора центра и платформы.
   */
  const canEnroll = hasPermission(session?.permissions ?? [], 'enrollments.write');
  const canAssignCourse = hasPermission(session?.permissions ?? [], 'groups.write');
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
  /* Э4: первичное действие обязано куда-то вести — форма зачисления открывается панелью. */
  const [enrollOpen, setEnrollOpen] = useState(false);

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

  /*
   * Записи нет — показываем это прямо. Иначе открывалась ПРИЗРАЧНАЯ карточка: заголовок
   * «Группа», пустые разделы и рабочие кнопки действий, которые ничего не делают.
   */
  if (notFound) {
    return <RecordNotFound what="Группа" backHref="/groups" backLabel="К списку групп" />;
  }

  return (
    <PageContainer>
      <PageHeader
        title={group?.name ?? 'Карточка группы'}
        // exactOptionalPropertyTypes: undefined как значение не принимается — условный спред.
        {...(group?.code ? { subtitle: `Код группы: ${group.code}` } : {})}
        /*
         * UI-007: одно первичное действие. Э4: оно конструктивное — зачисление слушателя.
         * Выпуск документов и закрытие группы требуют своих прав (`documents.*`), поэтому
         * стоят вторичными и появляются только у того, кто вправе их выполнить.
         */
        {...(canEnroll
          ? { primaryAction: { label: 'Зачислить слушателя', onSelect: () => setEnrollOpen(true) } }
          : {})}
        secondaryActions={[
          ...(canWriteDocuments
            ? [{ label: 'Сгенерировать приказ', onSelect: () => setIssueOrderOpen(true) }]
            : []),
          ...(canGenerateDocuments
            ? [{ label: 'Закрыть группу', danger: true, onSelect: () => setCloseOpen(true) }]
            : [])
        ]}
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
          {/* Э2: без права `groups.write` форма не показывается — ручка всё равно откажет. */}
          {canAssignCourse ? (
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
          ) : null}
          <ul className="ui-stack" style={{ gap: 0, listStyle: 'none', padding: 0, margin: 0 }}>
            {groupCourses?.items.map((item) => (
              <li key={item.id} className="ui-list-row">
                {courseTitleById[item.courseId] ?? item.courseId}
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="Слушатели группы">
          {/*
            Э4: форма зачисления переехала в панель — её открывает первичное действие шапки.
            Держать одну и ту же форму в двух местах нельзя: у действия одно место (Э1).
          */}
          <ul className="ui-stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {enrollments?.items.map((item) => (
              <li key={item.id} className="ui-inline" style={{ gap: 8, flexWrap: 'wrap' }}>
                {/* Список зачисленных состоял из идентификаторов вместо фамилий. */}
                <span>{learnerNameCell(learnerNames, item.learnerId)}</span>
                {/* TXT-006: статус словом, а не кодом `active`/`completed`. */}
                <StatusChip
                  status={item.status}
                  label={ENROLLMENT_STATUS_LABEL[item.status] ?? item.status}
                />
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

      {/* Э4: первичное действие карточки — зачисление; форма открывается панелью рядом. */}
      <DetailDrawer
        open={enrollOpen}
        onClose={() => setEnrollOpen(false)}
        title="Зачислить слушателя"
        subtitle={group?.name ?? ''}
        width="sm"
        /* CMP-010: слушатель выбран, но не зачислен — закрытие панели переспросит. */
        hasUnsavedChanges={learnerId.trim().length > 0}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!learnerId.trim()) return;
            void createEnrollment({ groupId: id, learnerId: learnerId.trim() })
              .then(() => {
                setLearnerId('');
                setEnrollOpen(false);
                return refetchEnrollments();
              })
              .catch((enrollmentError) => setSaveError(readApiMessage(enrollmentError)));
          }}
          className="ui-stack"
        >
          {/* Фаза 6 срез 6 (id-input-ban): выбор по фамилии вместо «вставьте идентификатор». */}
          <LearnerSelect value={learnerId} onChange={setLearnerId} />
          <p className="ui-field-hint">
            Слушатель попадёт в состав группы и получит доступ к её курсам.
          </p>
          <button
            type="submit"
            className="ui-button ui-button--primary"
            disabled={!learnerId.trim()}
          >
            Зачислить слушателя
          </button>
        </form>
      </DetailDrawer>

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
