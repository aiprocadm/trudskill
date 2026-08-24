'use client';

import { ListPage } from '@trudskill/ui';
import { useCallback, useEffect, useState } from 'react';

import { PageContainer, PageHeader, SectionCard } from '../../../src/components/state-wrappers';
import { formatDateTime } from '../../../src/features/assessment-admin/format';
import { useAuth } from '../../../src/features/auth/context';
import { formatEsignProcessStatus } from '../../../src/features/esignature/labels';
import { apiRequest } from '../../../src/lib/api/client';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

type EsignProcess = {
  id: string;
  status: string;
  mode?: string;
  createdAt?: string;
};

export default function EsignProcessesPage() {
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<EsignProcess[]>([]);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const result = await apiRequest<{ items: EsignProcess[] }>('/esign/processes', {
        auth: {
          accessToken: session.tokens.accessToken,
          tenantId: session.user.tenantId,
          userId: session.user.id
        }
      });
      setRows(result.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки процессов');
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader
          title="Подписание документов"
          subtitle="Реестр процессов и участников подписания"
        />
        <SectionCard title="Процессы подписания">
          {/* GOAL-4: каркас списка — из дизайн-системы, а не ручная лесенка состояний. */}
          <ListPage<EsignProcess>
            isLoading={loading}
            error={error}
            onRetry={() => void load()}
            rows={rows}
            rowKey={(row) => row.id}
            emptyMessage="Процессы не найдены"
            emptyHint="Процесс появляется, когда документ уходит на подписание."
            columns={[
              {
                key: 'mode',
                title: 'Порядок подписания',
                render: (row) => (row.mode ? row.mode : 'не указан')
              },
              {
                key: 'status',
                title: 'Статус',
                render: (row) => formatEsignProcessStatus(row.status)
              },
              {
                key: 'createdAt',
                title: 'Создан',
                render: (row) => (row.createdAt ? formatDateTime(row.createdAt) : '—')
              }
            ]}
          />
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
