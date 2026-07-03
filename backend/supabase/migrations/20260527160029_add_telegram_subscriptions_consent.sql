create table if not exists public.telegram_subscriptions (
  id uuid primary key default gen_random_uuid(),
  id_cliente uuid references public.clientes(id_cliente) on delete set null,
  phone_normalized text,
  chat_id text,
  consent_status text not null default 'pending',
  is_active boolean not null default true,
  accepted_at timestamptz,
  rejected_at timestamptz,
  linked_at timestamptz,
  last_menu_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint telegram_subscriptions_consent_status_check
    check (consent_status in ('pending', 'accepted', 'rejected'))
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'telegram_subscriptions_phone_normalized_key'
      and conrelid = 'public.telegram_subscriptions'::regclass
  ) then
    alter table public.telegram_subscriptions
      add constraint telegram_subscriptions_phone_normalized_key unique (phone_normalized);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'telegram_subscriptions_chat_id_key'
      and conrelid = 'public.telegram_subscriptions'::regclass
  ) then
    alter table public.telegram_subscriptions
      add constraint telegram_subscriptions_chat_id_key unique (chat_id);
  end if;
end $$;

create index if not exists idx_telegram_subscriptions_id_cliente
  on public.telegram_subscriptions (id_cliente);

create index if not exists idx_telegram_subscriptions_delivery
  on public.telegram_subscriptions (consent_status, is_active)
  where chat_id is not null;

drop trigger if exists update_telegram_subscriptions_updated_at
  on public.telegram_subscriptions;

create trigger update_telegram_subscriptions_updated_at
before update on public.telegram_subscriptions
for each row execute function public.update_telegram_bot_state_updated_at();

alter table public.telegram_subscriptions enable row level security;

drop policy if exists deny_direct_data_api_access
  on public.telegram_subscriptions;

create policy deny_direct_data_api_access
  on public.telegram_subscriptions
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

with phone_links as (
  select
    nullif(regexp_replace(coalesce(value->>'phone', ''), '[^0-9]', '', 'g'), '') as phone_normalized,
    nullif(value->>'chatId', '') as chat_id
  from public.telegram_bot_state
  where key like 'phone:%'
),
matched_links as (
  select distinct on (phone_links.phone_normalized)
    clientes.id_cliente,
    phone_links.phone_normalized,
    phone_links.chat_id
  from phone_links
  join public.clientes
    on regexp_replace(coalesce(clientes.telefono, ''), '[^0-9]', '', 'g') = phone_links.phone_normalized
  where phone_links.phone_normalized is not null
    and phone_links.chat_id is not null
  order by phone_links.phone_normalized, clientes.created_at desc nulls last
)
insert into public.telegram_subscriptions (
  id_cliente,
  phone_normalized,
  chat_id,
  consent_status,
  is_active,
  accepted_at,
  rejected_at,
  linked_at
)
select
  id_cliente,
  phone_normalized,
  chat_id,
  'accepted',
  true,
  now(),
  null,
  now()
from matched_links
on conflict (phone_normalized) do update set
  id_cliente = excluded.id_cliente,
  chat_id = excluded.chat_id,
  consent_status = 'accepted',
  is_active = true,
  accepted_at = coalesce(public.telegram_subscriptions.accepted_at, now()),
  rejected_at = null,
  linked_at = coalesce(public.telegram_subscriptions.linked_at, now()),
  updated_at = now();
