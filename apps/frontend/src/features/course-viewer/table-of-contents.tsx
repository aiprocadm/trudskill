'use client';

import { Icon } from '@trudskill/ui';

import { blockingMaterialTitle, lockCaption } from './study-flow';
import { CheckCircleIcon, CircleIcon, ClockIcon, LockIcon } from '../navigation/nav-icons';

import type { CourseTree, LockState, ProgressByMaterial } from './types';
import type { Progress } from '../mvp/types';
import type { LucideIcon } from '@trudskill/ui';

type ProgressStatus = Progress['status'];

/**
 * Значок состояния урока (`UI-024`).
 *
 * Раньше здесь стояли символы «🔒 ✓ ⏳ ☐» под `aria-hidden` — читалка их не произносила,
 * и слушатель со скринридером слышал только название урока, не зная, пройден он, идёт или
 * закрыт. Теперь состояние — иконка с подписью: `Icon` с `label` отдаёт `role="img"` и
 * `aria-label`, то есть смысл доходит и глазами, и голосом.
 */
const statusIcon = (
  status: ProgressStatus | undefined,
  isLocked: boolean,
  lockReason: string
): { icon: LucideIcon; label: string } => {
  /*
   * ТЗ 2.5.b: у замка подпись называет ВИНОВНИКА. Было общее «сначала пройдите предыдущие
   * уроки» — в модуле из семи материалов это не подсказка, а загадка.
   */
  if (isLocked) return { icon: LockIcon, label: lockReason };
  if (status === 'completed') return { icon: CheckCircleIcon, label: 'Пройден' };
  if (status === 'in_progress') return { icon: ClockIcon, label: 'В процессе' };
  return { icon: CircleIcon, label: 'Не начат' };
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
                {moduleLocked ? (
                  <>
                    <Icon icon={LockIcon} size={16} label="Раздел закрыт" />{' '}
                  </>
                ) : null}
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
                const lockReason = lockCaption(
                  blockingMaterialTitle(tree, progressByMaterial, material.id)
                );
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
                      <span className="course-toc__material-icon">
                        <Icon
                          icon={statusIcon(status, isLocked, lockReason).icon}
                          size={16}
                          label={statusIcon(status, isLocked, lockReason).label}
                        />
                      </span>
                      <span className="course-toc__material-title">{material.title}</span>
                      {isLocked ? (
                        <span
                          className="course-toc__material-reason ui-text-muted"
                          data-testid={`course-toc-lock-reason-${material.id}`}
                        >
                          {lockReason}
                        </span>
                      ) : null}
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
