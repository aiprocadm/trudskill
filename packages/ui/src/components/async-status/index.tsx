import { AsyncTaskStatus } from '@trudskill/shared-types';

import { semanticStatusMap } from '../../tokens/index.js';
import { statusAccessibleLabel } from '../badges/status-label.js';

import type { ReactElement } from 'react';

/**
 * Подписи статусов фоновой задачи (ТЗ 16.4 «тексты как ресурс»).
 *
 * **Как было.** У виджета жил СВОЙ словарь подписей, и он расходился с общим:
 * `Canceled` звался здесь «Отменено», а в общем словаре — «Отменён». Цвет при этом брался из
 * общего источника (`semanticStatusMap`): одно и то же состояние получало цвет из одного
 * места, а слово — из другого, и они разъезжались молча (журнал 546).
 *
 * **Стало.** Слово берётся из общего словаря (`statusAccessibleLabel`) — по тому же ключу, по
 * которому берётся цвет. Исключения объявлены поимённо и с причиной: не всякое слово общего
 * словаря годится фоновой задаче, потому что один и тот же ключ обслуживает разные предметные
 * области.
 */
const SEMANTIC_KEY: Record<AsyncTaskStatus, keyof typeof semanticStatusMap> = {
  [AsyncTaskStatus.Queued]: 'queued',
  [AsyncTaskStatus.Running]: 'running',
  [AsyncTaskStatus.Succeeded]: 'completed',
  [AsyncTaskStatus.Failed]: 'failed',
  [AsyncTaskStatus.Canceled]: 'cancelled'
};

/**
 * Где общее слово фоновой задаче не подходит — и почему.
 *
 * `failed` в общем словаре — «Не пройден»: это про ЭКЗАМЕН, а не про задачу. Фоновая задача не
 * «не проходит», она завершается ошибкой. `completed` — «Завершён»: для задачи важно не что она
 * кончилась, а что кончилась УСПЕШНО; «Завершён» этого не говорит, а рядом стоит «Ошибка».
 */
const OVERRIDES: Partial<Record<AsyncTaskStatus, { label: string; why: string }>> = {
  [AsyncTaskStatus.Failed]: {
    label: 'Ошибка',
    why: 'общее «Не пройден» — про экзамен; задача завершается ошибкой, а не проваливается'
  },
  [AsyncTaskStatus.Succeeded]: {
    label: 'Успешно',
    why: 'общее «Завершён» не отличает удачу от неудачи, а рядом стоит «Ошибка»'
  }
};

export const asyncStatusLabel = (status: AsyncTaskStatus): string =>
  OVERRIDES[status]?.label ?? statusAccessibleLabel(SEMANTIC_KEY[status] ?? String(status));

/** Исключения экспортируются ради сторожа: список обязан быть объявленным, а не подразумеваемым. */
export const ASYNC_STATUS_OVERRIDES = OVERRIDES;
export const ASYNC_STATUS_SEMANTIC_KEY = SEMANTIC_KEY;

export const AsyncStatusWidget = ({ status }: { status: AsyncTaskStatus }): ReactElement => {
  const label = asyncStatusLabel(status);
  /* Цвет и слово берутся по ОДНОМУ ключу — иначе они и разъезжаются (журнал 546). */
  const color = semanticStatusMap[SEMANTIC_KEY[status] ?? 'pending'];
  return (
    <span className="ui-inline" style={{ alignItems: 'center', gap: 8 }}>
      <span className="ui-badge" style={{ background: color }}>
        {label}
      </span>
      <span className="ui-text-muted" style={{ fontSize: 13 }}>
        Фоновая задача
      </span>
    </span>
  );
};
