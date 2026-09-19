'use client';

import { useQuery } from '@tanstack/react-query';
import { DataTable } from '@trudskill/ui';
import Link from 'next/link';

import { managerHomeApi } from './api';
import { deadlineText, groupsWithoutCompanyNote, laggingReasonText } from './types';
import {
  GlobalLoading,
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../components/state-wrappers';
import { useAuth } from '../auth/context';

import type { CompanyTraining } from './types';
import type { Column } from '@trudskill/ui';

/**
 * Панель руководителя (ТЗ 8.3) — его стартовая страница.
 *
 * **Как было.** Своей страницы не было вовсе: вход приводил руководителя прямо в список групп,
 * то есть в середину работы, без ответа на вопрос «что у меня вообще происходит».
 *
 * **Порядок разделов = порядок срочности, а не удобство вёрстки.** Сначала люди, которые уже
 * не успевают (звонить сегодня), потом сроки, которые подходят (планировать на неделю), и
 * только потом сводка по компаниям (разговор с заказчиком). Бюджет плотности ТЗ редизайна
 * §13.2 разрешает три блока до сгиба — их ровно три.
 *
 * **Пустой раздел показывается ЯВНО**, а не скрывается: исчезнувший блок читается как
 * «не загрузилось», и человек идёт проверять руками то, что и так в порядке.
 */

/** Адрес карточки компании. Показывается НАЗВАНИЕ, идентификатор уходит только в ссылку. */
const companyHref = (row: CompanyTraining): string => `/admin/clients/${row.counterpartyId}`;

const COMPANY_COLUMNS: Column<CompanyTraining>[] = [
  {
    key: 'companyName',
    title: 'Компания',
    render: (row) => <Link href={companyHref(row)}>{row.companyName}</Link>
  },
  { key: 'groupsCount', title: 'Групп' },
  { key: 'learnersInTraining', title: 'Учатся' },
  { key: 'overdue', title: 'Просрочено' },
  { key: 'completed', title: 'Завершили' },
  { key: 'documentsIssued', title: 'Выдано документов' }
];

export function ManagerHomeScreen() {
  const { session } = useAuth();

  const dashboard = useQuery({
    queryKey: ['manager-dashboard', session?.user.id],
    enabled: Boolean(session),
    queryFn: async () => managerHomeApi.loadDashboard(session!)
  });

  if (!session || dashboard.isLoading) {
    return <GlobalLoading message="Собираем панель…" />;
  }

  // Ошибка проверяется по `error`, а не по `isError`: в проекте своя обёртка над useQuery,
  // и поля `isError` у неё нет.
  if (dashboard.error || !dashboard.data) {
    return (
      <PageContainer spacious>
        <PageHeader title="Панель руководителя" />
        <SectionError
          message="Не удалось загрузить панель"
          onRetry={() => void dashboard.refetch()}
        />
      </PageContainer>
    );
  }

  const data = dashboard.data;
  const note = groupsWithoutCompanyNote(data.totals.groupsWithoutCompany);

  return (
    <PageContainer spacious>
      <PageHeader
        title="Панель руководителя"
        subtitle={`Компаний: ${data.totals.companies} · учатся: ${data.totals.learnersInTraining} · выдано документов: ${data.totals.documentsIssued}`}
      />

      <SectionCard title={`Не успевают (${data.lagging.length})`}>
        {data.lagging.length === 0 ? (
          <SectionEmpty
            message="Отстающих нет"
            hint="Сюда попадают те, у кого срок уже вышел или обучение идёт медленнее графика. Пока все укладываются."
          />
        ) : (
          <ul className="ui-stack">
            {data.lagging.map((item) => (
              <li key={`${item.learnerId}:${item.groupId}`}>
                <Link href={`/learners/${item.learnerId}`}>{item.learnerName}</Link>
                {item.companyName ? ` · ${item.companyName}` : ''} ·{' '}
                <Link href={`/groups/${item.groupId}`}>{item.groupName}</Link> —{' '}
                {laggingReasonText(item.reason)}, {deadlineText(item.daysLeft)}, пройдено{' '}
                {item.progressPercent}%
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title={`Ближайшие сроки, ${data.horizonDays} дн. (${data.dueSoon.length})`}>
        {data.dueSoon.length === 0 ? (
          <SectionEmpty
            message="В ближайшие дни сроков нет"
            hint="Когда у группы подойдёт плановая дата завершения, она появится здесь заранее."
          />
        ) : (
          <ul className="ui-stack">
            {data.dueSoon.map((item) => (
              <li key={item.groupId}>
                <Link href={`/groups/${item.groupId}`}>{item.groupName}</Link>
                {item.companyName ? ` · ${item.companyName}` : ''} — {deadlineText(item.daysLeft)},
                людей: {item.learnersCount}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title={`Компании (${data.companies.length})`}>
        {note ? <p className="ui-hint">{note}</p> : null}
        <DataTable<CompanyTraining>
          columns={COMPANY_COLUMNS}
          rows={data.companies}
          rowKey={(row) => row.counterpartyId}
          emptyMessage="Обучения по компаниям пока нет"
          emptyHint="Привяжите группу к компании-заказчику в её карточке — и здесь появится, как у этой компании идёт обучение."
        />
      </SectionCard>
    </PageContainer>
  );
}
