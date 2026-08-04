'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DataTable, LoadingState } from '@trudskill/ui';
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
import {
  type PlatformTenantDto,
  type PlatformTenantStatus,
  TENANT_STATUS_LABELS,
  canImpersonate,
  nextStatusOptions
} from './types';
import { SectionCard, SectionEmpty, SectionError } from '../../components/state-wrappers';
import { useAuth } from '../auth/context';
import { PlatformHealthSection } from '../platform-health/screens';

/**
 * ФТ-D2.2 (Фаза 4 Task 3, срез 3): экраны платформенной админки тенантов.
 *
 * Доступ — только platform_admin (права platform.tenants.*). Вход «от имени»
 * ЗАМЕНЯЕТ текущую сессию сессией целевого тенанта (аудит пишется на сервере ДО
 * выдачи сессии); возврат в платформенную админку — обычный выход и вход заново.
 */

export function PlatformTenantsSection() {
  const { session, adoptSession } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();

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

  const assignPlan = (tenant: PlatformTenantDto) => {
    const planId = planChoice[tenant.id] ?? plans[0]?.id;
    if (!planId) return;
    return run(
      () => platformTenantsApi.assignPlan(session!, tenant.id, planId),
      'Не удалось назначить тариф'
    );
  };

  const tenants = tenantsQuery.data ?? [];
  const rows = tenants.map((tenant) => ({
    ...tenant,
    statusTitle: TENANT_STATUS_LABELS[tenant.status] ?? tenant.status
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

  const changeStatus = (tenant: PlatformTenantDto, status: PlatformTenantStatus) =>
    run(
      () => platformTenantsApi.changeStatus(session!, tenant.id, status),
      'Не удалось сменить статус'
    );

  const impersonate = async (tenant: PlatformTenantDto) => {
    if (
      !window.confirm(
        `Войти в кабинет «${tenant.name}» от имени его администратора? ` +
          'Текущая платформенная сессия завершится, действие попадёт в аудит.'
      )
    ) {
      return;
    }
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
      <SectionCard title="Арендаторы платформы">
        <p className="ui-text-muted">
          Все учебные центры платформы: статус жизненного цикла, перевод между статусами и вход «от
          имени» администратора центра. Каждый вход «от имени» пишется в аудит целевого тенанта.
        </p>

        {tenantsQuery.error ? (
          <SectionError
            message={
              tenantsQuery.error instanceof Error
                ? tenantsQuery.error.message
                : 'Не удалось загрузить арендаторов'
            }
          />
        ) : null}
        {error ? <SectionError message={error} /> : null}
        {tenantsQuery.isLoading ? <LoadingState message="Загрузка арендаторов…" /> : null}

        {!tenantsQuery.isLoading && rows.length ? (
          <DataTable
            columns={[
              { key: 'code', title: 'Код' },
              { key: 'name', title: 'Название' },
              { key: 'statusTitle', title: 'Статус' }
            ]}
            rows={rows}
          />
        ) : null}
        {!tenantsQuery.isLoading && !tenantsQuery.error && !rows.length ? (
          <SectionEmpty message="Арендаторов пока нет" />
        ) : null}

        {tenants.map((tenant) => (
          <div key={tenant.id} className="ui-inline">
            <span>
              {tenant.name} ({TENANT_STATUS_LABELS[tenant.status] ?? tenant.status}):
            </span>
            {canWrite
              ? nextStatusOptions(tenant.status).map((status) => (
                  <button
                    key={status}
                    type="button"
                    disabled={busy}
                    onClick={() => void changeStatus(tenant, status)}
                  >
                    → {TENANT_STATUS_LABELS[status]}
                  </button>
                ))
              : null}
            {mayImpersonate && canImpersonate(tenant.status) ? (
              <button type="button" disabled={busy} onClick={() => void impersonate(tenant)}>
                Войти от имени
              </button>
            ) : null}
            {canWrite && plans.length > 0 ? (
              <>
                <select
                  value={planChoice[tenant.id] ?? plans[0]!.id}
                  onChange={(event) =>
                    setPlanChoice((prev) => ({ ...prev, [tenant.id]: event.target.value }))
                  }
                >
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name}
                    </option>
                  ))}
                </select>
                <button type="button" disabled={busy} onClick={() => void assignPlan(tenant)}>
                  Назначить тариф
                </button>
              </>
            ) : null}
          </div>
        ))}
      </SectionCard>

      <PlatformHealthSection />

      {canWrite ? <PlatformPlansSection busy={busy} plans={plans} run={run} /> : null}

      {canWrite ? <RentalInvoicesSection busy={busy} tenants={tenants} run={run} /> : null}

      {canWrite ? (
        <SectionCard title="Новый арендатор">
          <p className="ui-text-muted">
            Код — латиница, цифры и дефис (попадает в системные идентификаторы). Новый арендатор
            создаётся в статусе «Пробный» и получает стандартный набор ролей центра.
          </p>
          <div className="ui-inline">
            <label>
              Код
              <input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="my-center"
                maxLength={40}
              />
            </label>
            <label>
              Название
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Учебный центр «Пример»"
                maxLength={200}
              />
            </label>
            <button
              type="button"
              disabled={busy || !codeIsValid || !nameIsValid}
              onClick={() => void createTenant()}
            >
              Создать
            </button>
          </div>
        </SectionCard>
      ) : null}
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
        <ul>
          {plans.map((plan) => (
            <li key={plan.id}>
              <strong>{plan.name}</strong> ({plan.code}): {limitText(plan)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="ui-text-muted">Тарифов пока нет — создайте первый.</p>
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
      {invoicesQuery.error ? (
        <SectionError
          message={
            invoicesQuery.error instanceof Error
              ? invoicesQuery.error.message
              : 'Не удалось загрузить счета'
          }
        />
      ) : null}

      {!invoicesQuery.isLoading && invoices.length ? (
        <DataTable
          columns={[
            { key: 'number', title: '№' },
            { key: 'tenantTitle', title: 'Арендатор' },
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
              ? `${INVOICE_STATUS_LABELS[item.status]} (просрочен)`
              : INVOICE_STATUS_LABELS[item.status]
          }))}
        />
      ) : null}
      {!invoicesQuery.isLoading && !invoicesQuery.error && !invoices.length ? (
        <SectionEmpty message="Счетов пока нет" />
      ) : null}

      {invoices
        .filter((item) => item.status === 'issued')
        .map((item) => (
          <div key={item.id} className="ui-inline">
            <span>
              Счёт {item.number} ({tenantName(item.tenantId)}):
            </span>
            <button type="button" disabled={busy} onClick={() => void markPaid(item.id)}>
              Отметить оплаченным
            </button>
          </div>
        ))}

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
