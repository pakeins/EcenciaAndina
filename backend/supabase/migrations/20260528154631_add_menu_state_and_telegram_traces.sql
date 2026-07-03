create table if not exists public.menu_settings (
  id smallint primary key default 1,
  active_date date,
  image_retention_days integer not null default 14,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint menu_settings_singleton_check check (id = 1),
  constraint menu_settings_image_retention_days_check check (image_retention_days between 1 and 365)
);

insert into public.menu_settings (id, image_retention_days)
values (1, 14)
on conflict (id) do nothing;

drop trigger if exists update_menu_settings_updated_at on public.menu_settings;
create trigger update_menu_settings_updated_at
before update on public.menu_settings
for each row execute function public.update_telegram_bot_state_updated_at();

alter table public.menu_settings enable row level security;

drop policy if exists deny_direct_data_api_access on public.menu_settings;
create policy deny_direct_data_api_access
  on public.menu_settings
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

revoke all on table public.menu_settings from anon, authenticated;
grant all on table public.menu_settings to service_role;

create table if not exists public.telegram_order_traces (
  id uuid primary key default gen_random_uuid(),
  chat_id text,
  update_id bigint,
  id_cliente uuid references public.clientes(id_cliente) on delete set null,
  id_orden uuid references public.ordenes(id_orden) on delete set null,
  subscription_id uuid references public.telegram_subscriptions(id) on delete set null,
  phone_normalized text,
  original_message jsonb not null default '{}'::jsonb,
  interpreted_payload jsonb not null default '{}'::jsonb,
  outcome text not null default 'received',
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint telegram_order_traces_outcome_check
    check (outcome in ('received', 'pending', 'success', 'failed', 'rejected'))
);

create index if not exists idx_telegram_order_traces_chat_created
  on public.telegram_order_traces (chat_id, created_at desc);

create index if not exists idx_telegram_order_traces_order
  on public.telegram_order_traces (id_orden)
  where id_orden is not null;

create index if not exists idx_telegram_order_traces_outcome_created
  on public.telegram_order_traces (outcome, created_at desc);

drop trigger if exists update_telegram_order_traces_updated_at on public.telegram_order_traces;
create trigger update_telegram_order_traces_updated_at
before update on public.telegram_order_traces
for each row execute function public.update_telegram_bot_state_updated_at();

alter table public.telegram_order_traces enable row level security;

drop policy if exists deny_direct_data_api_access on public.telegram_order_traces;
create policy deny_direct_data_api_access
  on public.telegram_order_traces
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

revoke all on table public.telegram_order_traces from anon, authenticated;
grant all on table public.telegram_order_traces to service_role;
