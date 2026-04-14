'use client';

import { DataTable, LoadingState } from '@cdoprof/ui';
import { useEffect, useState } from 'react';

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

type EsignApplication = {
  id: string;
  applicantId?: string;
  status: string;
  createdAt?: string;
};

export default function EsignApplicationsPage() {
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<EsignApplication[]>([]);

  const load = async () => {
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
  };

  useEffect(() => {
    void load();
  }, [session]);

  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader title="НЭП — заявки" subtitle="Реестр заявок и workflow согласования" />
        <SectionCard title="Заявки">
          {loading ? <LoadingState message="Загрузка заявок..." /> : null}
          {error ? <SectionError message={error} /> : null}
          {!loading && !error && !rows.length ? (
            <SectionEmpty message="Заявки НЭП не найдены" />
          ) : null}
          {rows.length ? (
            <DataTable
              columns={[
                { key: 'id', title: 'ID' },
                { key: 'applicantId', title: 'Заявитель' },
                { key: 'status', title: 'Статус' },
                { key: 'createdAt', title: 'Создано' }
              ]}
              rows={rows}
            />
          ) : null}
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
