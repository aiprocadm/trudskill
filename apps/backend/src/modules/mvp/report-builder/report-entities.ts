/**
 * Phase 10 Track A — declarative report entity registry.
 *
 * SINGLE SOURCE OF TRUTH for "which entities/fields/filters are reportable".
 * Add a new reportable entity = add one ReportEntityDef here. Attached fields
 * (course/group/client/learner name, progress) are resolved through ResolveCtx maps
 * built per-request in MvpService.buildResolveCtx — mirroring analytics-dashboard.ts.
 */
import type { ReportEntityDef, ReportEntityKey, ReportFieldType } from './report-types.js';
import type { Enrollment, Learner } from '../mvp.types.js';

function buildFullName(l: Pick<Learner, 'lastName' | 'firstName' | 'middleName'>): string {
  return [l.lastName, l.firstName, l.middleName].filter((p) => p && p.length > 0).join(' ');
}

const LEARNERS: ReportEntityDef<Learner> = {
  key: 'learners',
  label: 'Ученики',
  fields: [
    { key: 'fullName', header: 'ФИО', type: 'string', resolve: (r) => buildFullName(r) },
    { key: 'lastName', header: 'Фамилия', type: 'string', resolve: (r) => r.lastName ?? null },
    { key: 'firstName', header: 'Имя', type: 'string', resolve: (r) => r.firstName ?? null },
    { key: 'middleName', header: 'Отчество', type: 'string', resolve: (r) => r.middleName ?? null },
    { key: 'email', header: 'Email', type: 'string', resolve: (r) => r.email ?? null },
    { key: 'snils', header: 'СНИЛС', type: 'string', resolve: (r) => r.snils ?? null },
    { key: 'position', header: 'Должность', type: 'string', resolve: (r) => r.position ?? null },
    { key: 'learnerNo', header: 'Личный №', type: 'string', resolve: (r) => r.learnerNo ?? null },
    {
      key: 'dateOfBirth',
      header: 'Дата рождения',
      type: 'date',
      resolve: (r) => r.dateOfBirth ?? null
    },
    { key: 'status', header: 'Статус', type: 'enum', resolve: (r) => r.status ?? null },
    { key: 'createdAt', header: 'Дата создания', type: 'date', resolve: (r) => r.createdAt ?? null }
  ],
  filters: [
    {
      key: 'status',
      label: 'Статус',
      kind: 'eq',
      type: 'enum',
      apply: (r, value) => r.status === value
    }
  ]
};

const ENROLLMENTS: ReportEntityDef<Enrollment> = {
  key: 'enrollments',
  label: 'Назначения',
  fields: [
    {
      key: 'learnerName',
      header: 'Ученик',
      type: 'string',
      resolve: (r, ctx) => ctx.learnerNameById.get(r.learnerId) ?? null
    },
    {
      key: 'groupName',
      header: 'Группа',
      type: 'string',
      resolve: (r, ctx) => ctx.groupById.get(r.groupId)?.name ?? null
    },
    {
      key: 'clientName',
      header: 'Заказчик',
      type: 'string',
      resolve: (r, ctx) => {
        const cpId = ctx.groupById.get(r.groupId)?.counterpartyId;
        return cpId ? (ctx.clientNameById.get(cpId) ?? null) : null;
      }
    },
    { key: 'status', header: 'Статус', type: 'enum', resolve: (r) => r.status ?? null },
    {
      key: 'progressPercent',
      header: 'Прогресс, %',
      type: 'number',
      resolve: (r, ctx) => ctx.courseProgressByEnrollment.get(r.id) ?? null
    },
    {
      key: 'enrolledAt',
      header: 'Дата назначения',
      type: 'date',
      resolve: (r) => r.enrolledAt ?? null
    },
    {
      key: 'completedAt',
      header: 'Дата завершения',
      type: 'date',
      resolve: (r) => r.completedAt ?? null
    },
    {
      key: 'plannedEndAt',
      header: 'Плановый срок',
      type: 'date',
      resolve: (r) => r.plannedEndAt ?? null
    }
  ],
  filters: [
    {
      key: 'status',
      label: 'Статус',
      kind: 'eq',
      type: 'enum',
      apply: (r, value) => r.status === value
    },
    {
      key: 'group',
      label: 'Группа',
      kind: 'eq',
      type: 'enum',
      apply: (r, value) => r.groupId === value
    },
    {
      key: 'client',
      label: 'Заказчик',
      kind: 'eq',
      type: 'enum',
      apply: (r, value, ctx) => ctx.groupById.get(r.groupId)?.counterpartyId === value
    },
    {
      key: 'enrolledFrom',
      label: 'Назначен с',
      kind: 'date_from',
      type: 'date',
      apply: (r, value) => r.enrolledAt >= value
    },
    {
      key: 'enrolledTo',
      label: 'Назначен по',
      kind: 'date_to',
      type: 'date',
      // inclusive upper bound: a date-only value (YYYY-MM-DD) is widened to end-of-day
      apply: (r, value) => r.enrolledAt <= widenUpperBound(value)
    }
  ]
};

function widenUpperBound(value: string): string {
  return value.length === 10 && !value.includes('T') ? `${value}T23:59:59.999Z` : value;
}

export const REPORT_ENTITIES: ReportEntityDef[] = [
  LEARNERS as ReportEntityDef,
  ENROLLMENTS as ReportEntityDef
];

export function getEntity(key: ReportEntityKey): ReportEntityDef {
  const found = REPORT_ENTITIES.find((e) => e.key === key);
  if (!found) throw new Error(`unknown_report_entity:${key}`);
  return found;
}

export interface ReportEntityMeta {
  key: string;
  label: string;
  fields: { key: string; header: string; type: ReportFieldType }[];
  filters: { key: string; label: string; kind: string; type: ReportFieldType }[];
}

/** Serialisable metadata for the UI — strips resolve/apply functions. */
export function listReportEntityMeta(): ReportEntityMeta[] {
  return REPORT_ENTITIES.map((e) => ({
    key: e.key,
    label: e.label,
    fields: e.fields.map((f) => ({ key: f.key, header: f.header, type: f.type })),
    filters: e.filters.map((f) => ({ key: f.key, label: f.label, kind: f.kind, type: f.type }))
  }));
}
