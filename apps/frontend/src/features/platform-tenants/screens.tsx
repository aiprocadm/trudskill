'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DataTable,
  DetailDrawer,
  Form,
  FormActions,
  LoadingState,
  PageTabs,
  SelectField,
  StatusChip,
  TabPanel,
  useConfirmDialog
} from '@trudskill/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { type PlatformPlanDto, hydrateImpersonatedSession, platformTenantsApi } from './api';
import {
  INVOICE_STATUS_LABELS,
  formatIsoDate,
  formatKopecks,
  isOverdue,
  parseRublesToKopecks
} from './invoices';
import { statusChangeRequest } from './status-confirm';
import {
  type PlatformTenantDto,
  type PlatformTenantStatus,
  TENANT_STATUS_LABELS,
  canImpersonate,
  nextStatusOptions
} from './types';
import {
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../components/state-wrappers';
import { useAuth } from '../auth/context';
import { useTabParam } from '../navigation/use-tab-param';
import { PlatformHealthSection } from '../platform-health/screens';

import type { ReactElement } from 'react';

/**
 * ФТ-D2.2 (Фаза 4 Task 3, срез 3): экраны платформенной админки тенантов.
 *
 * Доступ — только platform_admin (права platform.tenants.*). Вход «от имени»
 * ЗАМЕНЯЕТ текущую сессию сессией целевого тенанта (аудит пишется на сервере ДО
 * выдачи сессии); возврат в платформенную админку — обычный выход и вход заново.
 */

interface TenantRow {
  id: string;
  name: string;
  code: string;
  /** Назначенный тариф или «не назначен» — журнал 87. */
  planName: string;
  statusView: ReactElement;
}

/**
 * Действие называет результат, а не стрелку.
 *
 * Раньше кнопки подписывались «→ Приостановлен»: стрелка требует догадки, а название
 * состояния — не название действия (`TXT-002`).
 */
function statusActionLabel(status: PlatformTenantStatus): string {
  /* ТЗ 5.3: у архива не было своего имени — печаталось «Перевести в «В архиве»». */
  const labels: Record<string, string> = {
    active: 'Включить работу центра',
    trial: 'Перевести на пробный период',
    suspended: 'Приостановить центр',
    archived: 'Перевести центр в архив'
  };
  return labels[status] ?? `Перевести в «${TENANT_STATUS_LABELS[status] ?? status}»`;
}

/**
 * Один уровень вкладок (ТЗ 5.7 / Э7). Было пять несвязанных блоков одной лентой: реестр
 * центров, здоровье платформы, тарифы, счета аренды и форма создания центра посреди всего
 * этого. Чтобы увидеть счета, страницу прокручивали до конца (журнал 460).
 */
const TENANT_TABS = [
  { id: 'tenants', label: 'Учебные центры' },
  { id: 'health', label: 'Здоровье платформы' },
  { id: 'plans', label: 'Тарифы' },
  { id: 'invoices', label: 'Счета аренды' }
];

export function PlatformTenantsSection() {
  const { ask, dialog } = useConfirmDialog();
  const { session, adoptSession } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();

  const [tab, setTab] = useTabParam(TENANT_TABS.map((item) => item.id));
  const [createOpen, setCreateOpen] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canWrite = Boolean(session?.permissions.includes('platform.tenants.write'));
  const mayImpersonate = Boolean(session?.permissions.includes('platform.impersonate'));

  const tenantsQuery = useQuery({
    queryKey: ['platform-tenants', session?.user.id],
    enabled: Boolean(session),
    queryFn: () => platformTenantsApi.list(session!)
  });

  // ФТ-D4: тарифы для назначения арендаторам (чтение — то же право, что список тенантов).
  const plansQuery = useQuery({
    queryKey: ['platform-plans', session?.user.id],
    enabled: Boolean(session),
    queryFn: () => platformTenantsApi.listPlans(session!)
  });
  const plans = plansQuery.data ?? [];
  const [planChoice, setPlanChoice] = useState<Record<string, string>>({});
  const [planTarget, setPlanTarget] = useState<PlatformTenantDto | null>(null);

  const assignPlan = (tenant: PlatformTenantDto) => {
    const planId = planChoice[tenant.id] ?? plans[0]?.id;
    if (!planId) return;
    return run(
      () => platformTenantsApi.assignPlan(session!, tenant.id, planId),
      'Не удалось назначить тариф'
    );
  };

  const tenants = tenantsQuery.data ?? [];
  const rows: TenantRow[] = tenants.map((tenant) => ({
    id: tenant.id,
    name: tenant.name,
    code: tenant.code,
    planName: tenant.planName ?? 'не назначен',
    statusView: (
      <StatusChip
        status={tenant.status}
        label={TENANT_STATUS_LABELS[tenant.status] ?? tenant.status}
      />
    )
  }));

  const run = async (action: () => Promise<unknown>, failure: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: ['platform-tenants'] });
      await queryClient.invalidateQueries({ queryKey: ['platform-plans'] });
      await queryClient.invalidateQueries({ queryKey: ['platform-invoices'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : failure);
    } finally {
      setBusy(false);
    }
  };

  // Код попадает в URL-ы и системные идентификаторы — та же маска, что в DTO сервера.
  const codeIsValid = /^[a-z0-9][a-z0-9-]*$/.test(code) && code.length <= 40;
  const nameIsValid = name.trim().length > 0 && name.trim().length <= 200;

  const createTenant = () =>
    run(async () => {
      await platformTenantsApi.create(session!, { code, name: name.trim() });
      setCode('');
      setName('');
    }, 'Не удалось создать арендатора');

  /*
   * ТЗ 5.3 (Э3): приостановка и архив срабатывали с одного нажатия в меню строки — без диалога.
   * Диалог называет центр и последствие; архив требует ввести код центра (`statusChangeRequest`).
   */
  const changeStatus = (tenant: PlatformTenantDto, status: PlatformTenantStatus) =>
    ask(
      statusChangeRequest(tenant, status),
      () =>
        void run(
          () => platformTenantsApi.changeStatus(session!, tenant.id, status),
          'Не удалось сменить статус'
        )
    );

  // CMP-006: вход «от имени» — действие с последствиями (смена сессии + запись в аудит),
  // подтверждается диалогом приложения, а не окном браузера.
  const impersonate = (tenant: PlatformTenantDto) => {
    ask(
      {
        title: 'Войти от имени администратора центра',
        message: `Вы войдёте в кабинет «${tenant.name}». Текущая платформенная сессия завершится, действие попадёт в журнал аудита.`,
        confirmLabel: 'Войти от имени'
      },
      () => void runImpersonate(tenant)
    );
  };

  const runImpersonate = async (tenant: PlatformTenantDto) => {
    setBusy(true);
    setError(null);
    try {
      const outcome = await platformTenantsApi.impersonate(session!, tenant.id);
      const target = await hydrateImpersonatedSession(outcome.session, outcome.tenantId);
      adoptSession(target);
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось войти от имени арендатора');
      setBusy(false);
    }
  };

  return (
    <>
      {/*
        Шапка живёт здесь, а не на странице: первичное действие экрана — «Создать учебный
        центр», а знает про него только эта секция. Раньше форма создания стояла блоком
        посреди ленты, ниже тарифов и счетов (ТЗ 5.7: формы создания — в панели).
      */}
      <PageHeader
        title="Арендаторы платформы"
        subtitle="Жизненный цикл учебных центров и вход «от имени» для поддержки"
        {...(canWrite
          ? {
              primaryAction: {
                label: 'Создать учебный центр',
                onSelect: () => setCreateOpen(true)
              }
            }
          : {})}
      />

      <PageTabs tabs={TENANT_TABS} activeId={tab} onSelect={setTab} label="Разделы платформы" />

      <TabPanel id="tenants" activeId={tab}>
        <SectionCard title="Арендаторы платформы">
          <p className="ui-text-muted">
            Все учебные центры платформы: статус жизненного цикла, перевод между статусами и вход
            «от имени» администратора центра. Каждый вход «от имени» пишется в журнал действий того
            центра, куда вошли.
          </p>

          {tenantsQuery.error ? <SectionError error={tenantsQuery.error} /> : null}
          {error ? <SectionError message={error} /> : null}
          {tenantsQuery.isLoading ? <LoadingState message="Загрузка арендаторов…" /> : null}

          {!tenantsQuery.isLoading && rows.length ? (
            <DataTable<TenantRow>
              columns={[
                { key: 'name', title: 'Учебный центр' },
                { key: 'code', title: 'Код в адресах' },
                {
                  key: 'planName',
                  title: 'Тариф',
                  /* Журнал 87: тариф назначается на этом экране — значит и виден должен быть здесь. */
                  render: (row) => row.planName
                },
                { key: 'statusView', title: 'Статус', render: (row) => row.statusView }
              ]}
              rows={rows}
              rowKey={(row) => row.id}
              rowActions={(row) => {
                const tenant = tenants.find((x) => x.id === row.id);
                if (!tenant) return [];
                return [
                  ...(canWrite
                    ? nextStatusOptions(tenant.status).map((status) => ({
                        label: statusActionLabel(status),
                        /* Приостановка и закрытие — опасные: центр перестаёт работать. */
                        danger: status !== 'active',
                        disabled: busy,
                        onSelect: () => void changeStatus(tenant, status)
                      }))
                    : []),
                  ...(canWrite && plans.length > 0
                    ? [
                        {
                          label: 'Сменить тариф',
                          disabled: busy,
                          onSelect: () => setPlanTarget(tenant)
                        }
                      ]
                    : []),
                  ...(mayImpersonate && canImpersonate(tenant.status)
                    ? [
                        {
                          label: 'Войти от имени',
                          disabled: busy,
                          onSelect: () => impersonate(tenant)
                        }
                      ]
                    : [])
                ];
              }}
            />
          ) : null}
          {!tenantsQuery.isLoading && !tenantsQuery.error && !rows.length ? (
            <SectionEmpty
              message="Арендаторов пока нет"
              hint="Арендатор — учебный центр, работающий на платформе. Его заводят при подключении по договору."
            />
          ) : null}
        </SectionCard>

        <DetailDrawer
          open={planTarget !== null}
          onClose={() => setPlanTarget(null)}
          title="Тариф центра"
          subtitle={planTarget?.name ?? ''}
        >
          <SelectField
            label="Тариф"
            hint="Тариф задаёт лимиты: сколько слушателей в месяц, сколько сотрудников, сколько места под файлы"
            value={planTarget ? (planChoice[planTarget.id] ?? plans[0]?.id ?? '') : ''}
            onChange={(event) =>
              planTarget
                ? setPlanChoice((prev) => ({ ...prev, [planTarget.id]: event.target.value }))
                : undefined
            }
            options={plans.map((plan) => ({ value: plan.id, label: plan.name }))}
          />
          <FormActions>
            <button
              type="button"
              className="ui-button-primary"
              disabled={busy}
              onClick={() => {
                if (!planTarget) return;
                const target = planTarget;
                setPlanTarget(null);
                void assignPlan(target);
              }}
            >
              Назначить тариф
            </button>
            <button type="button" className="ui-button" onClick={() => setPlanTarget(null)}>
              Отмена
            </button>
          </FormActions>
        </DetailDrawer>
      </TabPanel>

      <TabPanel id="health" activeId={tab}>
        <PlatformHealthSection />
      </TabPanel>

      <TabPanel id="plans" activeId={tab}>
        {canWrite ? (
          <PlatformPlansSection busy={busy} plans={plans} run={run} />
        ) : (
          <SectionEmpty
            message="Тарифы доступны только владельцу платформы"
            hint="Вам открыт просмотр центров и их здоровья."
          />
        )}
      </TabPanel>

      <TabPanel id="invoices" activeId={tab}>
        {canWrite ? (
          <RentalInvoicesSection busy={busy} tenants={tenants} run={run} />
        ) : (
          <SectionEmpty
            message="Счета аренды доступны только владельцу платформы"
            hint="Вам открыт просмотр центров и их здоровья."
          />
        )}
      </TabPanel>

      {/*
        ТЗ 5.7: форма создания — в боковой панели, а не блоком внизу ленты. Незакрытая
        панель с введённым кодом предупреждает о потере (CMP-005).
      */}
      <DetailDrawer
        open={createOpen}
        title="Новый учебный центр"
        hasUnsavedChanges={code.trim().length > 0 || name.trim().length > 0}
        onClose={() => setCreateOpen(false)}
      >
        <Form>
          <p className="ui-hint">
            Код — латиница, цифры и дефис (попадает в системные идентификаторы). Новый центр
            создаётся в статусе «Пробный» и получает стандартный набор ролей центра.
          </p>
          <label className="ui-field">
            <span className="ui-field-label">Код</span>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="my-center"
              maxLength={40}
            />
          </label>
          <label className="ui-field">
            <span className="ui-field-label">Название</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Учебный центр «Пример»"
              maxLength={200}
            />
          </label>
          <FormActions>
            <button type="button" className="ui-button" onClick={() => setCreateOpen(false)}>
              Отмена
            </button>
            <button
              type="button"
              className="ui-button ui-button--primary"
              disabled={busy || !codeIsValid || !nameIsValid}
              onClick={() =>
                void createTenant().then(() => {
                  setCreateOpen(false);
                })
              }
            >
              Создать учебный центр
            </button>
          </FormActions>
        </Form>
      </DetailDrawer>
      {dialog}
    </>
  );
}

