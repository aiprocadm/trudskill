'use client';

import {
  BlockedHint,
  DataTable,
  DetailDrawer,
  DetailLayout,
  Dialog,
  KeyValueList,
  ProgressBar,
  StatusChip,
  blockedProps,
  statusAccessibleLabel,
  useConfirmDialog
} from '@trudskill/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import {
  GROUP_STATUS_LABEL,
  STUDY_FORM_LABEL,
  allowedGroupTransitions,
  formatDateRu,
  formatPeriod,
  groupStatusLabel,
  isGroupArchivable
} from './group-status';
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
import {
  ENROLLMENT_RESULT_LABEL,
  ENROLLMENT_STATUS_LABEL,
  MutationError,
  formatDate,
  readApiMessage
} from '../mvp/screen-helpers';
import { useObjectCrumb } from '../navigation/use-object-crumb';
import { proctoringApi } from '../proctoring/api';

import type { Enrollment } from '../mvp/types';

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
/** Строка состава группы — зачисление как есть; подписи и ссылки строит таблица. */
type RosterRow = Enrollment;

export const GroupDetailsScreen = ({ id }: { id: string }) => {
  const { session } = useAuth();
  const router = useRouter();
  const { data: group, error: groupLoadError, notFound, refetch: refetchGroup } = useGroup(id);
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
  const {
    createGroupCourse,
    createEnrollment,
    setGroupStatus,
    archiveGroup,
    updateEnrollmentStatus,
    markEnrollmentResult
  } = useDomainMutations();
  /* МГ-B7.1 (срез 8.7b): состав группы — действия строки под правом ручек статуса и итога. */
  const canChangeStatus = hasPermission(session?.permissions ?? [], 'enrollments.change_status');
  const [busy, setBusy] = useState(false);
  const { ask: askExpel, dialog: expelDialog } = useConfirmDialog();
  /*
   * Единственное место обработки отказа для действий состава: отказ сервера виден человеку
   * (`MutationError` под таблицей), кнопки на время запроса заняты. Действия ниже зовут
   * мутации только через эту обёртку.
   */
  const runRosterAction = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setSaveError(null);
    try {
      await action();
      await refetchEnrollments();
    } catch (actionError) {
      setSaveError(readApiMessage(actionError));
    } finally {
      setBusy(false);
    }
  };
  const roster = {
    setStatus: (
      enrollmentId: string,
      status: 'active' | 'suspended' | 'cancelled',
      reason?: string
    ) => runRosterAction(() => updateEnrollmentStatus(enrollmentId, status, reason)),
    setAbsent: (enrollmentId: string, absent: boolean) =>
      runRosterAction(() =>
        markEnrollmentResult(enrollmentId, { resultCode: absent ? 'absent' : null })
      )
  };
  const confirmExpel = (enrollment: { id: string; learnerId: string }) => {
    const name = learnerNameCell(learnerNames, enrollment.learnerId);
    askExpel(
      {
        title: `Отчислить из группы: ${name}`,
        message: `${name} не сможет войти в курсы группы «${group?.name ?? ''}», зачисление станет «Отменён» — вернуть человека можно только новым зачислением.`,
        confirmLabel: 'Отчислить из группы',
        tone: 'danger',
        input: { label: 'Причина отчисления', placeholder: 'Например: уволен', required: true }
      },
      (reason) => void roster.setStatus(enrollment.id, 'cancelled', reason)
    );
  };
  const rosterActions = (row: RosterRow) => {
    if (!canChangeStatus || row.status === 'completed' || row.status === 'cancelled') return [];
    const absent = row.resultCode === 'absent';
    return [
      ...(row.status === 'active'
        ? [
            {
              label: 'Приостановить обучение',
              disabled: busy,
              onSelect: () => void roster.setStatus(row.id, 'suspended')
            }
          ]
        : []),
      ...(row.status === 'suspended'
        ? [
            {
              label: 'Возобновить обучение',
              disabled: busy,
              onSelect: () => void roster.setStatus(row.id, 'active')
            }
          ]
        : []),
      {
        label: absent ? 'Снять неявку' : 'Отметить неявку',
        disabled: busy,
        onSelect: () => void roster.setAbsent(row.id, !absent)
      },
      {
        label: 'Отчислить из группы',
        danger: true,
        disabled: busy,
        onSelect: () => confirmExpel(row)
      }
    ];
  };
  const [selectedCourseId, setSelectedCourseId] = useState('');
  /* МГ-B3.1 / B6.2 (срез 8.3): ручной перевод статуса и архив — в «…», под правом `groups.write`. */
  const [statusOpen, setStatusOpen] = useState(false);
  const [nextStatus, setNextStatus] = useState('');
  const [statusReason, setStatusReason] = useState('');
  const [statusBusy, setStatusBusy] = useState(false);
  const { ask: askArchive, dialog: archiveDialog } = useConfirmDialog();
  const statusBlockedReason = nextStatus ? undefined : 'Выберите новый статус.';
  const runStatusChange = async () => {
    if (!nextStatus) return;
    setStatusBusy(true);
    setSaveError(null);
    try {
      await setGroupStatus(id, {
        status: nextStatus,
        ...(statusReason.trim() ? { reason: statusReason.trim() } : {})
      });
      setStatusOpen(false);
      setNextStatus('');
      setStatusReason('');
      await refetchGroup();
    } catch (statusError) {
      setSaveError(readApiMessage(statusError));
    } finally {
      setStatusBusy(false);
    }
  };
  const confirmArchive = () =>
    askArchive(
      {
        title: `В архив: ${group?.name ?? 'группа'}`,
        message:
          'Группа скроется из реестра, документы и история останутся. Вернуть из архива сможет администратор.',
        confirmLabel: 'В архив'
      },
      () =>
        void archiveGroup(id)
          .then(() => refetchGroup())
          .catch((archiveError) => setSaveError(readApiMessage(archiveError)))
    );

  /* ТЗ 5.8 (Э8): «Назначить курс» без выбранного курса молчала — теперь говорит. */
  const assignCourseBlockedReason = selectedCourseId ? undefined : 'Выберите курс из списка слева.';
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
            : []),
          ...(canAssignCourse
            ? [
                {
                  label: 'Перевести статус',
                  onSelect: () => {
                    setNextStatus('');
                    setStatusOpen(true);
                  }
                }
              ]
            : []),
          ...(canAssignCourse && isGroupArchivable(group?.status)
            ? [{ label: 'В архив', onSelect: confirmArchive }]
            : []),
          /* МГ-B6.1: копия — мастер с предзаполнением (те же компания, курсы, слушатели; даты сдвинуты, код новый). */
          ...(canAssignCourse
            ? [
                {
                  label: 'Копировать группу',
                  onSelect: () => router.push(`/groups/new?copyOf=${encodeURIComponent(id)}`)
                }
              ]
            : [])
        ]}
      />
      {archiveDialog}
      <Dialog title="Перевести статус" open={statusOpen} onClose={() => setStatusOpen(false)}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void runStatusChange();
          }}
          className="ui-stack"
        >
          <label htmlFor="group-next-status" className="ui-field">
            <span className="ui-field-label">Новый статус</span>
            <select
              id="group-next-status"
              className="ui-select"
              value={nextStatus}
              onChange={(event) => setNextStatus(event.target.value)}
            >
              <option value="">Выберите статус</option>
              {allowedGroupTransitions(group?.status).map((value) => (
                <option key={value} value={value}>
                  {GROUP_STATUS_LABEL[value]}
                </option>
              ))}
            </select>
            <p className="ui-field-hint">
              Сейчас: {groupStatusLabel(group?.status, statusAccessibleLabel)}. Переход возможен
              только на соседний статус; отменить можно любую незакрытую группу.
            </p>
          </label>
          <label htmlFor="group-status-reason" className="ui-field">
            <span className="ui-field-label">Причина (необязательно)</span>
            <input
              id="group-status-reason"
              value={statusReason}
              onChange={(event) => setStatusReason(event.target.value)}
            />
          </label>
          <div className="ui-inline">
            <button
              type="button"
              className="ui-button-secondary"
              onClick={() => setStatusOpen(false)}
            >
              Отмена
            </button>
            <button
              type="submit"
              className="ui-button--primary"
              disabled={statusBusy}
              {...blockedProps('group-status', statusBlockedReason)}
            >
              Перевести статус
            </button>
          </div>
          <BlockedHint hintKey="group-status" reason={statusBlockedReason} />
        </form>
      </Dialog>

      <DetailLayout
        aside={
          <SectionCard title="Сводка">
            <KeyValueList
              items={[
                { label: 'Код', value: group?.code ?? '—' },
                {
                  label: 'Статус',
                  value: (
                    <StatusChip
                      status={group?.status ?? 'draft'}
                      label={groupStatusLabel(group?.status, statusAccessibleLabel)}
                    />
                  )
                },
                { label: 'Период обучения', value: formatPeriod(group?.startDate, group?.endDate) },
                { label: 'Экзамен', value: formatDateRu(group?.examDate) },
                {
                  label: 'Форма обучения',
                  value: group?.studyForm
                    ? (STUDY_FORM_LABEL[group.studyForm] ?? group.studyForm)
                    : '—'
                },
                {
                  label: 'Дистанционные технологии',
                  value: group?.isDot === undefined ? '—' : group.isDot ? 'Да' : 'Нет'
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
            <>
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
                {/* ТЗ 5.8 (Э8): кнопка не просто выключается, а называет недостающее (журнал 465). */}
                <button
                  type="submit"
                  className="ui-button-secondary"
                  {...blockedProps('assign-course', assignCourseBlockedReason)}
                >
                  Назначить курс
                </button>
              </form>
              <BlockedHint hintKey="assign-course" reason={assignCourseBlockedReason} />
            </>
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
            МГ-B7.1 (срез 8.7b): список стал таблицей состава — статус и итог словом, действия
            строки в «…» (отчислить с причиной, пауза, неявка) под правом enrollments.change_status.
          */}
          <DataTable<RosterRow>
            columns={[
              {
                key: 'learnerId',
                title: 'Слушатель',
                render: (row) => (
                  <Link className="ui-link" href={`/learners/${row.learnerId}`}>
                    {learnerNameCell(learnerNames, row.learnerId)}
                  </Link>
                )
              },
              {
                key: 'status',
                title: 'Статус',
                /* TXT-006: статус словом, а не кодом `active`/`completed`. */
                render: (row) => (
                  <StatusChip
                    status={row.status}
                    label={ENROLLMENT_STATUS_LABEL[row.status] ?? row.status}
                  />
                )
              },
              {
                key: 'resultCode',
                title: 'Итог',
                render: (row) =>
                  row.resultCode ? (ENROLLMENT_RESULT_LABEL[row.resultCode] ?? row.resultCode) : '—'
              },
              { key: 'enrolledAt', title: 'Зачислен', render: (row) => formatDate(row.enrolledAt) },
              ...(session && hasPermission(session.permissions, 'learners.write')
                ? [
                    {
                      key: 'proctoringOverride' as const,
                      title: 'Прокторинг',
                      /* Phase 4 Plan B: per-student proctoring override (PATCH needs learners.write). */
                      render: (row: RosterRow) => (
                        <select
                          className="ui-select"
                          value={row.proctoringOverride ?? ''}
                          aria-label={`Прокторинг для слушателя ${learnerNameCell(learnerNames, row.learnerId)}`}
                          onChange={(event) => {
                            const value = event.target.value;
                            void proctoringApi
                              .setOverride(session, row.id, {
                                override: value === 'require' || value === 'exempt' ? value : null
                              })
                              .then(() => refetchEnrollments())
                              .catch((overrideError) =>
                                setSaveError(readApiMessage(overrideError))
                              );
                          }}
                        >
                          <option value="">наследуется</option>
                          <option value="require">требуется</option>
                          <option value="exempt">освобождён</option>
                        </select>
                      )
                    }
                  ]
                : [])
            ]}
            rows={enrollments?.items ?? []}
            rowKey={(row) => row.id}
            rowActions={rosterActions}
            emptyMessage="В группе пока никого"
            emptyHint="Зачислите слушателя кнопкой «Зачислить слушателя» вверху карточки или списком из файла."
          />
          {expelDialog}
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
