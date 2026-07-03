create table if not exists public.telegram_convenio_invitaciones (
  id uuid primary key default gen_random_uuid(),
  id_convenio uuid references public.convenios(id_convenio) on delete cascade,
  id_cliente uuid references public.clientes(id_cliente) on delete cascade,
  subscription_id uuid references public.telegram_subscriptions(id) on delete set null,
  phone_normalized text,
  token text not null unique,
  invite_link text,
  invitation_message text not null,
  status text not null default 'generated',
  telegram_message_id bigint,
  error_message text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint telegram_convenio_invitaciones_status_check
    check (
      status in (
        'generated',
        'manual_required',
        'sent',
        'failed',
        'opened',
        'accepted',
        'rejected',
        'no_phone',
        'missing_bot_username',
        'rejected_manual_required'
      )
    ),
  constraint telegram_convenio_invitaciones_token_len
    check (char_length(token) between 12 and 80),
  constraint telegram_convenio_invitaciones_message_len
    check (char_length(invitation_message) <= 1200),
  constraint telegram_convenio_invitaciones_error_len
    check (error_message is null or char_length(error_message) <= 1000)
);

create index if not exists idx_telegram_convenio_invitaciones_cliente
  on public.telegram_convenio_invitaciones(id_cliente, created_at desc);

create index if not exists idx_telegram_convenio_invitaciones_convenio
  on public.telegram_convenio_invitaciones(id_convenio, created_at desc);

create index if not exists idx_telegram_convenio_invitaciones_status
  on public.telegram_convenio_invitaciones(status, created_at desc);

drop trigger if exists update_telegram_convenio_invitaciones_updated_at
  on public.telegram_convenio_invitaciones;

create trigger update_telegram_convenio_invitaciones_updated_at
before update on public.telegram_convenio_invitaciones
for each row execute function public.update_telegram_bot_state_updated_at();

alter table public.telegram_convenio_invitaciones enable row level security;

drop policy if exists deny_direct_data_api_access
  on public.telegram_convenio_invitaciones;

create policy deny_direct_data_api_access
  on public.telegram_convenio_invitaciones
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

revoke all on public.telegram_convenio_invitaciones from anon, authenticated;
grant all on public.telegram_convenio_invitaciones to service_role;
