'use client';

import { useQuery } from '@tanstack/react-query';
import { ProgressBar } from '@trudskill/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  buildProgressMap,
  useCourseTree,
  useModuleGateState,
  useUpsertMaterialProgress
} from './hooks';
import { computeUnlockedMaterials } from './lock-logic';
import { MaterialPlayer } from './material-player';
import { computeModuleLocks } from './module-gate';
import { nextUnlockedMaterialId, studyButtonState } from './study-flow';
import { TableOfContents } from './table-of-contents';
import { useWatchTracker } from './use-watch-tracker';
import {
  PageContainer,
  PageHeader,
  RecordNotFound,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../components/state-wrappers';
import { useAuth } from '../auth/context';
import { LearnerDocumentsList } from '../learner-documents/documents-list';
import { useDocumentDownload, useMyDocuments } from '../learner-documents/hooks';
import { mvpApi } from '../mvp/api';
import { useCourse, useLearnerCourseProgress } from '../mvp/hooks';
import { useObjectCrumb } from '../navigation/use-object-crumb';

import type { Material } from '../mvp/types';

const findFirstUnlockedNotStarted = (
  tree: ReturnType<typeof useCourseTree>['tree'],
  lockState: ReturnType<typeof computeUnlockedMaterials>,
  progress: ReturnType<typeof buildProgressMap>
): string | null => {
  if (!tree) return null;
  for (const node of tree) {
    for (const material of node.materials) {
      if (lockState.get(material.id) !== 'unlocked') continue;
      if (progress.get(material.id)?.status === 'completed') continue;
      return material.id;
    }
  }
  return null;
};

/**
 * Зачисление текущего слушателя на этот курс.
 *
 * Плеер раньше искал его в общем списке `/enrollments?learner_id=<id пользователя IAM>`.
 * В зачислении лежит идентификатор КАРТОЧКИ слушателя, поэтому список приходил пустым,
 * `enrollmentId` навсегда оставался null — а без него отчёт о просмотре не отправляется,
 * то есть прогресс не сохранялся вообще. `/me/enrollments` резолвит карточку на сервере
 * и отдаёт курс группы, по нему и выбираем нужную строку.
 */
const useMyEnrollmentForCourse = (courseId: string) => {
  const { session } = useAuth();
  const query = useQuery({
    queryKey: ['mvp', 'myEnrollments', session?.user.id ?? ''],
    enabled: Boolean(session),
    queryFn: () => mvpApi.listMyEnrollments(session!)
  });
  const forCourse = (query.data?.items ?? []).filter((item) => item.courseId === courseId);
  const enrollment = forCourse.find((item) => item.status === 'active') ?? forCourse[0] ?? null;
  return {
    enrollmentId: enrollment?.id ?? null,
    error: query.error instanceof Error ? query.error.message : null
  };
};

interface Props {
  courseId: string;
}

export const CourseViewerScreen = ({ courseId }: Props) => {
  const {
    data: course,
    loading: courseLoading,
    error: courseError,
    notFound
  } = useCourse(courseId);
  useObjectCrumb(course?.title, { notFound, failed: Boolean(courseError) });
  const { tree, loading: treeLoading, error: treeError } = useCourseTree(courseId);
  const {
    data: progress,
    loading: progressLoading,
    error: progressError
  } = useLearnerCourseProgress(courseId);
  const { enrollmentId, error: enrollmentError } = useMyEnrollmentForCourse(courseId);
  const upsertProgress = useUpsertMaterialProgress(courseId);

  const progressByMaterial = useMemo(() => buildProgressMap(progress?.items ?? null), [progress]);
  const lockState = useMemo(
    () => computeUnlockedMaterials(tree ?? [], progressByMaterial),
    [tree, progressByMaterial]
  );

  const { gate: moduleGate } = useModuleGateState(courseId, enrollmentId);
  const moduleLocks = useMemo(() => computeModuleLocks(tree ?? [], moduleGate), [tree, moduleGate]);

  const initialMaterialId = useMemo(
    () => findFirstUnlockedNotStarted(tree, lockState, progressByMaterial),
    [tree, lockState, progressByMaterial]
  );
  const [currentMaterialId, setCurrentMaterialId] = useState<string | null>(null);

  useEffect(() => {
    if (currentMaterialId === null && initialMaterialId !== null) {
      setCurrentMaterialId(initialMaterialId);
    }
  }, [currentMaterialId, initialMaterialId]);

  const currentMaterial: Material | null = useMemo(() => {
    if (!tree || !currentMaterialId) return null;
    for (const node of tree) {
      const match = node.materials.find((m) => m.id === currentMaterialId);
      if (match) return match;
    }
    return null;
  }, [tree, currentMaterialId]);

  const [studiedSeconds, setStudiedSeconds] = useState(0);
  useEffect(() => {
    setStudiedSeconds(0);
  }, [currentMaterialId]);
  const remainingSeconds = Math.max(0, (currentMaterial?.minViewSeconds ?? 0) - studiedSeconds);

  const totalCount = useMemo(
    () => (tree ?? []).reduce((acc, node) => acc + node.materials.length, 0),
    [tree]
  );
  const completedCount = useMemo(() => {
    let n = 0;
    for (const p of progressByMaterial.values()) if (p.status === 'completed') n += 1;
    return n;
  }, [progressByMaterial]);
  const completionPercent = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

  const handleFlush = useCallback(
    (studiedSeconds: number) => {
      if (!currentMaterialId || !enrollmentId) return;
      void upsertProgress({ materialId: currentMaterialId, enrollmentId, studiedSeconds });
    },
    [currentMaterialId, enrollmentId, upsertProgress]
  );

  /*
   * ТЗ 2.5.b: «Материал изучен → Далее».
   *
   * Отправляем набранное время не меньше требуемого: сервер считает материал пройденным именно
   * по нему (`studiedSeconds >= minViewSeconds`). Обойти требование кнопка не может и не должна
   * — она включается только когда время уже отсижено, см. `studyButtonState`.
   */
  const [studyBusy, setStudyBusy] = useState(false);
  const [studyError, setStudyError] = useState<string | null>(null);
  const markStudied = useCallback(async () => {
    if (!currentMaterial || !currentMaterialId || !enrollmentId) return;
    setStudyBusy(true);
    setStudyError(null);
    try {
      await upsertProgress({
        materialId: currentMaterialId,
        enrollmentId,
        studiedSeconds: Math.max(currentMaterial.minViewSeconds, studiedSeconds)
      });
      const next = nextUnlockedMaterialId(tree ?? [], lockState, currentMaterialId);
      /*
       * Следующего открытого нет — остаёмся на месте. Уводить человека в пустоту хуже, чем
       * оставить его там, где он только что закончил: отметка уже сохранена и видна в оглавлении.
       */
      if (next) setCurrentMaterialId(next);
    } catch (error) {
      setStudyError(error instanceof Error ? error.message : 'Не удалось сохранить отметку');
    } finally {
      setStudyBusy(false);
    }
  }, [
    currentMaterial,
    currentMaterialId,
    enrollmentId,
    lockState,
    studiedSeconds,
    tree,
    upsertProgress
  ]);

  useWatchTracker({
    materialId:
      enrollmentId && currentMaterial?.materialType !== 'scorm' ? currentMaterialId : null,
    minViewSeconds: currentMaterial?.minViewSeconds ?? 30,
    onFlush: handleFlush,
    onTick: setStudiedSeconds
  });

  const study = studyButtonState({
    material: currentMaterial,
    remainingSeconds,
    enrollmentId,
    alreadyCompleted: progressByMaterial.get(currentMaterialId ?? '')?.status === 'completed'
  });
  /* Подпись кнопки честная: «далее» обещается только когда дальше действительно есть куда. */
  const hasNextMaterial = nextUnlockedMaterialId(tree ?? [], lockState, currentMaterialId) !== null;

  const loading = courseLoading || treeLoading || progressLoading;
  const error = courseError ?? treeError ?? progressError ?? enrollmentError;
  // Пока название не загрузилось, в заголовке «Курс» — сырой идентификатор человеку не нужен.
  const title = course?.title ?? 'Курс';

  // Phase 1 §4.3 — end-of-learning: документы по этому курсу для текущего
  // слушателя. `useMyDocuments` сам ограничивает выдачу записями, привязанными
  // к learner.linkedIamUserId — то есть фронт получает только свои документы.
  const { data: myDocuments } = useMyDocuments();
  const documentDownload = useDocumentDownload();
  const courseDocuments = myDocuments?.items.filter((doc) => doc.courseId === courseId) ?? [];

  /*
   * Курса нет — слушателю тем более нужен честный ответ: он попал сюда по ссылке из письма
   * или закладки. Прежде открывался пустой курс с полосой прогресса «0 из 0».
   */
  if (notFound) {
    return <RecordNotFound what="Курс" backHref="/learner/courses" backLabel="К моему обучению" />;
  }

  return (
    <PageContainer>
      <PageHeader title={title} subtitle="Учебные материалы курса и ваш прогресс" />
      {error ? <SectionError message={error} /> : null}
      {!loading && totalCount > 0 ? (
        <div className="course-progress">
          <ProgressBar
            value={completionPercent}
            label="Общий прогресс по курсу"
            caption={`Пройдено ${completedCount} из ${totalCount} материалов — ${completionPercent}%`}
          />
        </div>
      ) : null}
      {loading ? (
        <SectionCard title="Загрузка курса">
          <div className="ui-skeleton-block" aria-hidden>
            <div className="ui-skeleton-line" style={{ width: '40%', height: 18 }} />
            <div className="ui-skeleton-line" style={{ width: '90%' }} />
            <div className="ui-skeleton-line" style={{ width: '72%' }} />
          </div>
        </SectionCard>
      ) : null}
      {!loading && tree && tree.length === 0 ? (
        <SectionCard title="Курс пока пуст">
          <SectionEmpty
            message="У курса нет опубликованной версии с материалами."
            hint="Обратитесь к куратору учебного центра."
          />
        </SectionCard>
      ) : null}
      {!loading && tree && tree.length > 0 ? (
        <div className="course-viewer-layout">
          <TableOfContents
            tree={tree}
            progressByMaterial={progressByMaterial}
            lockState={lockState}
            moduleLocks={moduleLocks}
            currentMaterialId={currentMaterialId}
            onSelect={setCurrentMaterialId}
          />
          <section className="course-player" data-testid="course-player">
            {currentMaterial && remainingSeconds > 0 ? (
              <p className="ui-callout ui-callout--info" data-testid="course-min-view-countdown">
                До открытия экзамена модуля осталось изучать: {remainingSeconds} с
              </p>
            ) : null}
            {currentMaterial ? (
              <>
                <MaterialPlayer
                  material={currentMaterial}
                  {...(enrollmentId ? { enrollmentId } : {})}
                />
                {/*
                  ТЗ 2.5.b: у каждого материала есть явное «изучено».
                  Кнопка не гаснет молча: рядом всегда написано, почему она недоступна.
                */}
                <div className="ui-stack" data-testid="course-material-done">
                  {studyError ? <SectionError message={studyError} /> : null}
                  {study.reason ? (
                    <p className="ui-text-muted" data-testid="course-material-done-reason">
                      {study.reason}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    className="ui-button ui-button--primary"
                    disabled={!study.enabled || studyBusy}
                    onClick={() => void markStudied()}
                  >
                    {hasNextMaterial ? 'Материал изучен — далее' : 'Материал изучен'}
                  </button>
                </div>
              </>
            ) : (
              <SectionEmpty
                message="Выберите материал слева, чтобы начать просмотр."
                hint="Заблокированные материалы откроются после завершения предыдущих."
              />
            )}
          </section>
        </div>
      ) : null}
      {documentDownload.error ? <SectionError error={documentDownload.error} /> : null}
      {courseDocuments.length > 0 ? (
        <LearnerDocumentsList
          title="Документы по этому курсу"
          showCourse={false}
          documents={courseDocuments}
          onDownload={(doc) => void documentDownload.download(doc.id)}
          downloadBusyId={documentDownload.busyId}
        />
      ) : null}
    </PageContainer>
  );
};
