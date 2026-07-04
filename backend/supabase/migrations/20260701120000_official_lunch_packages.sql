update public.tipos_almuerzo
set
  esta_activo = false,
  updated_at = now()
where codigo in (
  'normal_ejecutivo',
  'segundo_almuerzo',
  'vegetariano',
  'especial',
  'con_extras'
);

insert into public.tipos_almuerzo (
  id_tipo_almuerzo,
  codigo,
  nombre,
  descripcion,
  orden,
  es_principal,
  requiere_observaciones,
  permite_extras,
  esta_activo
) values
  (6, 'ejecutivo_completo', 'Almuerzo Ejecutivo Completo', 'Entrada, sopa, plato fuerte, postre y bebida.', 10, true, false, false, true),
  (7, 'ejecutivo_sin_sopa', 'Almuerzo Ejecutivo Sin Sopa', 'Entrada, plato fuerte, postre y bebida.', 20, true, false, false, true),
  (8, 'ejecutivo_simple', 'Almuerzo Ejecutivo Simple', 'Plato fuerte, postre y bebida.', 30, true, false, false, true),
  (9, 'almuerzo_dia', 'Almuerzo del Dia', 'Sopa, plato fuerte y bebida.', 40, true, false, false, true),
  (10, 'almuerzo_dia_simple', 'Almuerzo del Dia Simple', 'Plato fuerte y bebida.', 50, true, false, false, true)
on conflict (codigo) do update set
  nombre = excluded.nombre,
  descripcion = excluded.descripcion,
  orden = excluded.orden,
  es_principal = excluded.es_principal,
  requiere_observaciones = excluded.requiere_observaciones,
  permite_extras = excluded.permite_extras,
  esta_activo = excluded.esta_activo,
  updated_at = now();

alter table public.detalle_orden
  alter column id_tipo_almuerzo set default 9;

alter table public.menu_diario
  alter column id_tipo_almuerzo set default 9;

-- Evitar colisiones con el indice unico (fecha, id_tipo_almuerzo, id_alimento)
-- al reasignar los tipos historicos 1-5 al tipo 9: se elimina el duplicado
-- legacy conservando una sola fila por (fecha, id_alimento).
delete from public.menu_diario legacy
where legacy.id_tipo_almuerzo in (1, 2, 3, 4, 5)
  and exists (
    select 1
    from public.menu_diario keep
    where keep.fecha = legacy.fecha
      and keep.id_alimento = legacy.id_alimento
      and keep.ctid <> legacy.ctid
      and (
        keep.id_tipo_almuerzo = 9
        or (keep.id_tipo_almuerzo in (1, 2, 3, 4, 5) and keep.ctid < legacy.ctid)
      )
  );

update public.menu_diario
set id_tipo_almuerzo = 9
where id_tipo_almuerzo in (1, 2, 3, 4, 5);

insert into public.categorias_productos (nombre_categoria)
select category_name
from (
  values
    ('Almuerzos'),
    ('Desayunos'),
    ('Postres y Snacks')
) as categories(category_name)
where not exists (
  select 1
  from public.categorias_productos existing
  where lower(existing.nombre_categoria) = lower(categories.category_name)
);

with official_products(nombre_producto, categoria, precio_unitario, descripcion, id_tipo_almuerzo_default) as (
  values
    ('Almuerzo Ejecutivo Completo', 'Almuerzos', 6.99::numeric, 'Entrada, sopa, plato fuerte, postre y bebida.', 6::bigint),
    ('Almuerzo Ejecutivo Sin Sopa', 'Almuerzos', 6.00::numeric, 'Entrada, plato fuerte, postre y bebida.', 7::bigint),
    ('Almuerzo Ejecutivo Simple', 'Almuerzos', 4.50::numeric, 'Plato fuerte, postre y bebida.', 8::bigint),
    ('Almuerzo del Dia', 'Almuerzos', 4.50::numeric, 'Sopa, plato fuerte y bebida.', 9::bigint),
    ('Almuerzo del Dia Simple', 'Almuerzos', 3.99::numeric, 'Plato fuerte y bebida.', 10::bigint),
    ('Humita', 'Desayunos', 1.75::numeric, 'Experiencia del dia de lunes a viernes.', null::bigint),
    ('Quimbolito', 'Desayunos', 1.75::numeric, 'Experiencia del dia de lunes a viernes.', null::bigint),
    ('Empanada de pollo', 'Desayunos', 1.75::numeric, 'Experiencia del dia de lunes a viernes.', null::bigint),
    ('Torta Vasca', 'Postres y Snacks', 3.50::numeric, 'Experiencia del dia de lunes a viernes.', null::bigint),
    ('Cheesecake', 'Postres y Snacks', 3.50::numeric, 'Experiencia del dia de lunes a viernes.', null::bigint),
    ('Brownie', 'Postres y Snacks', 3.00::numeric, 'Experiencia del dia de lunes a viernes.', null::bigint),
    ('Torta Marmoleada de Frutas', 'Postres y Snacks', 3.00::numeric, 'Experiencia del dia de lunes a viernes.', null::bigint),
    ('Souffle banano / manzana / maduro', 'Desayunos', 1.75::numeric, 'Experiencia del dia de lunes a viernes.', null::bigint),
    ('Mix Galletas', 'Postres y Snacks', 2.50::numeric, 'Experiencia del dia de lunes a viernes.', null::bigint)
),
resolved_products as (
  select
    p.nombre_producto,
    cp.id_categoria,
    p.precio_unitario,
    p.descripcion,
    p.id_tipo_almuerzo_default
  from official_products p
  join public.categorias_productos cp
    on lower(cp.nombre_categoria) = lower(p.categoria)
)
update public.productos existing
set
  id_categoria = resolved.id_categoria,
  precio_unitario = resolved.precio_unitario,
  descripcion = resolved.descripcion,
  id_tipo_almuerzo_default = resolved.id_tipo_almuerzo_default,
  esta_activo = true
