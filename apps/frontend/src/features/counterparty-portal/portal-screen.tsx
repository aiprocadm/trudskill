'use client';

import { BelowFold, ListPage, StatCard, StatusChip } from '@trudskill/ui';
import { useMemo } from 'react';

import { URGENCY_LABEL, documentExpiries, expirySummary, needsAttention } from './attention';
import { PageContainer, PageHeader, SectionCard } from '../../components/state-wrappers';
import { usePortalDocuments, usePortalGroups, usePortalLearners } from '../mvp/hooks';
import { formatDate } from '../mvp/screen-helpers';

/** Строка очереди: готовые к показу значения, без вычислений в разметке. */
interface AttentionRow {
  id: string;
  learner: string;
  document: string;
  validUntil: string;
  urgency: string;
}

/*
 * ФТ-H2 · дашборд заказчика обучения.
 *
 * Экран был оглавлением из трёх списков — сотрудники, группы, документы — и на вопрос
 * «что мне делать» не отвечал: представитель компании сам просматривал документы и сверял
 * сроки. А вопрос у него ровно один и денежный: у кого из его людей заканчивается
 * удостоверение. Сотрудник с истёкшим документом к работе не допускается.
 *
 * Поэтому сверху — сроки: три числа и очередь «требует внимания», отсортированная по
 * срочности. Списки остались, но ушли ниже сгиба (`GOAL-3`): это справочник, к которому
 * обращаются по надобности, а не то, с чего начинают день.
 *
 * Данные прежние: `/portal/*` сам скоупит выдачу по контрагенту представителя, никаких
 * новых ручек — счёт идёт по уже приходящим документам.
 */
export function CounterpartyPortalScreen() {
  const learners = usePortalLearners({ page: 1, page_size: 20 });
  const groups = usePortalGroups({ page: 1, page_size: 20 });
  const documents = usePortalDocuments({ page: 1, page_size: 20 });

  const expiries = useMemo(
    () => documentExpiries(documents.data?.items ?? [], new Date()),
    [documents.data]
  );
  const summary = useMemo(() => expirySummary(expiries), [expiries]);
  const queue = useMemo(() => needsAttention(expiries), [expiries]);

  return (
    <PageContainer spacious>
      <PageHeader
        title="Обучение сотрудников"
        subtitle="Сроки удостоверений, группы обучения и выданные документы вашей компании"
      />

      {/* Зона 1 — три числа. Каждое отвечает на «сколько людей меня подводит прямо сейчас». */}
      <div className="ui-dashboard-grid">
        <StatCard
          label="Просрочено"
          value={String(summary.expired)}
          sub="сотрудники без действующего удостоверения"
        />
        <StatCard
          label="Истекает на этой неделе"
          value={String(summary.critical)}
          sub="успеть записать на переобучение"
        />
        <StatCard
          label="Истекает в течение месяца"
          value={String(summary.soon)}
          sub="пора планировать"
        />
      </div>

      {/* Зона 2 — очередь, а не оглавление: сначала то, что горит. */}
      <SectionCard title="Требует внимания">
        <ListPage<AttentionRow>
          isLoading={documents.loading}
          error={documents.error ? new Error(documents.error) : undefined}
          rows={queue.map((item) => ({
            id: item.document.id,
            learner: item.document.learnerName ?? 'Имя не передано',
            document: item.document.name,
            validUntil: formatDate(item.document.validUntil),
            urgency: URGENCY_LABEL[item.urgency]
          }))}
          rowKey={(row) => row.id}
          emptyMessage="Сроки в порядке"
          emptyHint="Здесь появятся сотрудники, у которых заканчивается удостоверение: за два месяца, за месяц и за неделю до конца срока."
          columns={[
            { key: 'learner', title: 'Сотрудник' },
            { key: 'document', title: 'Документ' },
            { key: 'validUntil', title: 'Действует до' },
            { key: 'urgency', title: 'Статус' }
          ]}
        />
      </SectionCard>

      <BelowFold>
        <SectionCard title="Мои сотрудники">
          <ListPage
            isLoading={learners.loading}
            error={learners.error ? new Error(learners.error) : undefined}
            rows={learners.data?.items ?? []}
            emptyMessage="Сотрудники не найдены"
            emptyHint="Здесь компания видит своих сотрудников, направленных на обучение."
            columns={[
              { key: 'lastName', title: 'Фамилия' },
              { key: 'firstName', title: 'Имя' },
              { key: 'email', title: 'Почта' },
              {
                key: 'status',
                title: 'Статус',
                render: (row) => <StatusChip status={row.status} />
              }
            ]}
          />
        </SectionCard>

        <SectionCard title="Группы обучения">
          <ListPage
            isLoading={groups.loading}
            error={groups.error ? new Error(groups.error) : undefined}
            rows={groups.data?.items ?? []}
            emptyMessage="Группы не найдены"
            emptyHint="Появятся учебные группы, в которых учатся сотрудники компании."
            columns={[
              { key: 'code', title: 'Группа' },
              { key: 'name', title: 'Название' },
              {
                key: 'status',
                title: 'Статус',
                render: (row) => <StatusChip status={row.status} />
              }
            ]}
          />
        </SectionCard>

        <SectionCard title="Документы">
          <ListPage
            isLoading={documents.loading}
            error={documents.error ? new Error(documents.error) : undefined}
            rows={documents.data?.items ?? []}
            emptyMessage="Документы не найдены"
            emptyHint="Появятся удостоверения и протоколы сотрудников компании."
            columns={[
              { key: 'name', title: 'Документ' },
              { key: 'learnerName', title: 'Сотрудник' },
              { key: 'documentNumber', title: 'Номер' },
              {
                key: 'documentDate',
                title: 'Дата выдачи',
                render: (row) => formatDate(row.documentDate)
              },
              {
                key: 'validUntil',
                title: 'Действует до',
                render: (row) => formatDate(row.validUntil)
              },
              {
                key: 'status',
                title: 'Статус',
                render: (row) => <StatusChip status={row.status} />
              }
            ]}
          />
        </SectionCard>
      </BelowFold>
    </PageContainer>
  );
}
