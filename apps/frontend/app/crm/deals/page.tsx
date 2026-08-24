'use client';

import { FilterBar, ListPage, LoadingState } from '@trudskill/ui';
import { useMemo, useState } from 'react';

import {
  PageContainer,
  PageHeader,
  SectionCard,
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

  /* Название группы вместо её идентификатора: список групп на экране уже загружен. */
  const groupName = (id: string) => groups.data?.items.find((item) => item.id === id)?.name ?? id;

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
          title="Сделки"
          subtitle="Договорённости с компаниями об обучении сотрудников: на какой стадии каждая и на какую сумму"
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
              Создать сделку
            </button>
          </FilterBar>
          <p>
            В работе: {stats.inProgress} · Успешно: {stats.won}
          </p>
        </SectionCard>
        <SectionCard title="Реестр сделок">
          {/*
            GOAL-4: каркас списка — из дизайн-системы.
            Кнопки стадий когда-то лежали ОТДЕЛЬНЫМ списком под таблицей и не называли
            сделку — только стадию. Понять, какая строка чья, можно было лишь по порядку:
            одна оплошность и переведена чужая сделка. Действия живут в строке.
          */}
          <ListPage
            isLoading={false}
            rows={deals.map((deal) => ({
              ...deal,
              /* Идентификатор группы как значение заменён названием. */
              groupTitle: groupName(deal.groupId)
            }))}
            rowKey={(row) => row.id}
            emptyMessage="Сделки не созданы"
            emptyHint="Сделка — договорённость с компанией об обучении сотрудников."
            columns={[
              { key: 'counterparty', title: 'Заказчик' },
              { key: 'groupTitle', title: 'Группа' },
              { key: 'amount', title: 'Сумма' },
              { key: 'stage', title: 'Стадия', render: (row) => STAGE_LABELS[row.stage] }
            ]}
            rowActions={(row) => [
              { label: 'Перевести в предложение', onSelect: () => moveDeal(row.id, 'proposal') },
              { label: 'Отметить успешной', onSelect: () => moveDeal(row.id, 'won') },
              { label: 'Отметить отказом', danger: true, onSelect: () => moveDeal(row.id, 'lost') }
            ]}
          />
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
