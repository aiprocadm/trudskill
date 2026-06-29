-- apps/backend/migrations/0059_payments_idempotency_key_unique.sql
-- §5.160 — enforce payment idempotency at the DB level.
--
-- PaymentsService.markPaid writes a payment with idempotency_key = 'manual:<orderId>', and the
-- webhook/online paths set provider-event-derived keys, but payments.payments had a unique index
-- only on provider_payment_id. Two concurrent mark-paid requests both pass the non-atomic
-- assertOrderTransition check and both INSERT a 'succeeded' manual payment row → double-counted
-- revenue in any payment/analytics rollup. The in-memory repo now dedups by (tenant, key); this
-- index makes the same guarantee on real Postgres and lets createPayment use ON CONFLICT.
--
-- Partial (idempotency_key IS NOT NULL): legacy/online payments may carry a null key and must not
-- collide. Idempotent via `if not exists`. (Assumes no pre-existing duplicate keys — true pre-pilot.)

create unique index if not exists payments_payments_tenant_idempotency_key_uidx
  on payments.payments (tenant_id, idempotency_key)
  where idempotency_key is not null;