/**
 * ФТ-D4: тарифы платформы — список и создание. Байты в форме вводятся гигабайтами:
 * владелец платформы думает в ГБ, а не в 53687091200.
 */
function PlatformPlansSection({
  busy,
  plans,
  run
}: {
  busy: boolean;
  plans: PlatformPlanDto[];
  run: (action: () => Promise<unknown>, failure: string) => Promise<void>;
}) {
  const { session } = useAuth();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [learners, setLearners] = useState('');
  const [staff, setStaff] = useState('');
  const [storageGb, setStorageGb] = useState('');
  const [flags, setFlags] = useState({
    proctoring: false,
    scorm: false,
    api: false,
    webinars: false
  });

  const codeIsValid = /^[a-z0-9][a-z0-9-]*$/.test(code) && code.length <= 40;
  const toInt = (value: string) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : undefined;
  };

  const createPlan = () =>
    run(async () => {
      const storage = toInt(storageGb);
      await platformTenantsApi.createPlan(session!, {
        code,
        name: name.trim(),
        ...(toInt(learners) ? { activeLearnersLimit: toInt(learners)! } : {}),
        ...(toInt(staff) ? { staffLimit: toInt(staff)! } : {}),
        ...(storage ? { storageLimitBytes: storage * 1024 ** 3 } : {}),
        ...flags
      });
      setCode('');
      setName('');
      setLearners('');
      setStaff('');
      setStorageGb('');
    }, 'Не удалось создать тариф');

  const limitText = (plan: PlatformPlanDto) =>
    [
      plan.activeLearnersLimit !== null ? `${plan.activeLearnersLimit} слушателей/мес` : null,
      plan.staffLimit !== null ? `${plan.staffLimit} сотрудников` : null,
      plan.storageLimitBytes !== null
        ? `${(plan.storageLimitBytes / 1024 ** 3).toFixed(0)} ГБ`
        : null
    ]
      .filter(Boolean)
      .join(', ') || 'без лимитов';

  return (
    <SectionCard title="Тарифы платформы">
      {plans.length ? (
        <DataTable
          columns={[
            { key: 'name', title: 'Название' },
            { key: 'limitsTitle', title: 'Что входит' }
          ]}
          rows={plans.map((plan) => ({
            id: plan.id,
            name: plan.name,
            /* Код тарифа («basic_2024») в скобках рядом с названием убран: он системный. */
            limitsTitle: limitText(plan)
          }))}
          rowKey={(row) => row.id}
        />
      ) : (
        <SectionEmpty
          message="Тарифов пока нет"
          hint="Тариф задаёт лимиты центра: сколько слушателей в месяц, сотрудников и места под файлы. Создайте первый в форме ниже."
        />
      )}
      <div className="ui-inline">
        <label>
          Код
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="basic" />
        </label>
        <label>
          Название
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Базовый" />
        </label>
        <label>
          Слушателей/мес
          <input value={learners} onChange={(e) => setLearners(e.target.value)} placeholder="∞" />
        </label>
        <label>
          Сотрудников
          <input value={staff} onChange={(e) => setStaff(e.target.value)} placeholder="∞" />
        </label>
        <label>
          Хранилище, ГБ
          <input value={storageGb} onChange={(e) => setStorageGb(e.target.value)} placeholder="∞" />
        </label>
        {(Object.keys(flags) as (keyof typeof flags)[]).map((key) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={flags[key]}
              onChange={(e) => setFlags((prev) => ({ ...prev, [key]: e.target.checked }))}
            />
            {{ proctoring: 'Прокторинг', scorm: 'SCORM', api: 'API', webinars: 'Вебинары' }[key]}
          </label>
        ))}
        <button
          type="button"
          disabled={busy || !codeIsValid || name.trim().length === 0}
          onClick={() => void createPlan()}
        >
          Создать тариф
        </button>
      </div>
    </SectionCard>
  );
}

