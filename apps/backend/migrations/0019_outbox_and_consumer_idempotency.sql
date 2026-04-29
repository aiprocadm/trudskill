create table if not exists core.outbox_events (
  id uuid primary key,
  event_type text not null,
  exchange text not null,
  routing_key text not null,
  payload_json jsonb not null,
  headers_json jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'published', 'failed')),
  retry_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  claimed_by text,
  last_error text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists outbox_events_pending_idx
  on core.outbox_events (status, next_attempt_at, created_at)
  where status = 'pending';

create index if not exists outbox_events_claim_idx
  on core.outbox_events (claimed_by, locked_at)
  where claimed_by is not null;

create table if not exists core.processed_message_ids (
  consumer_name text not null,
  message_id text not null,
  queue_name text not null,
  processed_at timestamptz not null default now(),
  primary key (consumer_name, message_id)
);

create index if not exists processed_message_ids_queue_processed_idx
  on core.processed_message_ids (queue_name, processed_at desc);
