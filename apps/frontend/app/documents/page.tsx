import { ProtectedPage } from '../../src/widgets/shell/protected-page';
import { DataTable, StatusChip } from '@cdoprof/ui';
import { PageContainer, PageHeader, SectionCard } from '../../src/components/state-wrappers';

const templates = [
  { name: 'Договор на обучение', type: 'contract', status: 'active', currentVersion: 'v3', updatedAt: '2026-03-26' },
  { name: 'Акт оказания услуг', type: 'act', status: 'archived', currentVersion: 'v1', updatedAt: '2026-03-20' }
];

const tasks = [
  { id: 'task_1', status: 'queued', source: 'group:g-12' },
  { id: 'task_2', status: 'running', source: 'learner:l-7' },
  { id: 'task_3', status: 'completed', source: 'group:g-14' }
];

export default function DocumentsPage() {
  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader title="Документы" />
        <SectionCard title="Реестр шаблонов">
          <DataTable
            columns={[
              { key: 'name', title: 'Шаблон' },
              { key: 'type', title: 'Тип' },
              { key: 'currentVersion', title: 'Текущая версия' },
              { key: 'updatedAt', title: 'Обновлен' }
            ]}
            rows={templates}
          />
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            {templates.map((item) => (
              <StatusChip key={item.name} status={item.status} />
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Статусы async задач">
          <DataTable
            columns={[
              { key: 'id', title: 'Task ID' },
              { key: 'source', title: 'Источник' },
              { key: 'status', title: 'Статус' }
            ]}
            rows={tasks}
          />
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
