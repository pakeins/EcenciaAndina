create table if not exists public.tipos_almuerzo (
  id_tipo_almuerzo bigint primary key,
  codigo text not null unique,
  nombre text not null,
  descripcion text,
  orden integer not null default 0,
  es_principal boolean not null default true,
  requiere_observaciones boolean not null default false,
  permite_extras boolean not null default false,
  esta_activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tipos_almuerzo_codigo_check
    check (codigo ~ '^[a-z][a-z0-9_]*$'),
  constraint tipos_almuerzo_nombre_len
    check (char_length(nombre) between 1 and 80),
  constraint tipos_almuerzo_descripcion_len
    check (descripcion is null or char_length(descripcion) <= 300)
);

insert into public.tipos_almuerzo (
  id_tipo_almuerzo,
  codigo,
  nombre,
  descripcion,
  orden,
  es_principal,
  requiere_observaciones,
  permite_extras
) values
  (1, 'normal_ejecutivo', 'Normal / Ejecutivo', 'Almuerzo base del dia.', 10, true, false, false),
  (2, 'segundo_almuerzo', 'Segundo almuerzo', 'Linea adicional que se reporta fuera del conteo principal.', 20, false, false, false),
  (3, 'vegetariano', 'Vegetariano', 'Variante vegetariana del menu.', 30, true, false, false),
  (4, 'especial', 'Especial', 'Almuerzo con requerimiento especifico del cliente.', 40, true, true, false),
  (5, 'con_extras', 'Con extras', 'Almuerzo principal acompanado por lineas de productos extra.', 50, true, false, true)
on conflict (codigo) do update set
  nombre = excluded.nombre,
  descripcion = excluded.descripcion,
  orden = excluded.orden,
  es_principal = excluded.es_principal,
  requiere_observaciones = excluded.requiere_observaciones,
  permite_extras = excluded.permite_extras,
  esta_activo = true,
  updated_at = now();

drop trigger if exists update_tipos_almuerzo_updated_at on public.tipos_almuerzo;
create trigger update_tipos_almuerzo_updated_at
before update on public.tipos_almuerzo
for each row execute function public.update_telegram_bot_state_updated_at();

alter table public.detalle_orden
  add column if not exists id_tipo_almuerzo bigint references public.tipos_almuerzo(id_tipo_almuerzo),
  add column if not exists observaciones_tipo text;

update public.detalle_orden
set id_tipo_almuerzo = 1
where id_tipo_almuerzo is null;

alter table public.detalle_orden
  alter column id_tipo_almuerzo set default 1,
  alter column id_tipo_almuerzo set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'detalle_orden_observaciones_tipo_len'
      and conrelid = 'public.detalle_orden'::regclass
  ) then
    alter table public.detalle_orden
      add constraint detalle_orden_observaciones_tipo_len
      check (observaciones_tipo is null or char_length(observaciones_tipo) <= 500);
  end if;
end $$;

create index if not exists idx_detalle_orden_id_tipo_almuerzo
  on public.detalle_orden(id_tipo_almuerzo);

alter table public.productos
  add column if not exists id_tipo_almuerzo_default bigint references public.tipos_almuerzo(id_tipo_almuerzo);

with inferred as (
  select
    p.id_producto,
    case
      when lower(coalesce(p.nombre_producto, '')) like '%vegetar%' then 3
      when lower(coalesce(p.nombre_producto, '')) like '%especial%' then 4
      when lower(coalesce(p.nombre_producto, '')) like '%extra%' then 5
      when lower(coalesce(p.nombre_producto, '')) like '%segundo%'
        or lower(coalesce(p.nombre_producto, '')) like '%sin sopa%'
        or lower(coalesce(cp.nombre_categoria, '')) like '%almuerzo%' then 1
      else null
    end as id_tipo_almuerzo_default
  from public.productos p
  left join public.categorias_productos cp
    on cp.id_categoria = p.id_categoria
)
update public.productos p
set id_tipo_almuerzo_default = inferred.id_tipo_almuerzo_default
from inferred
where p.id_producto = inferred.id_producto
  and p.id_tipo_almuerzo_default is null
  and inferred.id_tipo_almuerzo_default is not null;

create index if not exists idx_productos_id_tipo_almuerzo_default
  on public.productos(id_tipo_almuerzo_default);

alter table public.menu_diario
  add column if not exists id_tipo_almuerzo bigint references public.tipos_almuerzo(id_tipo_almuerzo);

update public.menu_diario
set id_tipo_almuerzo = 1
where id_tipo_almuerzo is null;

alter table public.menu_diario
  alter column id_tipo_almuerzo set default 1,
  alter column id_tipo_almuerzo set not null;

alter table public.menu_diario
  drop constraint if exists menu_diario_fecha_id_alimento_key;

create unique index if not exists menu_diario_fecha_tipo_alimento_key
  on public.menu_diario(fecha, id_tipo_almuerzo, id_alimento);

create index if not exists idx_menu_diario_id_tipo_almuerzo
  on public.menu_diario(id_tipo_almuerzo);

alter table public.tipos_almuerzo enable row level security;

drop policy if exists deny_direct_data_api_access on public.tipos_almuerzo;
create policy deny_direct_data_api_access on public.tipos_almuerzo
  as restrictive for all to anon, authenticated
  using (false)
  with check (false);

revoke all on public.tipos_almuerzo from anon, authenticated;
grant all on public.tipos_almuerzo to service_role;
grant all on public.tipos_almuerzo to postgres;
