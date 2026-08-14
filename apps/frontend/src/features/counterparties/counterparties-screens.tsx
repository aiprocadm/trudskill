'use client';

import { AsyncSection, LoadingState, StatusChip } from '@trudskill/ui';
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
import { PaginationControls, RegistryControls } from '../mvp/screen-helpers';

/*
 * Перенесены «как есть» из features/mvp/screens.tsx (§8.3, порядок 6; правило SCR-001).
 * Редизайн — следующим коммитом.
 */

export const CounterpartiesPageScreen = () => {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const { data, loading, error } = useCounterpartiesList({
    q,
    status,
    page,
    page_size: 20,
    sort: 'name:asc'
  });

  return (
    <PageContainer>
      <PageHeader title="Контрагенты" />
      <SectionCard title="Реестр контрагентов">
        <RegistryControls q={q} setQ={setQ} status={status} setStatus={setStatus} />
        <AsyncSection
          isLoading={loading}
          error={error ? new Error(error) : undefined}
          isEmpty={!data?.items.length}
          loadingMessage="Загрузка…"
          emptyMessage="Нет контрагентов"
        >
          <div className="ui-stack" style={{ gap: 8 }}>
            {(data?.items ?? []).map((item) => (
              <Link key={item.id} href={`/counterparties/${item.id}`}>
                {item.name} ({item.code})
              </Link>
            ))}
          </div>
        </AsyncSection>
        <PaginationControls page={page} setPage={setPage} total={data?.total} pageSize={20} />
      </SectionCard>
    </PageContainer>
  );
};

export const CounterpartyDetailsScreen = ({ id }: { id: string }) => {
  const { data, loading, error } = useCounterparty(id);
  return (
    <PageContainer>
      <PageHeader title="Карточка контрагента" />
      {loading ? <LoadingState message="Загрузка…" /> : null}
      {error ? <SectionError message={error} /> : null}
      {data ? (
        <>
          <SectionCard title="Общие данные">
            <div className="ui-inline" style={{ justifyContent: 'space-between' }}>
              <p className="profile-name">{data.name}</p>
              <StatusChip status={data.status} />
            </div>
            <dl className="kv-list">
              <div className="kv-list__row">
                <dt>Код</dt>
                <dd>{data.code}</dd>
              </div>
            </dl>
          </SectionCard>
          <SectionCard title="Контакты">
            <SectionEmpty message="Контактные данные пока не заполнены." />
          </SectionCard>
        </>
      ) : null}
    </PageContainer>
  );
};
