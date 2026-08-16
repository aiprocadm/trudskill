'use client';

import { useQuery } from '@tanstack/react-query';
import { DataTable, LoadingState } from '@trudskill/ui';

import { HEALTH_LABELS, formatMoment, healthLevel, healthProblems, platformHealthApi } from './api';
import { SectionCard, SectionEmpty, SectionError } from '../../components/state-wrappers';
import { useAuth } from '../auth/context';

/**
 * ФТ-D7: здоровье арендаторов. Единственный экран, который смотрит СКВОЗЬ тенанты —
 * и потому показывает только счётчики и отметки времени: владелец платформы должен
 * видеть, что у центра встала очередь, но не то, что в этой очереди.
 *
 * Центры с отказами идут первыми: экран открывают, чтобы найти проблему, а не любоваться
 * спокойными.
 */
export function PlatformHealthSection() {
  const { session } = useAuth();
  const healthQuery = useQuery({
    queryKey: ['platform-health', session?.user.id],
    enabled: Boolean(session),
    queryFn: () => platformHealthApi.get(session!)
  });

  const data = healthQuery.data;
  const rows = (data?.tenants ?? [])
    .map((t) => ({ tenant: t, level: healthLevel(t), problems: healthProblems(t) }))
    .sort((a, b) => {
      const order = { broken: 0, busy: 1, idle: 2, ok: 3 } as const;
      return order[a.level] - order[b.level] || a.tenant.name.localeCompare(b.tenant.name);
    });
  const broken = rows.filter((r) => r.level === 'broken');

  return (
    <SectionCard title="Здоровье арендаторов">
      <p className="ui-text-muted">
        Состояние очередей и задач по каждому центру. Показаны только счётчики — содержимое задач и
        документов арендаторов здесь недоступно.
      </p>

      {healthQuery.isLoading ? <LoadingState message="Собираем состояние…" /> : null}
      {healthQuery.error ? (
        <SectionError
          message={
            healthQuery.error instanceof Error
              ? healthQuery.error.message
              : 'Не удалось загрузить состояние'
          }
        />
      ) : null}

      {data ? (
        <div className="ui-stack">
          {broken.length > 0 ? (
            <p className="ui-callout ui-callout--danger">
              Центров с отказами: {broken.length} — {broken.map((r) => r.tenant.name).join(', ')}
            </p>
          ) : (
            <p className="ui-callout ui-callout--success">Отказов ни у одного центра нет.</p>
          )}

          {data.platformOutbox.failed > 0 || data.platformOutbox.pending > 0 ? (
            <p className={data.platformOutbox.failed > 0 ? 'ui-callout ui-callout--warning' : ''}>
              Общая очередь событий платформы: в ожидании {data.platformOutbox.pending}, с ошибкой{' '}
              {data.platformOutbox.failed}.
            </p>
          ) : null}

          {rows.length ? (
            <DataTable
              columns={[
                { key: 'name', title: 'Центр' },
                { key: 'levelTitle', title: 'Статус' },
                { key: 'problemsTitle', title: 'Что не так' },
                { key: 'queueTitle', title: 'В работе' },
                { key: 'lastActivityTitle', title: 'Последняя активность' },
                { key: 'lastExportTitle', title: 'Последняя выгрузка' }
              ]}
              rows={rows.map(({ tenant, level, problems }) => ({
                id: tenant.tenantId,
                name: tenant.name,
                levelTitle: HEALTH_LABELS[level],
                problemsTitle: problems.length ? problems.join('; ') : '—',
                queueTitle: `${tenant.documentTasksQueued + tenant.syncJobsPending}`,
                lastActivityTitle: formatMoment(tenant.lastActivityAt),
                lastExportTitle: formatMoment(tenant.lastExportAt)
              }))}
            />
          ) : (
            <SectionEmpty message="Действующих арендаторов нет" />
          )}
        </div>
      ) : null}
    </SectionCard>
  );
}
