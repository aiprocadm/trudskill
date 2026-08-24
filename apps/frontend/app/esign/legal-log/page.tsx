'use client';

import { ListPage } from '@trudskill/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { PageContainer, PageHeader, SectionCard } from '../../../src/components/state-wrappers';
import { formatDateTime } from '../../../src/features/assessment-admin/format';
import { useAuth } from '../../../src/features/auth/context';
import { formatEsignEvent } from '../../../src/features/esignature/labels';
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
      setError(e instanceof Error ? e.message : 'Не удалось загрузить журнал');
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
        <PageHeader
          title="Юридический журнал"
          subtitle="Журнал юридически значимых событий (только добавление)"
        />
        <SectionCard title="События">
          {/*
            GOAL-4: каркас списка — из дизайн-системы. Заодно ушли англицизмы: «Фильтр по
            actor» и «Загрузка legal log…» человеку ничего не говорят, а коды событий вида
            `esign.participant.signed` печатались как значение колонки.
          */}
          <ListPage<EsignEvent>
            isLoading={loading}
            error={error}
            onRetry={() => void load()}
            rows={filtered}
            rowKey={(row) => row.id}
            emptyMessage="События не найдены"
            emptyHint="Здесь хранится юридический след подписания: кто, что и когда подписал."
            filters={
              <label className="ui-field">
                <span className="ui-field-label">Кто совершил</span>
                <input
                  value={actorFilter}
                  onChange={(event) => setActorFilter(event.target.value)}
                  placeholder="Начните вводить"
                />
              </label>
            }
            columns={[
              {
                key: 'createdAt',
                title: 'Когда',
                render: (row) => (row.createdAt ? formatDateTime(row.createdAt) : '—')
              },
              {
                key: 'eventType',
                title: 'Что произошло',
                render: (row) => formatEsignEvent(row.eventType)
              },
              { key: 'actorId', title: 'Кто', render: (row) => row.actorId ?? '—' },
              { key: 'entityType', title: 'Над чем', render: (row) => row.entityType ?? '—' }
            ]}
          />
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