/**
 * ФТ-D5.1: счета аренды — выставление, список, отметка оплаты.
 * Grace и приостановку за неоплату считает сервер; интерфейс лишь подсвечивает просрочку.
 */
function RentalInvoicesSection({
  busy,
  tenants,
  run
}: {
  busy: boolean;
  tenants: PlatformTenantDto[];
  run: (action: () => Promise<unknown>, failure: string) => Promise<void>;
}) {
  const { session } = useAuth();
  const invoicesQuery = useQuery({
    queryKey: ['platform-invoices', session?.user.id],
    enabled: Boolean(session),
    queryFn: () => platformTenantsApi.listInvoices(session!)
  });
  const invoices = invoicesQuery.data ?? [];
  const today = new Date().toISOString().slice(0, 10);

  const [tenantId, setTenantId] = useState('');
  const [number, setNumber] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [amount, setAmount] = useState('');
  const [dueAt, setDueAt] = useState('');

  const amountKopecks = parseRublesToKopecks(amount);
  const targetTenant = tenantId || tenants[0]?.id || '';
  const formIsValid =
    Boolean(targetTenant) &&
    number.trim().length > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(periodStart) &&
    /^\d{4}-\d{2}-\d{2}$/.test(periodEnd) &&
    periodEnd >= periodStart &&
    amountKopecks !== null;

  const issue = () =>
    run(async () => {
      await platformTenantsApi.issueInvoice(session!, {
        tenantId: targetTenant,
        number: number.trim(),
        periodStart,
        periodEnd,
        amountKopecks: amountKopecks!,
        ...(dueAt ? { dueAt } : {})
      });
      setNumber('');
      setAmount('');
    }, 'Не удалось выставить счёт');

  const markPaid = (invoiceId: string) =>
    run(
      () => platformTenantsApi.markInvoicePaid(session!, invoiceId),
      'Не удалось отметить оплату'
    );

  const tenantName = (id: string) => tenants.find((t) => t.id === id)?.name ?? id;

  return (
    <SectionCard title="Счета аренды">
      <p className="ui-text-muted">
        Счёт «счёт + акт»: печатная форма собирается нашим движком, оплата отмечается вручную после
        поступления средств. Неоплата дольше отсрочки тарифа приостанавливает кабинет — это делает
        сервер, ежедневно.
      </p>

      {invoicesQuery.isLoading ? <LoadingState message="Загрузка счетов…" /> : null}
      {invoicesQuery.error ? <SectionError error={invoicesQuery.error} /> : null}

      {!invoicesQuery.isLoading && invoices.length ? (
        <DataTable
          columns={[
            { key: 'number', title: 'Номер' },
            { key: 'tenantTitle', title: 'Учебный центр' },
            { key: 'periodTitle', title: 'Период' },
            { key: 'amountTitle', title: 'Сумма' },
            { key: 'dueTitle', title: 'Оплатить до' },
            { key: 'statusTitle', title: 'Статус' }
          ]}
          rows={invoices.map((item) => ({
            ...item,
            tenantTitle: tenantName(item.tenantId),
            periodTitle: `${formatIsoDate(item.periodStart)} — ${formatIsoDate(item.periodEnd)}`,
            amountTitle: formatKopecks(item.amountKopecks, item.currency),
            dueTitle: formatIsoDate(item.dueAt),
            statusTitle: isOverdue(item, today)
              ? `${INVOICE_STATUS_LABELS[item.status]} — просрочен`
              : INVOICE_STATUS_LABELS[item.status]
          }))}
          rowKey={(row) => row.id}
          /*
           * Отметка оплаты жила ОТДЕЛЬНЫМ списком под таблицей: каждый неоплаченный счёт
           * выводился второй раз строкой с кнопкой. Действие переехало в строку — счёт
           * называется один раз, как в реестре пользователей после среза 17.
           */
          rowActions={(row) =>
            row.status === 'issued'
              ? [
                  {
                    label: 'Отметить оплаченным',
                    disabled: busy,
                    onSelect: () => void markPaid(row.id)
                  }
                ]
              : []
          }
        />
      ) : null}
      {!invoicesQuery.isLoading && !invoicesQuery.error && !invoices.length ? (
        <SectionEmpty
          message="Счетов пока нет"
          hint="Счёт за аренду выставляется по тарифу центра — первый появится после начала расчётного периода."
        />
      ) : null}

      <div className="ui-inline">
        <label>
          Арендатор
          <select value={targetTenant} onChange={(e) => setTenantId(e.target.value)}>
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Номер счёта
          <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="СЧ-1" />
        </label>
        <label>
          Период с
          <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
        </label>
        <label>
          по
          <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
        </label>
        <label>
          Сумма, ₽
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="15 000" />
        </label>
        <label>
          Оплатить до
          <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
        </label>
        <button type="button" disabled={busy || !formIsValid} onClick={() => void issue()}>
          Выставить счёт
        </button>
      </div>
    </SectionCard>
  );
}
