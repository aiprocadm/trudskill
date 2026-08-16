'use client';

import { DataTable, LoadingState, StatusChip } from '@trudskill/ui';
import { type ReactElement, useState } from 'react';

import { useDocumentTasks, useEmailDeliveries, useOperationActions, useQuarantine } from './hooks';
import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../components/state-wrappers';
import { templateTypeLabel } from '../documents/document-types';

import type { OperationsTab } from './types';

/**
 * Экран «Эксплуатация» (ФТ-I2, Фаза 6 Task 8).
 *
 * ЗАЧЕМ. Всё, что чинится этим экраном, УЖЕ было на бэкенде — не хватало того, через что
 * на это смотрит человек. Администратор центра видел последствия («слушателю не пришло
 * письмо», «удостоверения нет») и звонил разработчику, потому что сам не мог ни увидеть
 * причину, ни нажать кнопку.
 *
 * Три вкладки — по трём вопросам, с которыми звонят:
 *   «Где документ?»       → задачи выпуска, среди них упавшие и застрявшие;
 *   «Совсем пропало?»     → карантин: сообщения, которые не вышло обработать;
 *   «Почему не пришло?»   → журнал писем.
 *
 * Таблицы строятся ТОЛЬКО через DataTable: на телефоне (≤480px) он сам превращается в
 * карточки с подписями из заголовков колонок. Своя разметка потеряла бы этот режим
 * (см. правило про 360px в CLAUDE.md).
 */

const TABS: Array<{ key: OperationsTab; label: string }> = [
  { key: 'tasks', label: 'Задачи документов' },
  { key: 'quarantine', label: 'Карантин' },
  { key: 'emails', label: 'Письма' }
];

const formatDateTime = (iso?: string | null): string => {
  if (!iso) return '—';
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? iso : parsed.toLocaleString('ru-RU');
};

interface TaskRow {
  id: string;
  idView: string;
  statusView: ReactElement;
  errorView: string;
  startedView: string;
  actionsView: ReactElement;
}

interface QuarantineRow {
  id: string;
  jobTypeView: string;
  errorView: string;
  retryView: string;
  quarantinedView: string;
  statusView: ReactElement;
  actionsView: ReactElement;
}

interface EmailRow {
  id: string;
  recipientView: string;
  subjectView: string;
  statusView: ReactElement;
  createdView: string;
  actionsView: ReactElement;
}