from resolved_products resolved
where lower(existing.nombre_producto) = lower(resolved.nombre_producto);

with official_products(nombre_producto, categoria, precio_unitario, descripcion, id_tipo_almuerzo_default) as (
  values
    ('Almuerzo Ejecutivo Completo', 'Almuerzos', 6.99::numeric, 'Entrada, sopa, plato fuerte, postre y bebida.', 6::bigint),
    ('Almuerzo Ejecutivo Sin Sopa', 'Almuerzos', 6.00::numeric, 'Entrada, plato fuerte, postre y bebida.', 7::bigint),
    ('Almuerzo Ejecutivo Simple', 'Almuerzos', 4.50::numeric, 'Plato fuerte, postre y bebida.', 8::bigint),
    ('Almuerzo del Dia', 'Almuerzos', 4.50::numeric, 'Sopa, plato fuerte y bebida.', 9::bigint),
    ('Almuerzo del Dia Simple', 'Almuerzos', 3.99::numeric, 'Plato fuerte y bebida.', 10::bigint),
    ('Humita', 'Desayunos', 1.75::numeric, 'Experiencia del dia de lunes a viernes.', null::bigint),
    ('Quimbolito', 'Desayunos', 1.75::numeric, 'Experiencia del dia de lunes a viernes.', null::bigint),
    ('Empanada de pollo', 'Desayunos', 1.75::numeric, 'Experiencia del dia de lunes a viernes.', null::bigint),
    ('Torta Vasca', 'Postres y Snacks', 3.50::numeric, 'Experiencia del dia de lunes a viernes.', null::bigint),
    ('Cheesecake', 'Postres y Snacks', 3.50::numeric, 'Experiencia del dia de lunes a viernes.', null::bigint),
    ('Brownie', 'Postres y Snacks', 3.00::numeric, 'Experiencia del dia de lunes a viernes.', null::bigint),
    ('Torta Marmoleada de Frutas', 'Postres y Snacks', 3.00::numeric, 'Experiencia del dia de lunes a viernes.', null::bigint),
    ('Souffle banano / manzana / maduro', 'Desayunos', 1.75::numeric, 'Experiencia del dia de lunes a viernes.', null::bigint),
    ('Mix Galletas', 'Postres y Snacks', 2.50::numeric, 'Experiencia del dia de lunes a viernes.', null::bigint)
)
insert into public.productos (
  id_categoria,
  nombre_producto,
  precio_unitario,
  esta_activo,
  descripcion,
  id_tipo_almuerzo_default
)
select
  cp.id_categoria,
  p.nombre_producto,
  p.precio_unitario,
  true,
  p.descripcion,
  p.id_tipo_almuerzo_default
from official_products p
join public.categorias_productos cp
  on lower(cp.nombre_categoria) = lower(p.categoria)
where not exists (
  select 1
  from public.productos existing
  where lower(existing.nombre_producto) = lower(p.nombre_producto)
);

update public.productos
set
  id_tipo_almuerzo_default = 9
where id_tipo_almuerzo_default in (1, 2, 3, 4, 5);

select setval(
  pg_get_serial_sequence('public.categorias_productos', 'id_categoria'),
  greatest((select coalesce(max(id_categoria), 1) from public.categorias_productos), 1),
  true
);

select setval(
  pg_get_serial_sequence('public.productos', 'id_producto'),
  greatest((select coalesce(max(id_producto), 1) from public.productos), 1),
  true
);

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
  constraint menu_envios_send_count_positive check (send_count > 0),
  constraint menu_envios_image_url_len check (image_url is null or char_length(image_url) <= 2048)
);

alter table public.menu_envios
  drop constraint if exists menu_envios_sections_check;

alter table public.menu_envios
  add constraint menu_envios_sections_check
  check (
    jsonb_typeof(menu_payload->'sopas') = 'array'
    and jsonb_array_length(menu_payload->'sopas') > 0
    and jsonb_typeof(menu_payload->'segundos') = 'array'
    and jsonb_array_length(menu_payload->'segundos') > 0
    and (
      not (menu_payload ? 'guarniciones')
      or jsonb_typeof(menu_payload->'guarniciones') = 'array'
    )
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
grant all on public.menu_envios to postgres;

notify pgrst, 'reload schema';
