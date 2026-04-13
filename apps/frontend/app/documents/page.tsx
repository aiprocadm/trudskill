'use client';

import { DataTable, LoadingState, StatusChip } from '@cdoprof/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../src/components/state-wrappers';
import { useAuth } from '../../src/features/auth/context';
import { useTaskRealtime } from '../../src/features/communication/hooks';
import { apiRequest } from '../../src/lib/api/client';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

interface TemplateDto {
  name: string;
  type: string;
  status: string;
  currentVersion: string;
  updatedAt: string;
}
interface TaskDto {
  id: string;
  status: string;
  source: string;
}

export default function DocumentsPage() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const data = useQuery({
    queryKey: ['documents', session?.user.id],
    enabled: Boolean(session),
    queryFn: async () => {
      const auth = {
        auth: {
          accessToken: session!.tokens.accessToken,
          tenantId: session!.user.tenantId,
          userId: session!.user.id
        }
      };
      const [templatesResp, tasksResp] = await Promise.all([
        apiRequest<{ items: TemplateDto[] }>('/templates', auth),
        apiRequest<{ items: TaskDto[] }>('/document-tasks', auth)
      ]);
      return { templates: templatesResp.items, tasks: tasksResp.items };
    }
  });

  useTaskRealtime(
    data.data?.tasks[0]?.id,
    () => void queryClient.invalidateQueries({ queryKey: ['documents'] })
  );

  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader
          title="Документы"
          actions={<button onClick={() => void data.refetch()}>Обновить</button>}
        />
        <SectionCard title="Реестр шаблонов">
          {data.error ? (
            <SectionError
              message={
                data.error instanceof Error ? data.error.message : 'Не удалось загрузить документы'
              }
            />
          ) : null}
          {data.isLoading ? <LoadingState message="Загрузка шаблонов…" /> : null}
          {!data.isLoading && data.data?.templates.length ? (
            <>
              <DataTable
                columns={[
                  { key: 'name', title: 'Шаблон' },
                  { key: 'type', title: 'Тип' },
                  { key: 'currentVersion', title: 'Версия' },
                  { key: 'updatedAt', title: 'Обновлен' }
                ]}
                rows={data.data.templates}
              />
              <div className="ui-inline">
                {data.data.templates.map((item) => (
                  <StatusChip key={item.name} status={item.status} />
                ))}
              </div>
            </>
          ) : null}
          {!data.isLoading && !data.data?.templates.length && !data.error ? (
            <SectionEmpty message="Шаблоны не найдены" />
          ) : null}
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
