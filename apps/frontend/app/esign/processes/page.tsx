'use client';

import { DataTable, LoadingState } from '@trudskill/ui';
import { useCallback, useEffect, useState } from 'react';

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
          {loading ? <LoadingState message="Загрузка процессов..." /> : null}
          {error ? <SectionError message={error} /> : null}
          {!loading && !error && !rows.length ? (
            <SectionEmpty message="Процессы не найдены" />
          ) : null}
          {rows.length ? (
            <DataTable
              columns={[
                { key: 'id', title: 'ID' },
                { key: 'mode', title: 'Режим' },
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
