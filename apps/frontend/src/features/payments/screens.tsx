'use client';

import { DataTable, LoadingState } from '@cdoprof/ui';
import { type ReactElement, useState } from 'react';

import { payOrder } from './api';
import { useMyOrders, useOrderMutations, useOrders } from './hooks';
import { ORDER_STATUS_LABELS, type OrderStatus } from './types';
import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../components/state-wrappers';

const STATUS_FILTER_OPTIONS: Array<{ value: OrderStatus | ''; label: string }> = [
  { value: '', label: 'Все' },
  { value: 'awaiting_payment', label: 'Ожидают оплаты' },
  { value: 'paid', label: 'Оплачены' },
  { value: 'draft', label: 'Черновики' },
  { value: 'fulfilled', label: 'Выполненные' },
  { value: 'cancelled', label: 'Отменённые' }
];

interface MyOrderRow {
  id: string;
  descriptionView: string;
  totalView: string;
  statusView: ReactElement;
  actionsView: ReactElement;
}

export function MyPaymentsScreen(): ReactElement {
  const { data, loading, error } = useMyOrders();
  const [payPending, setPayPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);

  const onPay = async (id: string) => {
    setNotice(null);
    setPayError(null);
    setPayPending(true);
    try {
      const result = await payOrder(id);
      if (result.confirmationUrl) {
        window.location.href = result.confirmationUrl;
      } else {
        setNotice('Заявка на оплату отправлена');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Не удалось выполнить оплату';
      if (
        msg.toLowerCase().includes('payment_disabled') ||
        msg.toLowerCase().includes('недоступ')
      ) {
        setPayError('Онлайн-оплата временно недоступна');
      } else {
        setPayError(msg);
      }
    } finally {
      setPayPending(false);
    }
  };

  const rows: MyOrderRow[] = data.map((order) => ({
    id: order.id,
    descriptionView: order.description ?? order.id,
    totalView: `₽ ${(order.totalAmount / 100).toLocaleString('ru-RU')}`,
    statusView: <span>{ORDER_STATUS_LABELS[order.status] ?? order.status}</span>,
    actionsView:
      order.status === 'awaiting_payment' ? (
        <button
          type="button"
          className="ui-button ui-button--primary"
          onClick={() => void onPay(order.id)}
          disabled={payPending}
        >
          Оплатить
        </button>
      ) : (
        <span />
      )
  }));

  return (
    <PageContainer>
      <PageHeader title="Мои оплаты" subtitle="История ваших заказов и платежей." />

      <SectionCard title="Заказы">
        {notice ? <p className="ui-callout">{notice}</p> : null}
        {payError ? <p className="ui-callout">{payError}</p> : null}

        {loading ? <LoadingState message="Загрузка заказов…" /> : null}
        {error ? <SectionError message="Не удалось загрузить заказы" /> : null}
        {!loading && !error && rows.length === 0 ? (
          <SectionEmpty message="Заказов пока нет" hint="Здесь появятся ваши платёжные заказы" />
        ) : null}
        {!loading && !error && rows.length > 0 ? (
          <DataTable<MyOrderRow>
            columns={[
              { key: 'descriptionView', title: 'Описание' },
              { key: 'totalView', title: 'Сумма' },
              { key: 'statusView', title: 'Статус', render: (row) => row.statusView },
              { key: 'actionsView', title: 'Действия', render: (row) => row.actionsView }
            ]}
            rows={rows}
          />
        ) : null}
      </SectionCard>
    </PageContainer>
  );
}

interface OrderRow {
  id: string;
  idView: string;
  buyerView: string;
  statusView: ReactElement;
  totalView: string;
  actionsView: ReactElement;
}

interface ItemFormRow {
  groupId: string;
  learnerId: string;
  amountRubles: string;
}

const defaultItem = (): ItemFormRow => ({ groupId: '', learnerId: '', amountRubles: '' });

export function OrdersScreen(): ReactElement {
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('');
  const { data, loading, error } = useOrders(statusFilter || undefined);
  const { markPaidPending, cancelPending, createPending, markPaid, cancel, create } =
    useOrderMutations();

  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  /* Create-order form state */
  const [showForm, setShowForm] = useState(false);
  const [buyerType, setBuyerType] = useState<'learner' | 'counterparty'>('learner');
  const [buyerId, setBuyerId] = useState('');
  const [description, setDescription] = useState('');
  const [items, setItems] = useState<ItemFormRow[]>([defaultItem()]);

  const resetForm = () => {
    setBuyerType('learner');
    setBuyerId('');
    setDescription('');
    setItems([defaultItem()]);
    setShowForm(false);
  };

  const onMarkPaid = async (id: string) => {
    if (!window.confirm(`Отметить заказ ${id} как оплаченный?`)) return;
    setNotice(null);
    setActionError(null);
    try {
      await markPaid(id, { method: 'bank_transfer' });
      setNotice(`Заказ ${id} отмечен как оплаченный`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Не удалось отметить заказ оплаченным');
    }
  };

  const onCancel = async (id: string) => {
    if (!window.confirm(`Отменить заказ ${id}?`)) return;
    setNotice(null);
    setActionError(null);
    try {
      await cancel(id);
      setNotice(`Заказ ${id} отменён`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Не удалось отменить заказ');
    }
  };

  const onSubmitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    setActionError(null);
    try {
      const order = await create({
        buyerType,
        buyerId,
        ...(description ? { description } : {}),
        items: items
          .filter((it) => it.groupId && it.learnerId && it.amountRubles)
          .map((it) => ({
            groupId: it.groupId,
            learnerId: it.learnerId,
            unitAmount: Math.round(parseFloat(it.amountRubles) * 100)
          }))
      });
      setNotice(`Заказ ${order.id} создан`);
      resetForm();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Не удалось создать заказ');
    }
  };

  const rows: OrderRow[] = data.map((order) => ({
    id: order.id,
    idView: order.id,
    buyerView: `${order.buyerType === 'learner' ? 'Слушатель' : 'Контрагент'}: ${order.buyerId}`,
    statusView: <span>{ORDER_STATUS_LABELS[order.status] ?? order.status}</span>,
    totalView: `₽ ${(order.totalAmount / 100).toLocaleString('ru-RU')}`,
    actionsView: (
      <span style={{ display: 'inline-flex', gap: 8 }}>
        {order.status === 'awaiting_payment' ? (
          <button
            type="button"
            className="ui-button"
            onClick={() => void onMarkPaid(order.id)}
            disabled={markPaidPending}
          >
            Отметить оплаченным
          </button>
        ) : null}
        {order.status !== 'cancelled' && order.status !== 'fulfilled' ? (
          <button
            type="button"
            className="ui-button"
            onClick={() => void onCancel(order.id)}
            disabled={cancelPending}
          >
            Отменить
          </button>
        ) : null}
      </span>
    )
  }));

  return (
    <PageContainer>
      <PageHeader
        title="Заказы"
        subtitle="Управление платёжными заказами слушателей и контрагентов."
        actions={
          <button
            type="button"
            className={`ui-button ${showForm ? '' : 'ui-button--primary'}`}
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? 'Скрыть форму' : '+ Новый заказ'}
          </button>
        }
      />

      {showForm ? (
        <SectionCard title="Создать заказ">
          <form
            onSubmit={(e) => void onSubmitCreate(e)}
            style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span>Тип покупателя</span>
              <select
                value={buyerType}
                onChange={(e) => setBuyerType(e.target.value as 'learner' | 'counterparty')}
              >
                <option value="learner">Слушатель</option>
                <option value="counterparty">Контрагент</option>
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span>ID покупателя</span>
              <input
                type="text"
                value={buyerId}
                onChange={(e) => setBuyerId(e.target.value)}
                placeholder="UUID слушателя или контрагента"
                required
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span>Описание (необязательно)</span>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Назначение заказа"
              />
            </label>

            <div>
              <strong>Позиции заказа</strong>
              {items.map((item, idx) => (
                <div
                  key={idx}
                  style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}
                >
                  <input
                    type="text"
                    placeholder="ID группы"
                    value={item.groupId}
                    onChange={(e) => {
                      const next = [...items];
                      next[idx] = { ...next[idx]!, groupId: e.target.value };
                      setItems(next);
                    }}
                    required
                  />
                  <input
                    type="text"
                    placeholder="ID слушателя"
                    value={item.learnerId}
                    onChange={(e) => {
                      const next = [...items];
                      next[idx] = { ...next[idx]!, learnerId: e.target.value };
                      setItems(next);
                    }}
                    required
                  />
                  <input
                    type="number"
                    placeholder="Сумма (руб.)"
                    value={item.amountRubles}
                    min="0"
                    step="0.01"
                    onChange={(e) => {
                      const next = [...items];
                      next[idx] = { ...next[idx]!, amountRubles: e.target.value };
                      setItems(next);
                    }}
                    required
                  />
                  {items.length > 1 ? (
                    <button
                      type="button"
                      className="ui-button"
                      onClick={() => setItems(items.filter((_, i) => i !== idx))}
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              ))}
              <button
                type="button"
                className="ui-button"
                style={{ marginTop: 8 }}
                onClick={() => setItems([...items, defaultItem()])}
              >
                + Добавить позицию
              </button>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="submit"
                className="ui-button ui-button--primary"
                disabled={createPending}
              >
                {createPending ? 'Создаём…' : 'Создать заказ'}
              </button>
              <button type="button" className="ui-button" onClick={resetForm}>
                Отмена
              </button>
            </div>
          </form>
        </SectionCard>
      ) : null}

      <SectionCard title="Список заказов">
        <div className="ui-inline" style={{ marginBottom: 12, gap: 8 }}>
          <label className="ui-inline" style={{ gap: 4 }}>
            <span>Статус:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as OrderStatus | '')}
            >
              {STATUS_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {notice ? <p className="ui-callout">{notice}</p> : null}
        {actionError ? <SectionError message={actionError} /> : null}

        {loading ? <LoadingState message="Загрузка заказов…" /> : null}
        {error ? <SectionError message="Не удалось загрузить заказы" /> : null}
        {!loading && !error && rows.length === 0 ? (
          <SectionEmpty
            message="Заказов пока нет"
            hint="Создайте первый заказ с помощью кнопки «Новый заказ»"
          />
        ) : null}
        {!loading && !error && rows.length > 0 ? (
          <DataTable<OrderRow>
            columns={[
              { key: 'idView', title: 'ID заказа' },
              { key: 'buyerView', title: 'Покупатель' },
              { key: 'statusView', title: 'Статус', render: (row) => row.statusView },
              { key: 'totalView', title: 'Сумма' },
              { key: 'actionsView', title: 'Действия', render: (row) => row.actionsView }
            ]}
            rows={rows}
          />
        ) : null}
      </SectionCard>
    </PageContainer>
  );
}
