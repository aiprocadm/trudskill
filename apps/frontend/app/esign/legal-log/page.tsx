'use client';

import { DataTable, FilterBar, LoadingState } from '@cdoprof/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../../src/components/state-wrappers';
import { useAuth } from '../../../src/features/auth/context';
import { apiRequest } from '../../../src/lib/api/client';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

type EsignEvent = {
  id: string;
  eventType: string;
  actorId?: string;
  entityType?: string;
  createdAt?: string;
};

export default function EsignLegalLogPage() {
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actorFilter, setActorFilter] = useState('');
  const [rows, setRows] = useState<EsignEvent[]>([]);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const result = await apiRequest<{ items: EsignEvent[] }>('/esign/legal-log', {
        auth: {
          accessToken: session.tokens.accessToken,
          tenantId: session.user.tenantId,
          userId: session.user.id
        }
      });
      setRows(result.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки legal log');
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () => rows.filter((item) => (actorFilter ? item.actorId?.includes(actorFilter) : true)),
    [actorFilter, rows]
  );

  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader title="Legal log" subtitle="Append-only журнал юридически значимых событий" />
        <SectionCard title="События">
          <FilterBar>
            <input
              value={actorFilter}
              onChange={(event) => setActorFilter(event.target.value)}
              placeholder="Фильтр по actor"
            />
            <button type="button" onClick={() => void load()}>
              Обновить
            </button>
          </FilterBar>
          {loading ? <LoadingState message="Загрузка legal log..." /> : null}
          {error ? <SectionError message={error} /> : null}
          {!loading && !error && !filtered.length ? (
            <SectionEmpty message="События не найдены" />
          ) : null}
          {filtered.length ? (
            <DataTable
              columns={[
                { key: 'createdAt', title: 'Дата' },
                { key: 'eventType', title: 'Событие' },
                { key: 'actorId', title: 'Actor' },
                { key: 'entityType', title: 'Entity' },
                { key: 'id', title: 'ID' }
              ]}
              rows={filtered}
            />
          ) : null}
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
