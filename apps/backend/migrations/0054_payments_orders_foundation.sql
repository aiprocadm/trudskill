-- 0054_payments_orders_foundation.sql
-- Phase 7 — payment provider seam (dormant foundation).
-- Durable order/payment domain. All amounts are integer kopecks. buyer_id is a soft reference
-- (no FK to the crm stub). Permissions payments.read / payments.write / payments.self_purchase.

create schema if not exists payments;

create table if not exists payments.orders (
  id text primary key,
  tenant_id text not null,
  buyer_type text not null check (buyer_type in ('learner', 'counterparty')),
  buyer_id text not null,
  status text not null default 'awaiting_payment'
    check (status in ('draft', 'awaiting_payment', 'paid', 'fulfilled', 'cancelled')),
  currency text not null default 'RUB',
  total_amount bigint not null check (total_amount >= 0),
  description text null,
  created_by text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payments_orders_tenant_status
  on payments.orders (tenant_id, status);
create index if not exists idx_payments_orders_tenant_buyer
  on payments.orders (tenant_id, buyer_type, buyer_id);

create table if not exists payments.order_items (
  id text primary key,
  tenant_id text not null,
  order_id text not null references payments.orders (id) on delete cascade,
  group_id text not null,
  learner_id text not null,
  unit_amount bigint not null check (unit_amount >= 0),
  fulfillment_status text not null default 'pending'
    check (fulfillment_status in ('pending', 'enrolled', 'skipped')),
  enrollment_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payments_order_items_order
  on payments.order_items (order_id);

create table if not exists payments.payments (
  id text primary key,
  tenant_id text not null,
  order_id text not null references payments.orders (id) on delete cascade,
  provider text not null check (provider in ('manual', 'noop', 'fake', 'yookassa')),
  provider_payment_id text null,
  method text not null check (method in ('manual', 'bank_transfer', 'card')),
  status text not null default 'pending'
    check (status in ('pending', 'succeeded', 'failed', 'cancelled', 'refunded')),
  amount bigint not null check (amount >= 0),
  confirmation_url text null,
  paid_at timestamptz null,
  idempotency_key text null,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_payments_provider_payment_id
  on payments.payments (provider_payment_id)
  where provider_payment_id is not null;
create index if not exists idx_payments_payments_order
  on payments.payments (order_id);

insert into iam.permissions (id, code, description)
values
  ('p_payments_read', 'payments.read', 'Read orders and payments'),
  ('p_payments_write', 'payments.write', 'Create/cancel orders, mark paid (manual)'),
  ('p_payments_self_purchase', 'payments.self_purchase', 'Learner creates/pays/views own order')
on conflict (id) do nothing;

insert into iam.role_permissions (id, tenant_id, role_id, permission_id)
select
  concat('rp_', r.id, '_', p.id),
  r.tenant_id,
  r.id,
  p.id
from iam.roles r
join iam.permissions p on true
where r.tenant_id = 'tenant_demo'
  and (
    (r.code in ('platform_admin', 'tenant_admin') and p.code in ('payments.read', 'payments.write'))
    or (r.code = 'learner' and p.code = 'payments.self_purchase')
  )
on conflict (tenant_id, role_id, permission_id) do nothing;
