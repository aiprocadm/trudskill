'use client';

import { ListPage } from '@trudskill/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { PageContainer, PageHeader, SectionCard } from '../../../src/components/state-wrappers';
import { formatDateTime } from '../../../src/features/assessment-admin/format';
import { useAuth } from '../../../src/features/auth/context';
import { formatEsignEntity, formatEsignEvent } from '../../../src/features/esignature/labels';
import { useUsersList } from '../../../src/features/mvp/hooks';
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

  /*
   * Ревизия 2026-08-25. Колонка «Кто» печатала идентификатор учётной записи, а отбор искал
   * по нему же: человек не знал ни кого он видит, ни что вводить в поле. Приём тот же, что
   * в журнале аудита, — справочник имён подтягивается списком и подставляется на месте.
   */
  const { data: users } = useUsersList({ page: 1, page_size: 100 });
  const userName = new Map((users?.items ?? []).map((user) => [user.id, user.displayName]));
  const actorLabel = (id?: string) =>
    id ? (userName.get(id) ?? 'Учётная запись удалена') : 'Система';

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
    () =>
      rows.filter((item) =>
        actorFilter
          ? actorLabel(item.actorId).toLowerCase().includes(actorFilter.trim().toLowerCase())
          : true
      ),
    [actorFilter, rows, users]
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
                  placeholder="Фамилия или имя"
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
              { key: 'actorId', title: 'Кто', render: (row) => actorLabel(row.actorId) },
              {
                key: 'entityType',
                title: 'Над чем',
                render: (row) => (row.entityType ? formatEsignEntity(row.entityType) : '—')
              }
            ]}
          />
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
