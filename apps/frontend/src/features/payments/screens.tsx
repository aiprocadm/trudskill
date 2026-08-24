'use client';

import {
  DataTable,
  DetailDrawer,
  FilterBar,
  Form,
  FormActions,
  ListPage,
  LoadingState,
  useConfirmDialog
} from '@trudskill/ui';
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
import { ClientSelect, GroupSelect } from '../groups/group-picker';
import { useLearnersList } from '../learners/hooks';
import { LearnerSelect } from '../learners/learner-picker';
import { useCounterpartiesList } from '../mvp/hooks';

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
  buyerView: string;
  kindView: string;
  statusView: string;
  totalView: string;
  status: string;
}

interface ItemFormRow {
  groupId: string;
  learnerId: string;
  amountRubles: string;
}

const defaultItem = (): ItemFormRow => ({ groupId: '', learnerId: '', amountRubles: '' });

/*
 * TPL-001 (Фаза 4, срез 16, волна 3). Что изменилось:
 *
 * 1. **Кнопка переименовывалась по ходу сценария**: «+ Новый заказ» ↔ «Скрыть форму»
 *    (`TXT-003` это запрещает). Форма открывалась прямо на странице и сдвигала список.
 *    Теперь действие называется одинаково всегда, а форма — панель.
 * 2. **Три поля с идентификаторами**: «UUID слушателя или контрагента», «ID группы»,
 *    «ID слушателя» в каждой позиции. Взять их человеку было неоткуда.
 * 3. Покупатель в таблице показывался как «Слушатель: 3f7a…», колонка «ID заказа» —
 *    идентификатором. Теперь имя и название компании, а заказ опознаётся по покупателю
 *    и описанию.
 * 4. Действия строки — через `rowActions`, а не кнопками внутри ячейки.
 */
