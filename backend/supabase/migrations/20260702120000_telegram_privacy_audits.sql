create table if not exists public.telegram_privacy_audits (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null,
  subscription_id uuid references public.telegram_subscriptions(id) on delete set null,
  id_cliente uuid references public.clientes(id_cliente) on delete set null,
  action text not null,
  outcome text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint telegram_privacy_audits_action_check
    check (action in ('misdatos', 'eliminarmisdatos', 'revocar')),
  constraint telegram_privacy_audits_outcome_check
    check (outcome in ('informed', 'no_data', 'revoked')),
  constraint telegram_privacy_audits_chat_len
    check (char_length(chat_id) between 1 and 64)
);

create index if not exists idx_telegram_privacy_audits_chat
  on public.telegram_privacy_audits(chat_id, created_at desc);

create index if not exists idx_telegram_privacy_audits_cliente
  on public.telegram_privacy_audits(id_cliente, created_at desc);

alter table public.telegram_privacy_audits enable row level security;

drop policy if exists deny_direct_data_api_access
  on public.telegram_privacy_audits;

create policy deny_direct_data_api_access
  on public.telegram_privacy_audits
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

revoke all on public.telegram_privacy_audits from anon, authenticated;
grant all on public.telegram_privacy_audits to service_role;

comment on table public.telegram_privacy_audits
  is 'Auditoria de solicitudes de privacidad del bot de Telegram (acceso, eliminacion y revocacion de consentimiento).';

notify pgrst, 'reload schema';
