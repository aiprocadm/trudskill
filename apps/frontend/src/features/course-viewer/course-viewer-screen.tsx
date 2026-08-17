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
import { TableOfContents } from './table-of-contents';
import { useWatchTracker } from './use-watch-tracker';
import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../components/state-wrappers';
import { useAuth } from '../auth/context';
import { LearnerDocumentsList } from '../learner-documents/documents-list';
import { useMyDocuments } from '../learner-documents/hooks';
import { mvpApi } from '../mvp/api';
import { useCourse, useLearnerCourseProgress } from '../mvp/hooks';

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
  const { data: course, loading: courseLoading, error: courseError } = useCourse(courseId);
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

  useWatchTracker({
    materialId:
      enrollmentId && currentMaterial?.materialType !== 'scorm' ? currentMaterialId : null,
    minViewSeconds: currentMaterial?.minViewSeconds ?? 30,
    onFlush: handleFlush,
    onTick: setStudiedSeconds
  });

  const loading = courseLoading || treeLoading || progressLoading;
  const error = courseError ?? treeError ?? progressError ?? enrollmentError;
  // Пока название не загрузилось, в заголовке «Курс» — сырой идентификатор человеку не нужен.
  const title = course?.title ?? 'Курс';

  // Phase 1 §4.3 — end-of-learning: документы по этому курсу для текущего
  // слушателя. `useMyDocuments` сам ограничивает выдачу записями, привязанными
  // к learner.linkedIamUserId — то есть фронт получает только свои документы.
  const { data: myDocuments } = useMyDocuments();
  const courseDocuments = myDocuments?.items.filter((doc) => doc.courseId === courseId) ?? [];

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
              <MaterialPlayer
                material={currentMaterial}
                {...(enrollmentId ? { enrollmentId } : {})}
              />
            ) : (
              <SectionEmpty
                message="Выберите материал слева, чтобы начать просмотр."
                hint="Заблокированные материалы откроются после завершения предыдущих."
              />
            )}
          </section>
        </div>
      ) : null}
      {courseDocuments.length > 0 ? (
        <LearnerDocumentsList
          title="Документы по этому курсу"
          showCourse={false}
          documents={courseDocuments}
        />
      ) : null}
    </PageContainer>
  );
};