export function OrdersScreen(): ReactElement {
  const { ask, dialog } = useConfirmDialog();
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('');
  const { data, loading, error } = useOrders(statusFilter || undefined);
  const { markPaidPending, cancelPending, createPending, markPaid, cancel, create } =
    useOrderMutations();

  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [buyerType, setBuyerType] = useState<'learner' | 'counterparty'>('learner');
  const [buyerId, setBuyerId] = useState('');
  const [description, setDescription] = useState('');
  const [items, setItems] = useState<ItemFormRow[]>([defaultItem()]);

  const learners = useLearnersList({ page: 1, pageSize: 100 });
  const companies = useCounterpartiesList({ page: 1, page_size: 100 });

  const learnerName = new Map(
    (learners.data?.items ?? []).map((item) => [
      item.id,
      `${item.lastName} ${item.firstName}`.trim()
    ])
  );
  const companyName = new Map((companies.data?.items ?? []).map((item) => [item.id, item.name]));

  /** Покупатель — именем, а не «Слушатель: 3f7a…». */
  const buyerLabel = (type: string, id: string): string => {
    const name = type === 'learner' ? learnerName.get(id) : companyName.get(id);
    return name ?? 'нет в справочнике';
  };

  const resetForm = () => {
    setBuyerType('learner');
    setBuyerId('');
    setDescription('');
    setItems([defaultItem()]);
    setShowForm(false);
  };

  // CMP-006: подтверждение — диалог приложения. Деньги подтверждают осознанно,
  // а окно браузера человек закрывает на автомате.
  const runMarkPaid = async (id: string, label: string) => {
    setNotice(null);
    setActionError(null);
    try {
      await markPaid(id, { method: 'bank_transfer' });
      setNotice(`Заказ покупателя «${label}» отмечен как оплаченный`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Не удалось отметить заказ оплаченным');
    }
  };

  const onMarkPaid = (id: string, label: string) => {
    ask(
      {
        title: 'Отметить заказ оплаченным',
        message: `Заказ покупателя «${label}» будет считаться оплаченным. Отметка попадёт в журнал.`,
        confirmLabel: 'Отметить оплаченным'
      },
      () => void runMarkPaid(id, label)
    );
  };

  const runCancel = async (id: string, label: string) => {
    setNotice(null);
    setActionError(null);
    try {
      await cancel(id);
      setNotice(`Заказ покупателя «${label}» отменён`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Не удалось отменить заказ');
    }
  };

  const onCancel = (id: string, label: string) => {
    ask(
      {
        title: 'Отменить заказ',
        message: `Заказ покупателя «${label}» будет отменён. Отменённый заказ нельзя вернуть.`,
        confirmLabel: 'Отменить заказ',
        cancelLabel: 'Оставить как есть',
        tone: 'danger'
      },
      () => void runCancel(id, label)
    );
  };

  const onSubmitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    setActionError(null);
    try {
      await create({
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
      setNotice(`Заказ покупателя «${buyerLabel(buyerType, buyerId)}» создан`);
      resetForm();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Не удалось создать заказ');
    }
  };

  const rows: OrderRow[] = data.map((order) => ({
    id: order.id,
    buyerView: buyerLabel(order.buyerType, order.buyerId),
    kindView: order.buyerType === 'learner' ? 'Слушатель' : 'Компания',
    statusView: ORDER_STATUS_LABELS[order.status] ?? order.status,
    totalView: `${(order.totalAmount / 100).toLocaleString('ru-RU')} ₽`,
    status: order.status
  }));

  const canSubmit =
    Boolean(buyerId) && items.some((it) => it.groupId && it.learnerId && it.amountRubles);

  return (
    <PageContainer>
      <PageHeader
        title="Заказы"
        subtitle="Счета за обучение: кто платит, за кого и сколько"
        /* TXT-003: кнопка называется одинаково всегда, а не «Скрыть форму» через раз. */
        /* UI-007: открытая форма забирает первичное действие себе. */
        {...(showForm
          ? {}
          : { primaryAction: { label: 'Создать заказ', onSelect: () => setShowForm(true) } })}
      />

      {notice ? <p className="ui-callout ui-callout--success">{notice}</p> : null}
      {actionError ? <SectionError message={actionError} /> : null}

      <FilterBar
        primary={
          <label className="ui-field">
            <span className="ui-field-label">Статус</span>
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
        }
      />

      <ListPage<OrderRow>
        columns={[
          { key: 'buyerView', title: 'Покупатель' },
          { key: 'kindView', title: 'Кто платит' },
          { key: 'statusView', title: 'Статус' },
          { key: 'totalView', title: 'Сумма' }
        ]}
        rows={rows}
        isLoading={loading}
        error={error ? new Error('Не удалось загрузить заказы') : undefined}
        rowKey={(row) => row.id}
        rowActions={(row) => [
          ...(row.status === 'awaiting_payment'
            ? [
                {
                  label: 'Отметить оплаченным',
                  disabled: markPaidPending,
                  onSelect: () => onMarkPaid(row.id, row.buyerView)
                }
              ]
            : []),
          ...(row.status !== 'cancelled' && row.status !== 'fulfilled'
            ? [
                {
                  label: 'Отменить заказ',
                  danger: true,
                  disabled: cancelPending,
                  onSelect: () => onCancel(row.id, row.buyerView)
                }
              ]
            : [])
        ]}
        emptyMessage="Здесь появятся заказы"
        emptyHint="Заказ — счёт за обучение: за кого платят, по какой группе и на какую сумму. Его выставляют слушателю или компании-заказчику."
        emptyAction={{ label: 'Создать первый заказ', onSelect: () => setShowForm(true) }}
      />

      {showForm ? (
        <DetailDrawer
          open={true}
          title="Новый заказ"
          width="md"
          hasUnsavedChanges={Boolean(buyerId || description)}
          onClose={resetForm}
        >
          <Form onSubmit={(e) => void onSubmitCreate(e)} noValidate>
            <label className="ui-field">
              <span className="ui-field-label">Кто платит</span>
              <select
                value={buyerType}
                onChange={(e) => {
                  setBuyerType(e.target.value as 'learner' | 'counterparty');
                  setBuyerId('');
                }}
              >
                <option value="learner">Слушатель сам за себя</option>
                <option value="counterparty">Компания за сотрудников</option>
              </select>
            </label>

            {/* Было поле «UUID слушателя или контрагента» — теперь выбор по имени. */}
            {buyerType === 'learner' ? (
              <LearnerSelect value={buyerId} onChange={setBuyerId} label="Плательщик" required />
            ) : (
              <ClientSelect
                value={buyerId}
                onChange={setBuyerId}
                label="Компания-плательщик"
                emptyLabel="— выберите компанию —"
              />
            )}

            <label className="ui-field">
              <span className="ui-field-label">Назначение (по желанию)</span>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <p className="ui-field-hint">Например: «Обучение по охране труда, март».</p>
            </label>

            <h3 className="ui-subheading">За кого платим</h3>
            {items.map((item, idx) => (
              <div key={idx} className="ui-stack">
                <GroupSelect
                  value={item.groupId}
                  onChange={(groupId) => {
                    const next = [...items];
                    next[idx] = { ...next[idx]!, groupId };
                    setItems(next);
                  }}
                  label="Учебная группа"
                  emptyLabel="— выберите группу —"
                />
                <LearnerSelect
                  value={item.learnerId}
                  onChange={(learnerId) => {
                    const next = [...items];
                    next[idx] = { ...next[idx]!, learnerId };
                    setItems(next);
                  }}
                />
                <label className="ui-field">
                  <span className="ui-field-label">Сумма, ₽</span>
                  <input
                    type="number"
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
                </label>
                {items.length > 1 ? (
                  <button
                    type="button"
                    className="ui-button-link"
                    onClick={() => setItems(items.filter((_, i) => i !== idx))}
                  >
                    Убрать этого слушателя
                  </button>
                ) : null}
              </div>
            ))}
            <button
              type="button"
              className="ui-button-secondary"
              onClick={() => setItems([...items, defaultItem()])}
            >
              Добавить ещё слушателя
            </button>

            <FormActions>
              <button type="button" className="ui-button-link" onClick={resetForm}>
                Отмена
              </button>
              <button
                type="submit"
                className={`ui-button--primary ${createPending ? 'ui-button--loading' : ''}`}
                disabled={createPending || !canSubmit}
              >
                {/* TXT-003: подпись не меняется по ходу — занятость показывает класс загрузки. */}
                Создать заказ
              </button>
            </FormActions>
          </Form>
        </DetailDrawer>
      ) : null}
      {dialog}
    </PageContainer>
  );
}
