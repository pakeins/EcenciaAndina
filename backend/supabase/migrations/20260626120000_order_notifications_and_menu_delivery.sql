create table if not exists public.orden_notificacion_auditoria (
  id uuid primary key default gen_random_uuid(),
  id_orden uuid references public.ordenes(id_orden) on delete cascade,
  id_cliente uuid references public.clientes(id_cliente) on delete set null,
  subscription_id uuid references public.telegram_subscriptions(id) on delete set null,
  notification_kind text not null,
  channel text not null default 'telegram',
  status text not null,
  reason text,
  chat_id text,
  telegram_message_id bigint,
  error_message text,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint orden_notificacion_auditoria_kind_check
    check (notification_kind in ('order_consumed', 'order_cancelled')),
  constraint orden_notificacion_auditoria_channel_check
    check (channel in ('telegram')),
  constraint orden_notificacion_auditoria_status_check
    check (status in ('sent', 'skipped_no_subscription', 'failed')),
  constraint orden_notificacion_auditoria_error_len
    check (error_message is null or char_length(error_message) <= 1000)
);

create index if not exists idx_orden_notificacion_auditoria_orden
  on public.orden_notificacion_auditoria(id_orden, created_at desc);

create index if not exists idx_orden_notificacion_auditoria_status
  on public.orden_notificacion_auditoria(status, created_at desc);

alter table public.orden_notificacion_auditoria enable row level security;

drop policy if exists deny_direct_data_api_access on public.orden_notificacion_auditoria;
create policy deny_direct_data_api_access on public.orden_notificacion_auditoria
  as restrictive for all to anon, authenticated
  using (false)
  with check (false);

revoke all on public.orden_notificacion_auditoria from anon, authenticated;
grant all on public.orden_notificacion_auditoria to service_role;

create table if not exists public.menu_envios (
  fecha date primary key,
  menu_payload jsonb not null,
  image_url text,
  first_sent_at timestamptz not null default now(),
  last_sent_at timestamptz not null default now(),
  send_count integer not null default 1,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint menu_envios_sections_check
    check (
      jsonb_typeof(menu_payload->'sopas') = 'array'
      and jsonb_array_length(menu_payload->'sopas') > 0
      and jsonb_typeof(menu_payload->'segundos') = 'array'
      and jsonb_array_length(menu_payload->'segundos') > 0
      and jsonb_typeof(menu_payload->'guarniciones') = 'array'
      and jsonb_array_length(menu_payload->'guarniciones') > 0
    ),
  constraint menu_envios_send_count_positive check (send_count > 0),
  constraint menu_envios_image_url_len check (image_url is null or char_length(image_url) <= 2048)
);

create or replace function public.update_telegram_bot_state_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists update_menu_envios_updated_at on public.menu_envios;
create trigger update_menu_envios_updated_at
before update on public.menu_envios
for each row execute function public.update_telegram_bot_state_updated_at();

alter table public.menu_envios enable row level security;

drop policy if exists deny_direct_data_api_access on public.menu_envios;
create policy deny_direct_data_api_access on public.menu_envios
  as restrictive for all to anon, authenticated
  using (false)
  with check (false);

revoke all on public.menu_envios from anon, authenticated;
grant all on public.menu_envios to service_role;
