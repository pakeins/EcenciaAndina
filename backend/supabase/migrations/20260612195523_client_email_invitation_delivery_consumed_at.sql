alter table public.clientes
  add column if not exists correo text;

update public.clientes
set correo = lower(btrim(correo))
where correo is not null;

alter table public.clientes
  drop constraint if exists chk_clientes_correo_len;

alter table public.clientes
  add constraint chk_clientes_correo_len
    check (correo is null or char_length(correo) <= 254);

create unique index if not exists uq_clientes_correo_normalized
  on public.clientes (lower(correo))
  where correo is not null;

update public.tipos_cliente
set nombre_tipo = 'Cliente frecuente'
where id_tipo_cliente = 1;

update public.tipos_cliente
set nombre_tipo = 'Cliente de convenio'
where id_tipo_cliente = 2;

alter table public.telegram_invitations
  add column if not exists email_delivery_status text not null default 'not_attempted',
  add column if not exists email_recipient text,
  add column if not exists email_provider_id text,
  add column if not exists email_attempted_at timestamptz,
  add column if not exists email_sent_at timestamptz;

alter table public.telegram_invitations
  drop constraint if exists telegram_invitations_email_delivery_status_check;

alter table public.telegram_invitations
  add constraint telegram_invitations_email_delivery_status_check
    check (
      email_delivery_status in (
        'not_attempted',
        'not_configured',
        'pending',
        'sent',
        'failed'
      )
    );

create index if not exists idx_telegram_invitations_email_delivery
  on public.telegram_invitations (email_delivery_status, email_attempted_at desc);

alter table public.ordenes
  add column if not exists consumed_at timestamptz;

update public.ordenes
set consumed_at = coalesce(updated_at, created_at)
where id_estado = 2
  and consumed_at is null;

create index if not exists idx_ordenes_consumed_at
  on public.ordenes (consumed_at desc)
  where consumed_at is not null;

create or replace function public.set_order_consumed_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id_estado = 2 and (
    tg_op = 'INSERT'
    or old.id_estado is distinct from 2
  ) then
    if tg_op = 'INSERT' then
      new.consumed_at := coalesce(new.consumed_at, now());
    else
      new.consumed_at := now();
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists set_order_consumed_at
  on public.ordenes;

create trigger set_order_consumed_at
before insert or update of id_estado
on public.ordenes
for each row
execute function public.set_order_consumed_at();

revoke all on function public.set_order_consumed_at()
  from public, anon, authenticated;
grant execute on function public.set_order_consumed_at()
  to service_role;

comment on column public.clientes.correo
  is 'Correo normalizado del cliente. Obligatorio por API para altas nuevas y nullable para historicos.';

comment on column public.ordenes.consumed_at
  is 'Fecha real en que la orden ingreso al estado Consumido.';

comment on column public.telegram_invitations.email_delivery_status
  is 'Ultimo estado de entrega de la invitacion por correo, sin almacenar el token ni el enlace.';
