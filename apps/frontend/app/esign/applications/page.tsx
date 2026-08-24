'use client';

import { ListPage } from '@trudskill/ui';
import { useCallback, useEffect, useState } from 'react';

import { PageContainer, PageHeader, SectionCard } from '../../../src/components/state-wrappers';
import { formatDateTime } from '../../../src/features/assessment-admin/format';
import { useAuth } from '../../../src/features/auth/context';
import { formatEsignApplicationStatus } from '../../../src/features/esignature/labels';
import { apiRequest } from '../../../src/lib/api/client';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

type EsignApplication = {
  id: string;
  applicantId?: string;
  applicantName?: string;
  status: string;
  createdAt?: string;
};

export default function EsignApplicationsPage() {
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<EsignApplication[]>([]);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const result = await apiRequest<{ items: EsignApplication[] }>('/esign/applications', {
        auth: {
          accessToken: session.tokens.accessToken,
          tenantId: session.user.tenantId,
          userId: session.user.id
        }
      });
      setRows(result.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки заявок');
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
          title="НЭП — заявки"
          subtitle="Заявки на электронную подпись и ход их согласования"
        />
        <SectionCard title="Заявки">
          {/*
            GOAL-4: каркас списка берётся из дизайн-системы. Раньше здесь стояла ручная
            лесенка «загрузка → ошибка → пусто → таблица» — тот же код, что на два десятка
            других реестров, только со своими мелкими отличиями.
          */}
          <ListPage<EsignApplication>
            isLoading={loading}
            error={error}
            onRetry={() => void load()}
            rows={rows}
            rowKey={(row) => row.id}
            emptyMessage="Заявки НЭП не найдены"
            emptyHint="Заявка нужна, чтобы слушатель получил электронную подпись для документов."
            columns={[
              {
                key: 'applicantName',
                title: 'Заявитель',
                /* Раньше в колонке стоял `applicantId` — машинный идентификатор вместо человека. */
                render: (row) => row.applicantName ?? 'Имя не передано'
              },
              {
                key: 'status',
                title: 'Статус',
                render: (row) => formatEsignApplicationStatus(row.status)
              },
              {
                key: 'createdAt',
                title: 'Создана',
                render: (row) => (row.createdAt ? formatDateTime(row.createdAt) : '—')
              }
            ]}
          />
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
