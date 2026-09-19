import { statusAccessibleLabel } from './status-label.js';
import { semanticStatusTone } from '../../tokens/index.js';

import type { StatusTone } from '../../tokens/index.js';
import type { EntityStatus } from '@trudskill/shared-types';
import type { ReactElement } from 'react';

/**
 * Тон плашки по состоянию (ТЗ 7.2).
 *
 * Незнакомое состояние получает «выключено», а не «ошибку»: система не знает, что это, и
 * пугать человека красным из-за собственного незнания нельзя.
 */
export const toneOf = (status: EntityStatus | string): StatusTone =>
  semanticStatusTone[status as keyof typeof semanticStatusTone] ?? 'off';

export const StatusChip = ({
  status,
  label
}: {
  status: EntityStatus | string;
  label?: string;
}): ReactElement => {
  // Текст внутри чипа — НЕ-цветовой носитель смысла (WCAG 1.4.1). `title` даёт hover-подсказку.
  const text = label ?? statusAccessibleLabel(status);
  /*
   * Цвет приходит КЛАССОМ, а не через `style`. Встроенный стиль не умеет меняться вместе с
   * темой: именно так плашки и застряли на белом тексте, который в тёмной теме не читался.
   */
  return (
    <span className={`ui-badge ui-badge--${toneOf(status)}`} title={text}>
      {text}
    </span>
  );
};

/*
 * Русская подпись статуса нужна не только чипу: фильтр реестра показывал значения
 * латиницей («active», «blocked»), потому что взять готовую подпись было неоткуда.
 */
export { statusAccessibleLabel } from './status-label.js';
