'use client';

import { DataTable, FilterBar, LoadingState } from '@trudskill/ui';
import Link from 'next/link';
import { useState } from 'react';

import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../src/components/state-wrappers';
import { useAuth } from '../../src/features/auth/context';
import { apiRequest } from '../../src/lib/api/client';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

type AuditEvent = {
  id: string;
  actorId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  createdAt: string;
};

export default function ModulePage() {
  const { session } = useAuth();
  const [actor, setActor] = useState('');
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const [entityId, setEntityId] = useState('');
  const [requestId, setRequestId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<AuditEvent[]>([]);

  const load = async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams();
      if (actor) query.set('actor', actor);
      if (entity) query.set('entity', entity);
      if (action) query.set('action', action);
      if (entityId) query.set('entity_id', entityId);
      if (requestId) query.set('request_id', requestId);
      if (from) query.set('created_from', from);
      if (to) query.set('created_to', to);
      const result = await apiRequest<{ items: AuditEvent[] }>(
        `/audit/events?${query.toString()}`,
        {
          auth: {
            accessToken: session.tokens.accessToken,
            tenantId: session.user.tenantId,
            userId: session.user.id
          }
        }
      );
      setRows(result.items);
    } catch (eventError) {
      setError(eventError instanceof Error ? eventError.message : 'Ошибка загрузки аудита');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader
          title="Аудит"
          subtitle="Журнал действий с фильтрами по actor/entity/action"
          actions={
            <button
              type="button"
              className="ui-button ui-button--primary"
              onClick={() => void load()}
            >
              Обновить
            </button>
          }
        />
        <SectionCard title="Фильтры">
          <FilterBar>
            <input
              value={actor}
              onChange={(event) => setActor(event.target.value)}
              placeholder="actor"
            />
            <input
              value={entity}
              onChange={(event) => setEntity(event.target.value)}
              placeholder="entity type"
            />
            <input
              value={action}
              onChange={(event) => setAction(event.target.value)}
              placeholder="action"
            />
            <input
              value={entityId}
              onChange={(event) => setEntityId(event.target.value)}
              placeholder="entity id"
            />
            <input
              value={requestId}
              onChange={(event) => setRequestId(event.target.value)}
              placeholder="request id"
            />
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            <button type="button" onClick={() => void load()}>
              Применить
            </button>
          </FilterBar>
        </SectionCard>
        <SectionCard title="События">
          {loading ? <LoadingState message="Загрузка событий..." /> : null}
          {error ? <SectionError message={error} /> : null}
          {!loading && !error && !rows.length ? (
            <SectionEmpty message="События не найдены" />
          ) : null}
          {rows.length ? (
            <>
              <DataTable
                columns={[
                  { key: 'createdAt', title: 'Дата' },
                  { key: 'actorId', title: 'Actor' },
                  { key: 'action', title: 'Action' },
                  { key: 'entityType', title: 'Entity' },
                  { key: 'entityId', title: 'Entity ID' }
                ]}
                rows={rows}
              />
              <div className="ui-stack">
                {rows.slice(0, 5).map((row) => (
                  <Link key={row.id} href={`/workspace`}>
                    Детали события {row.id}
                  </Link>
                ))}
              </div>
            </>
          ) : null}
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
