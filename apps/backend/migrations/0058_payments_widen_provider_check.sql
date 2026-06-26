-- apps/backend/migrations/0058_payments_widen_provider_check.sql
-- Phase 7 fix — widen payments.payments.provider CHECK to the full shipped acquirer set.
--
-- 0054 created `provider text not null check (provider in ('manual','noop','fake','yookassa'))`,
-- but the provider registry (payments.module.ts) ships FOUR live acquirer adapters:
-- yookassa / tinkoff / cloudpayments / robokassa. PaymentsService.createPayment writes
-- provider = provider.code, so any payment recorded through tinkoff/cloudpayments/robokassa
-- violated payments_provider_check on real Postgres. The in-memory repository has no CHECK,
-- so every unit test passed — the bug was latent until a real (non-yookassa) acquirer payment.

-- Drop the existing provider check by its real name (resolve it rather than assume the
-- auto-generated name), then re-add the widened one. Idempotent: re-running drops the
-- widened constraint and re-adds it.
do $$
declare
  v_conname text;
begin
  select conname
    into v_conname
    from pg_constraint
   where conrelid = 'payments.payments'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%provider%';
  if v_conname is not null then
    execute format('alter table payments.payments drop constraint %I', v_conname);
  end if;
end $$;

alter table payments.payments
  add constraint payments_provider_check
  check (provider in ('manual', 'noop', 'fake', 'yookassa', 'tinkoff', 'cloudpayments', 'robokassa'));
