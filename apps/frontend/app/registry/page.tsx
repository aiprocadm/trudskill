'use client';

import { DataTable, LoadingState } from '@trudskill/ui';
import { useEffect, useState } from 'react';

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

type RegistryEvent = {
  id: string;
  action: string;
  entityType: string;
  entityId?: string;
  createdAt: string;
};

export default function ModulePage() {
  const { session } = useAuth();
  const [rows, setRows] = useState<RegistryEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setLoading(true);
    void apiRequest<{ items: RegistryEvent[] }>('/audit/events', {
      auth: {
        accessToken: session.tokens.accessToken,
        tenantId: session.user.tenantId,
        userId: session.user.id
      }
    })
      .then((result) => {
        if (!cancelled) setRows(result.items);
      })
      .catch((eventError) => {
        if (!cancelled) {
          setError(eventError instanceof Error ? eventError.message : 'Ошибка загрузки registry');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader
          title="Универсальный реестр операций"
          subtitle="Сводный журнал действий и сущностей"
        />
        <SectionCard title="События">
          {loading ? <LoadingState message="Загрузка..." /> : null}
          {error ? <SectionError message={error} /> : null}
          {!loading && !error && !rows.length ? (
            <SectionEmpty message="События не найдены" />
          ) : null}
          {rows.length ? (
            <DataTable
              columns={[
                { key: 'createdAt', title: 'Дата' },
                { key: 'action', title: 'Действие' },
                { key: 'entityType', title: 'Сущность' },
                { key: 'entityId', title: 'ID' }
              ]}
              rows={rows}
            />
          ) : null}
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
