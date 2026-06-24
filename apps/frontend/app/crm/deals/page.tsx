'use client';

import { DataTable, FilterBar, LoadingState } from '@trudskill/ui';
import { useMemo, useState } from 'react';

import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../../src/components/state-wrappers';
import { useCounterpartiesList, useGroupsList } from '../../../src/features/mvp/hooks';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

type Deal = {
  id: string;
  counterparty: string;
  groupId: string;
  amount: number;
  stage: 'lead' | 'proposal' | 'won' | 'lost';
};

const STAGE_LABELS: Record<Deal['stage'], string> = {
  lead: 'Лид',
  proposal: 'Предложение',
  won: 'Успех',
  lost: 'Отказ'
};

export default function CrmDealsPage() {
  const counterparties = useCounterpartiesList({ page: 1, page_size: 50 });
  const groups = useGroupsList({ page: 1, page_size: 50 });
  const [counterparty, setCounterparty] = useState('');
  const [groupId, setGroupId] = useState('');
  const [amount, setAmount] = useState('0');
  const [deals, setDeals] = useState<Deal[]>([]);
  const stats = useMemo(
    () => ({
      won: deals.filter((d) => d.stage === 'won').length,
      inProgress: deals.filter((d) => d.stage === 'lead' || d.stage === 'proposal').length
    }),
    [deals]
  );

  const createDeal = () => {
    if (!counterparty || !groupId) return;
    const deal: Deal = {
      id: `deal_${Date.now()}`,
      counterparty,
      groupId,
      amount: Number(amount) || 0,
      stage: 'lead'
    };
    setDeals((curr) => [deal, ...curr]);
  };

  const moveDeal = (id: string, stage: Deal['stage']) => {
    setDeals((curr) => curr.map((item) => (item.id === id ? { ...item, stage } : item)));
  };

  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader
          title="CRM · Сделки"
          subtitle="Сделки: стадии, контрагенты, промокоды, договоры"
        />
        <SectionCard title="Создать сделку">
          {counterparties.loading || groups.loading ? (
            <LoadingState message="Загрузка справочников..." />
          ) : null}
          {counterparties.error ? <SectionError message={counterparties.error} /> : null}
          {groups.error ? <SectionError message={groups.error} /> : null}
          <FilterBar>
            <select value={counterparty} onChange={(event) => setCounterparty(event.target.value)}>
              <option value="">Контрагент</option>
              {counterparties.data?.items.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
            <select value={groupId} onChange={(event) => setGroupId(event.target.value)}>
              <option value="">Группа</option>
              {groups.data?.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="Сумма"
            />
            <button
              type="button"
              className="ui-button ui-button--primary"
              onClick={createDeal}
              disabled={!counterparty || !groupId}
            >
              Добавить
            </button>
          </FilterBar>
          <p>
            В работе: {stats.inProgress} · Успешно: {stats.won}
          </p>
        </SectionCard>
        <SectionCard title="Реестр сделок">
          {deals.length ? (
            <>
              <DataTable
                columns={[
                  { key: 'counterparty', title: 'Контрагент' },
                  { key: 'groupId', title: 'Группа' },
                  { key: 'amount', title: 'Сумма' },
                  { key: 'stage', title: 'Стадия', render: (row) => STAGE_LABELS[row.stage] }
                ]}
                rows={deals}
              />
              <div className="ui-stack">
                {deals.map((deal) => (
                  <div key={deal.id} className="ui-inline">
                    <span className="ui-text-muted">{STAGE_LABELS[deal.stage]}</span>
                    <button
                      type="button"
                      className="ui-button ui-button--secondary"
                      onClick={() => moveDeal(deal.id, 'proposal')}
                    >
                      В предложение
                    </button>
                    <button
                      type="button"
                      className="ui-button ui-button--secondary"
                      onClick={() => moveDeal(deal.id, 'won')}
                    >
                      Успех
                    </button>
                    <button
                      type="button"
                      className="ui-button ui-button--secondary"
                      onClick={() => moveDeal(deal.id, 'lost')}
                    >
                      Отказ
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <SectionEmpty message="Сделки не созданы" />
          )}
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
