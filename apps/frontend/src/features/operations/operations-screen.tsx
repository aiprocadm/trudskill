'use client';

import { DataTable, LoadingState, StatusChip } from '@trudskill/ui';
import { type ReactElement, useState } from 'react';

import { formatDateTime, resolutionNote } from './format';
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

interface TaskRow {
  id: string;
  idView: string;
  statusView: ReactElement;
  errorView: string;
  startedView: string;
  /** Повторять можно только упавшую задачу: повтор идущей выпустил бы документ дважды. */
  canRetry: boolean;
}

interface QuarantineRow {
  id: string;
  jobTypeView: string;
  errorView: string;
  retryView: string;
  quarantinedView: string;
  statusView: ReactElement;
  /** Сообщение, которое не разбирается, вернуть в работу нельзя — оно тут же вернётся. */
  replayable: boolean;
}

interface EmailRow {
  id: string;
  recipientView: string;
  subjectView: string;
  statusView: ReactElement;
  createdView: string;
  /** Письмо без сохранённого тела повторить дословно нельзя. */
  canResend: boolean;
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
                { key: 'startedView', title: 'Начата' }
              ]}
              /*
                ТЗ 5.6 (Э6): действия строки — через общее правило, а не своей колонкой
                с кнопками внутри данных (журнал 454). «Повторить» есть только у упавших:
                перезапуск идущей задачи выпустил бы документ дважды. У остальных строк
                действий нет — и колонка «Действия» не рисуется вовсе (Э2).
              */
              rowActions={(row) =>
                row.canRetry
                  ? [
                      {
                        label: 'Повторить',
                        disabled: actions.busyId === row.id,
                        onSelect: () => void actions.retryTask(row.id)
                      }
                    ]
                  : []
              }
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
                  canRetry: task.status === 'failed'
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
                { key: 'statusView', title: 'Статус', render: (row) => row.statusView }
              ]}
              /*
                ТЗ 5.6 (Э6): одно правило действий строки на всё приложение. «Отбросить»
                необратимо — компонент печатает его последним и красным, в меню «…».
              */
              rowActions={(row) => [
                ...(row.replayable
                  ? [
                      {
                        label: 'Вернуть в работу',
                        disabled: actions.busyId === row.id,
                        onSelect: () => void actions.republish(row.id)
                      }
                    ]
                  : []),
                {
                  label: 'Отбросить',
                  danger: true,
                  disabled: actions.busyId === row.id,
                  onSelect: () => void actions.discard(row.id)
                }
              ]}
              rows={quarantine.data.items.map(
                (job): QuarantineRow => ({
                  id: job.id,
                  jobTypeView: job.jobType ?? 'неизвестно',
                  errorView: job.lastError ?? '—',
                  retryView: String(job.retryCount),
                  quarantinedView: formatDateTime(job.quarantinedAt),
                  /*
                   * §5.431: у разобранного сообщения видно, КТО и КОГДА его разобрал.
                   *
                   * Сервер это хранил и присылал, а экран не показывал — «кто отбросил
                   * упавший выпуск удостоверения» выяснялось только по базе. Отдельной
                   * колонки не заводим: их и так шесть при бюджете семь (§13.2), а сведения
                   * относятся к статусу и читаются под ним второй строкой.
                   */
                  replayable: job.replayable,
                  statusView: (
                    <span className="ui-stack" style={{ gap: 2 }}>
                      <StatusChip status={job.status} />
                      {job.status !== 'quarantined' ? (
                        <span className="ui-text-muted" style={{ fontSize: '0.85em' }}>
                          {resolutionNote(job)}
                        </span>
                      ) : null}
                      {/*
                        Причина, по которой «Вернуть в работу» не предлагается, обязана
                        остаться на экране: без неё человек ищет пропавшую кнопку. Тело
                        сообщения не разбирается — отправлять его снова бессмысленно, оно
                        тут же вернётся обратно.
                      */}
                      {job.status === 'quarantined' && !job.replayable ? (
                        <span className="ui-text-muted" style={{ fontSize: '0.85em' }}>
                          Сообщение не разбирается — вернуть в работу нельзя
                        </span>
                      ) : null}
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
                { key: 'createdView', title: 'Когда' }
              ]}
              rowActions={(row) =>
                row.canResend
                  ? [
                      {
                        label: 'Отправить повторно',
                        disabled: actions.busyId === row.id,
                        onSelect: () => void actions.resendEmail(row.id)
                      }
                    ]
                  : []
              }
              rows={emails.data.items.map(
                (mail): EmailRow => ({
                  id: mail.id,
                  recipientView: mail.recipientEmail,
                  subjectView: mail.subject,
                  statusView: (
                    <span className="ui-stack" style={{ gap: 2 }}>
                      <StatusChip status={mail.status} />
                      {/*
                        Письма, отправленные до обновления, хранятся без тела: повторить их
                        дословно нельзя, а пересобирать из шаблона — значит отправить ДРУГОЕ.
                        Причина остаётся на экране, иначе человек ищет пропавшую кнопку.
                      */}
                      {mail.body ? null : (
                        <span className="ui-text-muted" style={{ fontSize: '0.85em' }}>
                          Тело письма не сохранено — повторить нельзя
                        </span>
                      )}
                    </span>
                  ),
                  createdView: formatDateTime(mail.createdAt),
                  canResend: Boolean(mail.body)
                })
              )}
            />
          ) : null}
        </SectionCard>
      ) : null}
    </PageContainer>
  );
}
