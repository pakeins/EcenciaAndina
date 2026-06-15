alter table public.telegram_subscriptions
  drop constraint if exists telegram_subscriptions_consent_status_check;

alter table public.telegram_subscriptions
  add column if not exists revoked_at timestamptz,
  add column if not exists telegram_user_id text,
  add column if not exists telegram_username text,
  add column if not exists consent_method text,
  add column if not exists deletion_requested_at timestamptz,
  add constraint telegram_subscriptions_consent_status_check
    check (consent_status in ('pending', 'accepted', 'rejected', 'revoked'));

create unique index if not exists uq_telegram_subscriptions_client
  on public.telegram_subscriptions (id_cliente)
  where id_cliente is not null;

drop index if exists public.idx_telegram_subscriptions_delivery;
create index idx_telegram_subscriptions_delivery
  on public.telegram_subscriptions (
    consent_status,
    is_active,
    consent_notice_version
  )
  where chat_id is not null;

create table if not exists public.telegram_invitations (
  id uuid primary key default gen_random_uuid(),
  id_cliente uuid not null references public.clientes(id_cliente) on delete cascade,
  token_hmac text not null unique,
  expires_at timestamptz not null,
  claimed_at timestamptz,
  claimed_chat_id text,
  claimed_telegram_user_id text,
  consumed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references public.empleados(id) on delete set null,
  constraint telegram_invitations_token_hmac_check
    check (token_hmac ~ '^[a-f0-9]{64}$'),
  constraint telegram_invitations_expiry_check
    check (expires_at > created_at),
  constraint telegram_invitations_claim_check
    check (
      (claimed_at is null and claimed_chat_id is null)
      or
      (claimed_at is not null and claimed_chat_id is not null)
    )
);

create unique index if not exists uq_telegram_invitations_open_client
  on public.telegram_invitations (id_cliente)
  where consumed_at is null and revoked_at is null;

create index if not exists idx_telegram_invitations_expiry
  on public.telegram_invitations (expires_at)
  where consumed_at is null and revoked_at is null;

create table if not exists public.telegram_consent_events (
  id uuid primary key default gen_random_uuid(),
  id_cliente uuid references public.clientes(id_cliente) on delete set null,
  subscription_id uuid references public.telegram_subscriptions(id) on delete set null,
  invitation_id uuid references public.telegram_invitations(id) on delete set null,
  event_type text not null,
  consent_version text,
  notice_sha256 text,
  notice_text text,
  method text not null,
  telegram_user_id_hmac text,
  chat_id_hmac text,
  phone_hmac text,
  evidence jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint telegram_consent_events_type_check
    check (
      event_type in (
        'accepted',
        'rejected',
        'revoked',
        'admin_reinvited',
        'policy_reconsent_requested',
        'privacy_deletion_requested'
      )
    ),
  constraint telegram_consent_events_method_check
    check (
      method in (
        'telegram_inline_button',
        'telegram_contact_button',
        'telegram_command',
        'admin_direct',
        'admin_link'
      )
    ),
  constraint telegram_consent_events_sha_check
    check (notice_sha256 is null or notice_sha256 ~ '^[a-f0-9]{64}$')
);

create index if not exists idx_telegram_consent_events_client_occurred
  on public.telegram_consent_events (id_cliente, occurred_at desc);

create index if not exists idx_telegram_consent_events_subscription_occurred
  on public.telegram_consent_events (subscription_id, occurred_at desc);

create table if not exists public.telegram_privacy_requests (
  id uuid primary key default gen_random_uuid(),
  id_cliente uuid references public.clientes(id_cliente) on delete set null,
  subscription_id uuid references public.telegram_subscriptions(id) on delete set null,
  request_type text not null,
  status text not null default 'pending',
  source text not null default 'telegram',
  retained_order_count integer not null default 0,
  details jsonb not null default '{}'::jsonb,
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.empleados(id) on delete set null,
  resolution_notes text,
  constraint telegram_privacy_requests_type_check
    check (request_type in ('access', 'deletion', 'revocation', 'other')),
  constraint telegram_privacy_requests_status_check
    check (status in ('pending', 'in_review', 'resolved', 'rejected')),
  constraint telegram_privacy_requests_source_check
    check (source in ('telegram', 'admin')),
  constraint telegram_privacy_requests_order_count_check
    check (retained_order_count >= 0),
  constraint telegram_privacy_requests_resolution_check
    check (
      (status in ('pending', 'in_review') and resolved_at is null)
      or
      (status in ('resolved', 'rejected') and resolved_at is not null)
    )
);

create index if not exists idx_telegram_privacy_requests_status_requested
  on public.telegram_privacy_requests (status, requested_at desc);

create index if not exists idx_telegram_privacy_requests_client_requested
  on public.telegram_privacy_requests (id_cliente, requested_at desc);

create or replace function public.prevent_telegram_consent_event_changes()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'telegram_consent_events is append-only';
end;
$$;

drop trigger if exists prevent_telegram_consent_event_update
  on public.telegram_consent_events;
create trigger prevent_telegram_consent_event_update
before update or delete on public.telegram_consent_events
for each row execute function public.prevent_telegram_consent_event_changes();

alter table public.telegram_invitations enable row level security;
alter table public.telegram_consent_events enable row level security;
alter table public.telegram_privacy_requests enable row level security;

drop policy if exists deny_direct_data_api_access
  on public.telegram_invitations;
create policy deny_direct_data_api_access
  on public.telegram_invitations
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists deny_direct_data_api_access
  on public.telegram_consent_events;
create policy deny_direct_data_api_access
  on public.telegram_consent_events
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists deny_direct_data_api_access
  on public.telegram_privacy_requests;
create policy deny_direct_data_api_access
  on public.telegram_privacy_requests
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

revoke all on table public.telegram_invitations from anon, authenticated;
revoke all on table public.telegram_consent_events from anon, authenticated;
revoke all on table public.telegram_privacy_requests from anon, authenticated;
revoke all on function public.prevent_telegram_consent_event_changes()
  from public, anon, authenticated;

grant all on table public.telegram_invitations to service_role;
grant all on table public.telegram_consent_events to service_role;
grant all on table public.telegram_privacy_requests to service_role;

update public.telegram_order_traces
set original_message = original_message - 'text' - 'contactPhone'
where original_message ? 'text' or original_message ? 'contactPhone';

update public.ordenes
set observaciones = nullif(
  btrim(
    regexp_replace(
      observaciones,
      '\s*\.?\s*Chat:\s*-?[0-9]+',
      '',
      'gi'
    )
  ),
  ''
)
where canal_origen = 'Telegram'
  and observaciones ~* 'Chat:\s*-?[0-9]+';

comment on table public.telegram_invitations
  is 'Invitaciones Telegram de un solo uso. Solo se almacena el HMAC-SHA256 del token.';

comment on table public.telegram_consent_events
  is 'Evidencia append-only de consentimiento, rechazo, revocacion y reinvitacion Telegram.';

comment on table public.telegram_privacy_requests
  is 'Solicitudes de derechos y eliminacion que requieren seguimiento administrativo.';
