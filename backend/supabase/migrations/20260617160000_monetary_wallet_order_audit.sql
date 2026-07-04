create table if not exists public.monederos_cliente (
  id_cliente uuid primary key references public.clientes(id_cliente) on delete cascade,
  saldo_disponible numeric(10,2) not null default 0,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  constraint chk_monederos_cliente_saldo_non_negative check (saldo_disponible >= 0)
);

insert into public.monederos_cliente (id_cliente, saldo_disponible, updated_by, updated_at)
select
  saldo.id_cliente,
  round(sum(saldo.cantidad_disponible * coalesce(producto.precio_unitario, 0))::numeric, 2) as saldo_disponible,
  (array_agg(saldo.updated_by order by coalesce(saldo.updated_at, now()) desc nulls last))[1] as updated_by,
  max(coalesce(saldo.updated_at, now())) as updated_at
from public.saldos_servicio saldo
left join public.productos producto
  on producto.id_producto = saldo.id_producto
group by saldo.id_cliente
on conflict (id_cliente) do update
set
  saldo_disponible = excluded.saldo_disponible,
  updated_by = excluded.updated_by,
  updated_at = excluded.updated_at;

alter table public.recargas_saldo
  alter column cantidad_comprada drop not null;

alter table public.recargas_saldo
  drop constraint if exists chk_recargas_saldo_cantidad_positive;

alter table public.recargas_saldo
  add constraint chk_recargas_saldo_cantidad_positive
    check (cantidad_comprada is null or cantidad_comprada > 0);

create table if not exists public.orden_estado_auditoria (
  id uuid primary key default gen_random_uuid(),
  id_orden uuid not null references public.ordenes(id_orden) on delete cascade,
  estado_anterior bigint references public.estados_orden(id_estado),
  estado_nuevo bigint references public.estados_orden(id_estado),
  motivo text,
  monto_ajustado numeric(10,2) not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint chk_orden_estado_auditoria_monto_non_negative check (monto_ajustado >= 0),
  constraint chk_orden_estado_auditoria_motivo_len check (motivo is null or char_length(motivo) <= 500)
);

create index if not exists idx_orden_estado_auditoria_orden
  on public.orden_estado_auditoria(id_orden, created_at desc);

alter table public.ordenes
  add column if not exists consumed_at timestamptz;

update public.ordenes
set consumed_at = coalesce(updated_at, created_at)
where id_estado = 2
  and consumed_at is null;

create index if not exists idx_ordenes_consumed_at
  on public.ordenes(consumed_at desc)
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
  elsif tg_op = 'UPDATE' and old.id_estado = 2 and new.id_estado is distinct from 2 then
    new.consumed_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists set_order_consumed_at on public.ordenes;
create trigger set_order_consumed_at
before insert or update of id_estado
on public.ordenes
for each row
execute function public.set_order_consumed_at();

alter table public.monederos_cliente enable row level security;
alter table public.orden_estado_auditoria enable row level security;

drop policy if exists deny_direct_data_api_access on public.monederos_cliente;
create policy deny_direct_data_api_access on public.monederos_cliente
  as restrictive for all to anon, authenticated
  using (false)
  with check (false);

drop policy if exists deny_direct_data_api_access on public.orden_estado_auditoria;
create policy deny_direct_data_api_access on public.orden_estado_auditoria
  as restrictive for all to anon, authenticated
  using (false)
  with check (false);

revoke all on public.monederos_cliente from anon, authenticated;
revoke all on public.orden_estado_auditoria from anon, authenticated;
grant all on public.monederos_cliente to service_role;
grant all on public.orden_estado_auditoria to service_role;
grant execute on function public.set_order_consumed_at() to service_role;

comment on table public.monederos_cliente
  is 'Saldo monetario global del cliente frecuente. Reemplaza el consumo operativo por producto en saldos_servicio.';

comment on table public.orden_estado_auditoria
  is 'Auditoria de cambios de estado de pedidos, especialmente reversiones administrativas de pedidos consumidos.';
