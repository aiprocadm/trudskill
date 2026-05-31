'use client';

import type { CourseTree, LockState, ProgressByMaterial } from './types';
import type { Progress } from '../mvp/types';

type ProgressStatus = Progress['status'];

const statusIcon = (status: ProgressStatus | undefined, isLocked: boolean): string => {
  if (isLocked) return '🔒';
  if (status === 'completed') return '✓';
  if (status === 'in_progress') return '⏳';
  return '☐';
};

const moduleProgress = (materialsCount: number, completedCount: number): string =>
  `${completedCount}/${materialsCount}`;

interface Props {
  tree: CourseTree;
  progressByMaterial: ProgressByMaterial;
  lockState: LockState;
  moduleLocks: LockState;
  currentMaterialId: string | null;
  onSelect: (materialId: string) => void;
}

export const TableOfContents = ({
  tree,
  progressByMaterial,
  lockState,
  moduleLocks,
  currentMaterialId,
  onSelect
}: Props) => {
  if (tree.length === 0) {
    return (
      <nav className="course-toc" data-testid="course-toc-empty">
        <p className="ui-text-muted">В курсе пока нет модулей.</p>
      </nav>
    );
  }

  return (
    <nav className="course-toc" data-testid="course-toc" aria-label="Содержание курса">
      {tree.map((node) => {
        const completed = node.materials.filter(
          (m) => progressByMaterial.get(m.id)?.status === 'completed'
        ).length;
        const moduleLocked = moduleLocks.get(node.module.id) === 'locked';
        return (
          <details
            key={node.module.id}
            open={!moduleLocked}
            className={`course-toc__module${moduleLocked ? ' course-toc__module--locked' : ''}`}
            data-testid={`course-toc-module-${node.module.id}`}
          >
            <summary className="course-toc__module-summary">
              <span className="course-toc__module-title">
                {moduleLocked ? '🔒 ' : ''}
                {node.module.title}
              </span>
              <span className="course-toc__module-counter ui-text-muted">
                {moduleProgress(node.materials.length, completed)}
              </span>
            </summary>
            <ul className="course-toc__materials">
              {node.materials.map((material) => {
                const lock = moduleLocked ? 'locked' : (lockState.get(material.id) ?? 'locked');
                const isLocked = lock === 'locked';
                const status = progressByMaterial.get(material.id)?.status;
                const isCurrent = material.id === currentMaterialId;
                const classes = [
                  'course-toc__material',
                  isLocked ? 'course-toc__material--locked' : '',
                  isCurrent ? 'course-toc__material--current' : ''
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <li key={material.id}>
                    <button
                      type="button"
                      className={classes}
                      disabled={isLocked}
                      aria-current={isCurrent ? 'true' : undefined}
                      data-testid={`course-toc-material-${material.id}`}
                      onClick={() => {
                        if (!isLocked) onSelect(material.id);
                      }}
                    >
                      <span aria-hidden className="course-toc__material-icon">
                        {statusIcon(status, isLocked)}
                      </span>
                      <span className="course-toc__material-title">{material.title}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </details>
        );
      })}
    </nav>
  );
};
