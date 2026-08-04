import { apiRequest } from '../../lib/api/client';

import type { UserSession } from '../../entities/session/model';

/** ФТ-D7 (Фаза 4 Task 11): здоровье арендаторов — только агрегаты, без содержимого задач. */

export interface TenantHealthDto {
  tenantId: string;
  code: string;
  name: string;
  status: string;
  documentTasksQueued: number;
  documentTasksFailed: number;
  syncJobsPending: number;
  syncJobsFailed: number;
  deadLetters: number;
  exportsFailed: number;
  lastExportAt: string | null;
  lastActivityAt: string | null;
}

export interface PlatformHealthDto {
  tenants: TenantHealthDto[];
  platformOutbox: { pending: number; failed: number };
  generatedAt: string;
}

export const platformHealthApi = {
  get: (session: UserSession) =>
    apiRequest<PlatformHealthDto>('/platform/health/tenants', {
      auth: {
        accessToken: session.tokens.accessToken,
        tenantId: session.user.tenantId,
        userId: session.user.id
      }
    })
};

/** Что именно сломано у центра — человеческими словами. */
export const healthProblems = (t: TenantHealthDto): string[] => {
  const problems: string[] = [];
  if (t.documentTasksFailed > 0) problems.push(`документы не выпустились: ${t.documentTasksFailed}`);
  if (t.syncJobsFailed > 0) problems.push(`обмен не прошёл: ${t.syncJobsFailed}`);
  if (t.deadLetters > 0) problems.push(`сообщений в карантине: ${t.deadLetters}`);
  if (t.exportsFailed > 0) problems.push(`выгрузок в реестры не прошло: ${t.exportsFailed}`);
  return problems;
};

/**
 * Общая оценка. Очередь сама по себе — НЕ поломка: задачи разбираются постоянно, и
 * «в работе 5 штук» это норма. Тревога только по фактическим отказам.
 */
export type HealthLevel = 'broken' | 'busy' | 'idle' | 'ok';

export const healthLevel = (t: TenantHealthDto): HealthLevel => {
  if (healthProblems(t).length > 0) return 'broken';
  if (t.documentTasksQueued > 0 || t.syncJobsPending > 0) return 'busy';
  if (!t.lastActivityAt) return 'idle';
  return 'ok';
};

export const HEALTH_LABELS: Record<HealthLevel, string> = {
  broken: 'Есть отказы',
  busy: 'Задачи в работе',
  idle: 'Активности не было',
  ok: 'В порядке'
};

/** «4 августа, 15:30» — без секунд: их тут читать некому. */
export const formatMoment = (iso: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const months = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
  ];
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${months[d.getMonth()]}, ${hh}:${mm}`;
};
