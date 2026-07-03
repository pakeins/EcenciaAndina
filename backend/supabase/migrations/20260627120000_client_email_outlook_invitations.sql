alter table public.clientes
  add column if not exists email text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chk_clientes_email_len'
      and conrelid = 'public.clientes'::regclass
  ) then
    alter table public.clientes
      add constraint chk_clientes_email_len
      check (email is null or char_length(email) <= 254);
  end if;
end $$;

create unique index if not exists idx_clientes_email_active_unique
  on public.clientes (lower(email))
  where nullif(btrim(email), '') is not null and esta_activo is true;

alter table public.telegram_convenio_invitaciones
  add column if not exists email_to text,
  add column if not exists email_status text not null default 'not_attempted',
  add column if not exists email_error_message text,
  add column if not exists email_sent_at timestamptz,
  add column if not exists email_provider_request_id text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'telegram_convenio_invitaciones_email_status_check'
      and conrelid = 'public.telegram_convenio_invitaciones'::regclass
  ) then
    alter table public.telegram_convenio_invitaciones
      add constraint telegram_convenio_invitaciones_email_status_check
      check (
        email_status in (
          'not_attempted',
          'sent',
          'failed',
          'missing_recipient',
          'not_configured'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'telegram_convenio_invitaciones_email_to_len'
      and conrelid = 'public.telegram_convenio_invitaciones'::regclass
  ) then
    alter table public.telegram_convenio_invitaciones
      add constraint telegram_convenio_invitaciones_email_to_len
      check (email_to is null or char_length(email_to) <= 254);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'telegram_convenio_invitaciones_email_error_len'
      and conrelid = 'public.telegram_convenio_invitaciones'::regclass
  ) then
    alter table public.telegram_convenio_invitaciones
      add constraint telegram_convenio_invitaciones_email_error_len
      check (email_error_message is null or char_length(email_error_message) <= 1000);
  end if;
end $$;

create index if not exists idx_telegram_convenio_invitaciones_email_status
  on public.telegram_convenio_invitaciones(email_status, created_at desc);
