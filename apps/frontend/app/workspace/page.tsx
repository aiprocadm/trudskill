'use client';

import { useQuery } from '@tanstack/react-query';
import { DataTable } from '@trudskill/ui';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { resolveWorkspaceErrorMessage } from './page.utils';
import {
  GlobalLoading,
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../src/components/state-wrappers';
import { useAuth } from '../../src/features/auth/context';
import { getPrimaryRoleBlueprint } from '../../src/features/navigation/role-blueprints';
import { getJourneyByRole } from '../../src/features/navigation/role-journeys';
import { workspaceApi } from '../../src/features/workspace/api';
import { recordJourneyStep } from '../../src/lib/analytics/ux-metrics';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

import type { WorkspaceBlockerItem, WorkspaceTaskItem } from '../../src/features/workspace/types';

export default function WorkspacePage() {
  const { session } = useAuth();
  const role = getPrimaryRoleBlueprint(session);
  const journey = getJourneyByRole(role?.role);

  const [taskStatus, setTaskStatus] = useState<'all' | WorkspaceTaskItem['status']>('all');
  const [blockerSeverity, setBlockerSeverity] = useState<'all' | WorkspaceBlockerItem['severity']>(
    'all'
  );

  const workspace = useQuery({
    queryKey: ['workspace', session?.user.id],
    enabled: Boolean(session),
    queryFn: async () => workspaceApi.loadDashboard(session!)
  });

  const filteredTasks = useMemo(
    () =>
      (workspace.data?.tasks ?? []).filter((item) =>
        taskStatus === 'all' ? true : item.status === taskStatus
      ),
    [taskStatus, workspace.data?.tasks]
  );
  const filteredBlockers = useMemo(
    () =>
      (workspace.data?.blockers ?? []).filter((item) =>
        blockerSeverity === 'all' ? true : item.severity === blockerSeverity
      ),
    [blockerSeverity, workspace.data?.blockers]
  );

  if (!session || workspace.isLoading) {
    return (
      <ProtectedPage>
        <GlobalLoading message="Загружаем workspace..." />
      </ProtectedPage>
    );
  }

  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader
          title="Оперативная панель"
          subtitle="Приоритеты роли, блокеры и следующие действия для текущей смены"
          actions={
            <button
              type="button"
              className="ui-button ui-button--primary"
              onClick={() => void workspace.refetch()}
            >
              Обновить
            </button>
          }
        />
        {workspace.error ? (
          <SectionError message={resolveWorkspaceErrorMessage(workspace.error)} />
        ) : null}
        <SectionCard title="Ключевые показатели">
          <div className="ui-inline">
            <strong>Просрочено: {workspace.data?.summary.overdueCount ?? 0}</strong>
            <strong>Блокеров: {workspace.data?.summary.blockersCount ?? 0}</strong>
            {role ? <strong>Роль: {role.displayName}</strong> : null}
          </div>
        </SectionCard>
        {journey ? (
          <SectionCard title={`Сценарий роли: ${journey.title}`}>
            <p className="ui-prose-muted ui-prose-muted--tight">{journey.description}</p>
            <div className="ui-stack">
              {journey.steps.slice(0, 3).map((step) => (
                <Link
                  key={step.id}
                  href={step.href}
                  onClick={() =>
                    recordJourneyStep(
                      role?.role ?? 'learner',
                      'workspace_flow',
                      step.metricStep,
                      'success'
                    )
                  }
                >
                  {step.label}
                </Link>
              ))}
            </div>
          </SectionCard>
        ) : null}
        <SectionCard title="Следующие действия">
          {workspace.data?.summary.nextActions.length ? (
            <DataTable
              columns={[
                { key: 'title', title: 'Задача' },
                { key: 'route', title: 'Маршрут' }
              ]}
              rows={workspace.data.summary.nextActions}
              emptyMessage="Нет следующих действий"
            />
          ) : (
            <SectionEmpty message="Нет следующих действий" />
          )}
        </SectionCard>
        <SectionCard title="Задачи inbox">
          <div className="ui-inline">
            <select
              value={taskStatus}
              onChange={(event) => setTaskStatus(event.target.value as typeof taskStatus)}
            >
              <option value="all">Все статусы</option>
              <option value="open">Открыта</option>
              <option value="in_progress">В работе</option>
              <option value="overdue">Просрочена</option>
            </select>
          </div>
          <DataTable
            columns={[
              { key: 'title', title: 'Задача' },
              { key: 'status', title: 'Статус' },
              { key: 'dueAt', title: 'Срок' },
              { key: 'route', title: 'Маршрут' }
            ]}
            rows={filteredTasks}
            emptyMessage="Нет задач для выбранного фильтра"
          />
        </SectionCard>
        <SectionCard title="Блокеры">
          <div className="ui-inline">
            <select
              value={blockerSeverity}
              onChange={(event) => setBlockerSeverity(event.target.value as typeof blockerSeverity)}
            >
              <option value="all">Все severity</option>
              <option value="low">Низкий</option>
              <option value="medium">Средний</option>
              <option value="high">Высокий</option>
            </select>
          </div>
          <DataTable
            columns={[
              { key: 'title', title: 'Блокер' },
              { key: 'severity', title: 'Критичность' },
              { key: 'route', title: 'Маршрут' }
            ]}
            rows={filteredBlockers}
            emptyMessage="Нет блокеров для выбранного фильтра"
          />
          <div className="ui-stack">
            {filteredBlockers.slice(0, 5).map((item) => (
              <Link key={item.id} href={item.route}>
                Перейти: {item.title}
              </Link>
            ))}
          </div>
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
