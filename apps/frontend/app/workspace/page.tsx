'use client';

import { useQuery } from '@tanstack/react-query';
import { AttentionWidget, DataTable, StatCard } from '@trudskill/ui';
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
// Виджеты бывшего `/admin/cockpit` (IA-016.3). Компонент уже проверяет роли сам.
import { AdminCockpitScreen as AdminCockpitWidgets } from '../../src/features/mvp/screens';
import { getPrimaryRoleBlueprint } from '../../src/features/navigation/role-blueprints';
import { getJourneyByRole } from '../../src/features/navigation/role-journeys';
import { formatDate } from '../../src/features/mvp/screen-helpers';
import { workspaceApi } from '../../src/features/workspace/api';
import { buildAttentionItems } from '../../src/features/workspace/attention';
import { recordJourneyStep } from '../../src/lib/analytics/ux-metrics';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

import type { WorkspaceBlockerItem, WorkspaceTaskItem } from '../../src/features/workspace/types';

const TASK_STATUS_LABEL: Record<WorkspaceTaskItem['status'], string> = {
  open: 'Открыта',
  in_progress: 'В работе',
  overdue: 'Просрочена'
};

const SEVERITY_LABEL: Record<WorkspaceBlockerItem['severity'], string> = {
  low: 'Низкая',
  medium: 'Средняя',
  high: 'Высокая'
};

/*
 * IA-016: экран отвечает на вопрос «что горит», а не перечисляет всё, что известно.
 *
 * Было пять блоков подряд («Ключевые показатели», «Сценарий роли», «Следующие действия»,
 * «Задачи inbox», «Блокеры») и три таблицы с колонкой «Маршрут», где пользователю
 * показывали сырой адрес страницы. Стало три зоны: сводка тремя числами, одна очередь
 * «Разобрать» и всё остальное — ниже сгиба.
 */
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

  const attentionItems = useMemo(
    () => buildAttentionItems(workspace.data?.tasks ?? [], workspace.data?.blockers ?? []),
    [workspace.data?.tasks, workspace.data?.blockers]
  );

  if (!session || workspace.isLoading) {
    return (
      <ProtectedPage>
        <GlobalLoading message="Загружаем оперативную панель…" />
      </ProtectedPage>
    );
  }

  const overdueCount = workspace.data?.summary.overdueCount ?? 0;
  const blockersCount = workspace.data?.summary.blockersCount ?? 0;

  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader
          title="Оперативная панель"
          subtitle="Что требует внимания прямо сейчас"
          /*
           * IA-016.2: «Обновить» перестаёт быть первичным действием. Перезагрузка списка —
           * не работа пользователя, а служебная кнопка. Первичного действия у панели
           * наблюдения нет вовсе: бюджет требует «не более одного», а не «ровно одно».
           */
          actions={
            <button
              type="button"
              className="ui-button-secondary"
              onClick={() => void workspace.refetch()}
            >
              Обновить
            </button>
          }
        />
        {workspace.error ? (
          <SectionError message={resolveWorkspaceErrorMessage(workspace.error)} />
        ) : null}

        {/* Зона 1 — сводка. Три числа, каждое ведёт туда, где с ним работают. */}
        <div className="ui-dashboard-grid">
          <StatCard
            label="Просрочено"
            value={overdueCount}
            href="/groups"
            {...(overdueCount > 0
              ? {
                  trend: {
                    value: 'требует разбора',
                    direction: 'up' as const,
                    tone: 'negative' as const
                  }
                }
              : {})}
          />
          <StatCard
            label="Блокеры"
            value={blockersCount}
            href="/admin/operations"
            {...(blockersCount > 0
              ? {
                  trend: {
                    value: 'мешают работе',
                    direction: 'up' as const,
                    tone: 'negative' as const
                  }
                }
              : {})}
          />
          <StatCard
            label="Следующие действия"
            value={workspace.data?.summary.nextActions.length ?? 0}
            sub="подсказки системы"
          />
        </div>

        {/* Зона 2 — одна очередь вместо трёх таблиц. */}
        <SectionCard title="Разобрать">
          <AttentionWidget
            items={attentionItems}
            emptyState={{
              message: 'Всё разобрано',
              hint: 'Просроченных задач и блокеров нет. Можно заняться плановой работой.'
            }}
          />
        </SectionCard>

        {/* Зона 3 — ниже сгиба: подробности для тех, кому нужен полный список. */}
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
              // IA-016.1: колонки «Маршрут» больше нет — адрес страницы это не данные.
              // Название ведёт туда же, куда вёл сырой URL.
              columns={[
                {
                  key: 'title',
                  title: 'Задача',
                  render: (row) => <Link href={row.route}>{row.title}</Link>
                }
              ]}
              rows={workspace.data.summary.nextActions}
              emptyMessage="Подсказок пока нет"
              emptyHint="Подсказки появляются, когда системе есть что предложить: незакрытая группа, невыданные документы, истекающие сроки."
            />
          ) : (
            <SectionEmpty
              message="Подсказок пока нет"
              hint="Система предложит следующий шаг, когда в работе появятся группы и зачисления."
            />
          )}
        </SectionCard>

        <SectionCard title="Задачи">
          <div className="ui-inline">
            <select
              className="ui-select"
              value={taskStatus}
              onChange={(event) => setTaskStatus(event.target.value as typeof taskStatus)}
              aria-label="Статус задачи"
            >
              <option value="all">Все статусы</option>
              <option value="open">Открыта</option>
              <option value="in_progress">В работе</option>
              <option value="overdue">Просрочена</option>
            </select>
          </div>
          <DataTable
            columns={[
              {
                key: 'title',
                title: 'Задача',
                render: (row) => <Link href={row.route}>{row.title}</Link>
              },
              { key: 'status', title: 'Статус', render: (row) => TASK_STATUS_LABEL[row.status] },
              { key: 'dueAt', title: 'Срок', render: (row) => formatDate(row.dueAt) }
            ]}
            rows={filteredTasks}
            emptyMessage="По этому фильтру задач нет"
            emptyHint="Снимите часть условий отбора или загляните позже — задачи появляются по ходу обучения."
          />
        </SectionCard>

        <SectionCard title="Блокеры">
          <div className="ui-inline">
            <select
              className="ui-select"
              value={blockerSeverity}
              onChange={(event) => setBlockerSeverity(event.target.value as typeof blockerSeverity)}
              aria-label="Критичность блокера"
            >
              {/* TXT-001/TXT-006: было «Все severity» — англицизм в значении фильтра. */}
              <option value="all">Любая критичность</option>
              <option value="low">Низкая</option>
              <option value="medium">Средняя</option>
              <option value="high">Высокая</option>
            </select>
          </div>
          <DataTable
            columns={[
              {
                key: 'title',
                title: 'Блокер',
                render: (row) => <Link href={row.route}>{row.title}</Link>
              },
              {
                key: 'severity',
                title: 'Критичность',
                render: (row) => SEVERITY_LABEL[row.severity]
              }
            ]}
            rows={filteredBlockers}
            emptyMessage="По этому фильтру блокеров нет"
            emptyHint="Блокер — то, что мешает группе идти дальше: нет комиссии, не хватает документов, не назначен экзамен."
          />
        </SectionCard>

        {/* IA-016.3: виджеты бывшей «Панели администратора» — сессии, очередь, интеграции,
            состояние аудита. Экран `/admin/cockpit` отвечал на тот же вопрос «что сейчас
            происходит», поэтому его адрес стал редиректом, а содержимое живёт здесь. */}
        <AdminCockpitWidgets />
      </PageContainer>
    </ProtectedPage>
  );
}
