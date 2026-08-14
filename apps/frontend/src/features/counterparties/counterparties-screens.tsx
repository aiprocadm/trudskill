'use client';

import { DetailLayout, KeyValueList, ListPage, StatusChip } from '@trudskill/ui';
import Link from 'next/link';
import { useState } from 'react';

import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../components/state-wrappers';
import { useCounterpartiesList, useCounterparty } from '../mvp/hooks';
import { formatDate } from '../mvp/screen-helpers';

import type { ReactElement } from 'react';

const PAGE_SIZE = 20;

/** Состояния заказчика словами: общий `RegistryControls` печатал коды как есть. */
const STATUS_OPTIONS = [
  { value: 'active', label: 'Работаем' },
  { value: 'blocked', label: 'Заблокирован' },
  { value: 'archived', label: 'В архиве' }
];

interface CounterpartyRow {
  id: string;
  nameView: ReactElement;
  codeView: string;
  updatedView: string;
  statusView: ReactElement;
}

/*
 * TPL-001 (Фаза 4, срез 11, волна 3). Что изменилось:
 *
 * 1. Реестр был вертикальной стопкой ссылок «Название (код)» — ни состояния, ни даты,
 *    ни сравнения. Теперь таблица на каркасе `ListPage`.
 * 2. Отбор по состоянию показывал коды (`active`, `blocked`, `archived` и ещё шесть)
 *    — это общий `RegistryControls` монолита (журнал, запись 49).
 * 3. «Нет контрагентов» — пустой экран без объяснения (`CMP-014`, `TXT-005`).
 */
export const CounterpartiesPageScreen = () => {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const { data, loading, error, refetch } = useCounterpartiesList({
    q,
    status,
    page,
    page_size: PAGE_SIZE,
    sort: 'name:asc'
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  const rows: CounterpartyRow[] = (data?.items ?? []).map((item) => ({
    id: item.id,
    nameView: (
      <Link className="ui-link" href={`/counterparties/${item.id}`}>
        {item.name}
      </Link>
    ),
    codeView: item.code || '—',
    updatedView: formatDate(item.updatedAt),
    statusView: <StatusChip status={item.status} />
  }));

  return (
    <PageContainer>
      <PageHeader
        title="Заказчики обучения"
        subtitle="Организации, которые направляют сотрудников на обучение и оплачивают его"
      />

      <ListPage<CounterpartyRow>
        filters={
          <>
            <label className="ui-field">
              <span className="ui-field-label">Поиск по названию</span>
              <input
                value={q}
                onChange={(event) => {
                  setQ(event.target.value);
                  setPage(1);
                }}
              />
            </label>
            <label className="ui-field">
              <span className="ui-field-label">Состояние</span>
              <select
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">Любое</option>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        }
        columns={[
          { key: 'nameView', title: 'Заказчик', render: (row) => row.nameView },
          { key: 'codeView', title: 'Код' },
          { key: 'updatedView', title: 'Изменён' },
          { key: 'statusView', title: 'Состояние', render: (row) => row.statusView }
        ]}
        rows={rows}
        isLoading={loading}
        error={error ? new Error(error) : undefined}
        onRetry={() => void refetch()}
        rowKey={(row) => row.id}
        emptyMessage="Здесь появятся заказчики обучения"
        emptyHint="Заказчик — организация, которая направляет сотрудников на обучение. Заказчики заводятся при оформлении договора или заявки."
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
      />
    </PageContainer>
  );
};

/*
 * TPL-002. Карточка называлась «Карточка контрагента» — одинаково для всех организаций,
 * а из данных показывала только код. Теперь заголовок — название организации, сводка справа.
 */
export const CounterpartyDetailsScreen = ({ id }: { id: string }) => {
  const { data, loading, error, refetch } = useCounterparty(id);

  return (
    <PageContainer>
      <PageHeader
        title={data?.name ?? 'Заказчик'}
        subtitle="Кто направляет сотрудников на обучение"
        actions={
          <Link className="ui-button-link" href="/counterparties">
            ← Все заказчики
          </Link>
        }
      />
      {loading ? <SectionEmpty message="Загружаем карточку…" /> : null}
      {error ? <SectionError message={error} onRetry={() => void refetch()} /> : null}
      {data ? (
        <DetailLayout
          aside={
            <SectionCard title="Коротко">
              <KeyValueList
                items={[
                  { label: 'Состояние', value: <StatusChip status={data.status} /> },
                  { label: 'Код', value: data.code || 'не задан' },
                  { label: 'Заведён', value: formatDate(data.createdAt) }
                ]}
              />
            </SectionCard>
          }
        >
          <SectionCard title="Контактные лица">
            <SectionEmpty
              message="Контактные лица пока не заведены"
              hint="Здесь появятся сотрудники заказчика, с которыми учебный центр согласовывает группы и документы."
            />
          </SectionCard>
        </DetailLayout>
      ) : null}
    </PageContainer>
  );
};
