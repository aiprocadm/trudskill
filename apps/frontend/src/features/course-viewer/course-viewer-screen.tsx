'use client';

import { useEffect, useMemo, useState } from 'react';

import { buildProgressMap, useCourseTree } from './hooks';
import { computeUnlockedMaterials } from './lock-logic';
import { MaterialPlayer } from './material-player';
import { TableOfContents } from './table-of-contents';
import { useWatchTracker } from './use-watch-tracker';
import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../components/state-wrappers';
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

  const progressByMaterial = useMemo(() => buildProgressMap(progress?.items ?? null), [progress]);
  const lockState = useMemo(
    () => computeUnlockedMaterials(tree ?? [], progressByMaterial),
    [tree, progressByMaterial]
  );

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

  useWatchTracker({
    materialId: currentMaterialId,
    minViewSeconds: currentMaterial?.minViewSeconds ?? 30
  });

  const loading = courseLoading || treeLoading || progressLoading;
  const error = courseError ?? treeError ?? progressError;
  const title = course?.title ?? `Курс ${courseId}`;

  return (
    <PageContainer>
      <PageHeader
        title={title}
        subtitle={`Прогресс: ${completedCount}/${totalCount} (${completionPercent}%)`}
      />
      {error ? <SectionError message={error} /> : null}
      {loading ? (
        <SectionCard title="Загрузка…">
          <p className="ui-text-muted">Готовим материалы…</p>
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
            currentMaterialId={currentMaterialId}
            onSelect={setCurrentMaterialId}
          />
          <section className="course-player" data-testid="course-player">
            {currentMaterial ? (
              <MaterialPlayer material={currentMaterial} />
            ) : (
              <SectionEmpty
                message="Выберите материал слева, чтобы начать просмотр."
                hint="Заблокированные материалы откроются после завершения предыдущих."
              />
            )}
          </section>
        </div>
      ) : null}
    </PageContainer>
  );
};