export function OperationsScreen(): ReactElement {
  const [tab, setTab] = useState<OperationsTab>('tasks');

  const tasks = useDocumentTasks();
  const quarantine = useQuarantine('quarantined');
  const emails = useEmailDeliveries();

  const refresh = () => {
    void tasks.refetch();
    void quarantine.refetch();
    void emails.refetch();
  };
  const actions = useOperationActions(refresh);

  return (
    <PageContainer>
      <PageHeader
        title="Эксплуатация"
        subtitle="Что не доехало: задачи выпуска документов, застрявшие сообщения и письма. Здесь же кнопки, чтобы это починить."
      />

      {actions.error ? <SectionError message={actions.error} /> : null}
      {actions.notice ? (
        <p className="ui-text-muted" role="status">
          {actions.notice}
        </p>
      ) : null}

      <nav className="ui-inline" style={{ gap: 8, flexWrap: 'wrap' }} aria-label="Разделы">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={tab === item.key ? 'ui-button ui-button--primary' : 'ui-button'}
            aria-pressed={tab === item.key}
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {tab === 'tasks' ? (
        <SectionCard title="Задачи выпуска документов">
          {tasks.isLoading ? <LoadingState message="Загрузка задач…" /> : null}
          {tasks.error ? <SectionError message="Не удалось загрузить задачи" /> : null}
          {!tasks.isLoading && !tasks.error && (tasks.data?.items.length ?? 0) === 0 ? (
            <SectionEmpty
              message="Задач нет"
              hint="Здесь появятся выпуски документов — в работе и упавшие"
            />
          ) : null}
          {tasks.data && tasks.data.items.length > 0 ? (
            <DataTable<TaskRow>
              columns={[
                { key: 'idView', title: 'Что выпускалось' },
                { key: 'statusView', title: 'Статус', render: (row) => row.statusView },
                { key: 'errorView', title: 'Ошибка' },
                { key: 'startedView', title: 'Начата' },
                { key: 'actionsView', title: 'Действия', render: (row) => row.actionsView }
              ]}
              rows={tasks.data.items.map(
                (task): TaskRow => ({
                  id: task.id,
                  /*
                   * Было «certificate · 3f7a-…»: вид документа кодом и идентификатор задачи.
                   * Человеку нужен вид документа словом — по нему он и опознаёт задачу.
                   */
                  idView: templateTypeLabel(task.documentType),
                  statusView: <StatusChip status={task.status} />,
                  errorView: task.errorMessage ?? '—',
                  startedView: formatDateTime(task.startedAt),
                  actionsView:
                    task.status === 'failed' ? (
                      <button
                        type="button"
                        className="ui-button"
                        disabled={actions.busyId === task.id}
                        onClick={() => void actions.retryTask(task.id)}
                      >
                        {actions.busyId === task.id ? 'Повторяем…' : 'Повторить'}
                      </button>
                    ) : (
                      // «Повторить» есть только у упавших: перезапуск идущей задачи
                      // выпустил бы документ дважды.
                      <span className="ui-text-muted">—</span>
                    )
                })
              )}
            />
          ) : null}
        </SectionCard>
      ) : null}

      {tab === 'quarantine' ? (
        <SectionCard title="Карантин: сообщения, которые не удалось обработать">
          {quarantine.isLoading ? <LoadingState message="Загрузка карантина…" /> : null}
          {quarantine.error ? <SectionError message="Не удалось загрузить карантин" /> : null}
          {!quarantine.isLoading &&
          !quarantine.error &&
          (quarantine.data?.items.length ?? 0) === 0 ? (
            <SectionEmpty
              message="В карантине пусто"
              hint="Сюда попадает то, что не удалось обработать даже после десяти попыток"
            />
          ) : null}
          {quarantine.data && quarantine.data.items.length > 0 ? (
            <DataTable<QuarantineRow>
              columns={[
                { key: 'jobTypeView', title: 'Что' },
                { key: 'errorView', title: 'Из-за чего' },
                { key: 'retryView', title: 'Попыток' },
                { key: 'quarantinedView', title: 'Отложено' },
                { key: 'statusView', title: 'Статус', render: (row) => row.statusView },
                { key: 'actionsView', title: 'Действия', render: (row) => row.actionsView }
              ]}
              rows={quarantine.data.items.map(
                (job): QuarantineRow => ({
                  id: job.id,
                  jobTypeView: job.jobType ?? 'неизвестно',
                  errorView: job.lastError ?? '—',
                  retryView: String(job.retryCount),
                  quarantinedView: formatDateTime(job.quarantinedAt),
                  statusView: <StatusChip status={job.status} />,
                  actionsView: (
                    <span className="ui-inline" style={{ gap: 6, flexWrap: 'wrap' }}>
                      {job.replayable ? (
                        <button
                          type="button"
                          className="ui-button"
                          disabled={actions.busyId === job.id}
                          onClick={() => void actions.republish(job.id)}
                        >
                          {actions.busyId === job.id ? 'Отправляем…' : 'Вернуть в работу'}
                        </button>
                      ) : (
                        // Тело сообщения не разбирается — отправлять его снова бессмысленно,
                        // оно тут же вернётся обратно.
                        <span className="ui-text-muted" title="Сообщение не разбирается">
                          не повторяется
                        </span>
                      )}
                      <button
                        type="button"
                        className="ui-button"
                        disabled={actions.busyId === job.id}
                        onClick={() => void actions.discard(job.id)}
                      >
                        Отбросить
                      </button>
                    </span>
                  )
                })
              )}
            />
          ) : null}
        </SectionCard>
      ) : null}

      {tab === 'emails' ? (
        <SectionCard title="Журнал писем">
          {emails.isLoading ? <LoadingState message="Загрузка писем…" /> : null}
          {emails.error ? <SectionError message="Не удалось загрузить журнал писем" /> : null}
          {!emails.isLoading && !emails.error && (emails.data?.items.length ?? 0) === 0 ? (
            <SectionEmpty message="Писем нет" hint="Здесь видно каждое отправленное уведомление" />
          ) : null}
          {emails.data && emails.data.items.length > 0 ? (
            <DataTable<EmailRow>
              columns={[
                { key: 'recipientView', title: 'Кому' },
                { key: 'subjectView', title: 'Тема' },
                { key: 'statusView', title: 'Статус', render: (row) => row.statusView },
                { key: 'createdView', title: 'Когда' },
                { key: 'actionsView', title: 'Действия', render: (row) => row.actionsView }
              ]}
              rows={emails.data.items.map(
                (mail): EmailRow => ({
                  id: mail.id,
                  recipientView: mail.recipientEmail,
                  subjectView: mail.subject,
                  statusView: <StatusChip status={mail.status} />,
                  createdView: formatDateTime(mail.createdAt),
                  actionsView: mail.body ? (
                    <button
                      type="button"
                      className="ui-button"
                      disabled={actions.busyId === mail.id}
                      onClick={() => void actions.resendEmail(mail.id)}
                    >
                      {actions.busyId === mail.id ? 'Отправляем…' : 'Отправить повторно'}
                    </button>
                  ) : (
                    // Письма, отправленные до обновления, хранятся без тела: повторить их
                    // дословно нельзя, а пересобирать из шаблона — значит отправить ДРУГОЕ.
                    <span className="ui-text-muted" title="Тело письма не сохранено">
                      повтор недоступен
                    </span>
                  )
                })
              )}
            />
          ) : null}
        </SectionCard>
      ) : null}
    </PageContainer>
  );
}
