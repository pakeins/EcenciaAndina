create or replace function public.update_telegram_bot_state_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $body$
begin
  new.updated_at = now();
  return new;
end;
$body$;
create table if not exists public.menu_diario (
  id_menu_diario uuid primary key default gen_random_uuid(),
  fecha date not null,
  id_alimento bigint not null references public.alimentos(id_alimento) on delete cascade,
  imagen_url text,
  created_at timestamptz not null default now(),
  created_by uuid,
  unique (fecha, id_alimento)
);

alter table public.menu_diario enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'eciencia-menu-assets',
  'eciencia-menu-assets',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  updated_at = now();
create table if not exists public.recargas_saldo (
  id_recarga uuid primary key default gen_random_uuid(),
  id_cliente uuid references public.clientes(id_cliente) on delete cascade,
  id_producto bigint references public.productos(id_producto),
  cantidad_comprada integer not null,
  monto_total numeric(10,2) not null,
  numero_factura varchar(50),
  created_at timestamptz default now(),
  created_by uuid,
  updated_at timestamptz default now(),
  updated_by uuid
);

alter table public.recargas_saldo enable row level security;

create index if not exists idx_empleados_id_rol on public.empleados(id_rol);
create index if not exists idx_productos_id_categoria on public.productos(id_categoria);
create index if not exists idx_clientes_id_tipo_cliente on public.clientes(id_tipo_cliente);
create index if not exists idx_clientes_convenios_id_convenio on public.clientes_convenios(id_convenio);
create index if not exists idx_saldos_servicio_id_producto on public.saldos_servicio(id_producto);
create index if not exists idx_recargas_saldo_id_cliente on public.recargas_saldo(id_cliente);
create index if not exists idx_recargas_saldo_id_producto on public.recargas_saldo(id_producto);
create index if not exists idx_ordenes_id_cliente on public.ordenes(id_cliente);
create index if not exists idx_ordenes_id_estado on public.ordenes(id_estado);
create index if not exists idx_ordenes_id_origen on public.ordenes(id_origen);
create index if not exists idx_ordenes_id_empleado_atiende on public.ordenes(id_empleado_atiende);
create index if not exists idx_detalle_orden_id_orden on public.detalle_orden(id_orden);
create index if not exists idx_detalle_orden_id_producto on public.detalle_orden(id_producto);
create index if not exists idx_alimentos_id_categoria_menu on public.alimentos(id_categoria_menu);
create index if not exists idx_menu_diario_id_alimento on public.menu_diario(id_alimento);
create index if not exists idx_menu_diario_fecha on public.menu_diario(fecha);


with categorias(nombre_categoria) as (
  values ('Restaurante'), ('Tienda')
)
insert into public.categorias_productos (nombre_categoria)
select c.nombre_categoria
from categorias c
where not exists (
  select 1
  from public.categorias_productos cp
  where lower(cp.nombre_categoria) = lower(c.nombre_categoria)
);

with productos(nombre_producto, categoria, precio_unitario, descripcion) as (
  values
    ('Menu ejecutivo restaurante', 'Restaurante', 4.50::numeric, 'Almuerzo completo para servicio diario en restaurante'),
    ('Almuerzo vegetariano', 'Restaurante', 4.25::numeric, 'Opcion vegetariana con sopa, plato fuerte y guarnicion'),
    ('Bowl andino', 'Restaurante', 5.50::numeric, 'Bowl con granos andinos, vegetales y proteina'),
    ('Sopa del dia', 'Restaurante', 2.25::numeric, 'Porcion individual de sopa disponible del dia'),
    ('Jugo natural', 'Restaurante', 1.50::numeric, 'Jugo natural de temporada'),
    ('Postre de la casa', 'Restaurante', 2.00::numeric, 'Postre artesanal para venta en caja'),
    ('Agua mineral 500ml', 'Tienda', 1.00::numeric, 'Botella personal para tienda'),
    ('Cafe organico', 'Tienda', 1.75::numeric, 'Cafe caliente de origen andino'),
    ('Chocolate caliente', 'Tienda', 2.00::numeric, 'Bebida caliente para tienda'),
    ('Pan de yuca', 'Tienda', 1.25::numeric, 'Unidad de pan de yuca'),
    ('Snack de quinua', 'Tienda', 1.50::numeric, 'Snack empacado de quinua'),
    ('Granola artesanal', 'Tienda', 3.75::numeric, 'Producto empacado para llevar')
)
insert into public.productos (id_categoria, nombre_producto, precio_unitario, esta_activo, descripcion)
select cp.id_categoria, p.nombre_producto, p.precio_unitario, true, p.descripcion
from productos p
join public.categorias_productos cp on lower(cp.nombre_categoria) = lower(p.categoria)
where not exists (
  select 1
  from public.productos existing
  where lower(existing.nombre_producto) = lower(p.nombre_producto)
);

with alimentos(nombre_alimento, id_categoria_menu) as (
  values
    ('Sopa de quinoa', 1::bigint),
    ('Crema de zapallo', 1::bigint),
    ('Pollo al horno con hierbas', 2::bigint),
    ('Llapingacho con ensalada', 2::bigint),
    ('Menestra de lenteja', 2::bigint),
    ('Mote pillo', 3::bigint),
    ('Pure de papa', 3::bigint)
)
insert into public.alimentos (id_categoria_menu, nombre_alimento)
select a.id_categoria_menu, a.nombre_alimento
from alimentos a
where not exists (
  select 1
  from public.alimentos existing
  where existing.id_categoria_menu = a.id_categoria_menu
    and lower(existing.nombre_alimento) = lower(a.nombre_alimento)
);

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

select setval(
  pg_get_serial_sequence('public.alimentos', 'id_alimento'),
  greatest((select coalesce(max(id_alimento), 1) from public.alimentos), 1),
  true
);
do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'alimentos',
    'categorias_menu',
    'categorias_productos',
    'clientes',
    'clientes_convenios',
    'conveniohistorial',
    'convenios',
    'detalle_orden',
    'empleados',
    'estados_orden',
    'menu_diario',
    'ordenes',
    'origenes_pedido',
    'productos',
    'recargas_saldo',
    'roles',
    'saldos_servicio',
    'tipos_cliente'
  ] loop
    execute format('alter table public.%I enable row level security', target_table);
    execute format('drop policy if exists %I on public.%I', 'deny_direct_data_api_access', target_table);
    execute format(
      'create policy %I on public.%I as restrictive for all to anon, authenticated using (false) with check (false)',
      'deny_direct_data_api_access',
      target_table
    );
  end loop;
end $$;


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


revoke all on table public.telegram_subscriptions from anon, authenticated;

grant all on table public.telegram_subscriptions to service_role;
create table if not exists public.menu_settings (
  id smallint primary key default 1,
  active_date date,
  image_retention_days integer not null default 14,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint menu_settings_singleton_check check (id = 1),
  constraint menu_settings_image_retention_days_check check (image_retention_days between 1 and 365)
);

insert into public.menu_settings (id, image_retention_days)
values (1, 14)
on conflict (id) do nothing;

drop trigger if exists update_menu_settings_updated_at on public.menu_settings;
create trigger update_menu_settings_updated_at
before update on public.menu_settings
for each row execute function public.update_telegram_bot_state_updated_at();

alter table public.menu_settings enable row level security;

drop policy if exists deny_direct_data_api_access on public.menu_settings;
create policy deny_direct_data_api_access
  on public.menu_settings
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

revoke all on table public.menu_settings from anon, authenticated;
grant all on table public.menu_settings to service_role;

create table if not exists public.telegram_order_traces (
  id uuid primary key default gen_random_uuid(),
  chat_id text,
  update_id bigint,
  id_cliente uuid references public.clientes(id_cliente) on delete set null,
  id_orden uuid references public.ordenes(id_orden) on delete set null,
  subscription_id uuid references public.telegram_subscriptions(id) on delete set null,
  phone_normalized text,
  original_message jsonb not null default '{}'::jsonb,
  interpreted_payload jsonb not null default '{}'::jsonb,
  outcome text not null default 'received',
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint telegram_order_traces_outcome_check
    check (outcome in ('received', 'pending', 'success', 'failed', 'rejected'))
);

create index if not exists idx_telegram_order_traces_chat_created
  on public.telegram_order_traces (chat_id, created_at desc);

create index if not exists idx_telegram_order_traces_order
  on public.telegram_order_traces (id_orden)
  where id_orden is not null;

create index if not exists idx_telegram_order_traces_outcome_created
  on public.telegram_order_traces (outcome, created_at desc);

drop trigger if exists update_telegram_order_traces_updated_at on public.telegram_order_traces;
create trigger update_telegram_order_traces_updated_at
before update on public.telegram_order_traces
for each row execute function public.update_telegram_bot_state_updated_at();

alter table public.telegram_order_traces enable row level security;

drop policy if exists deny_direct_data_api_access on public.telegram_order_traces;
create policy deny_direct_data_api_access
  on public.telegram_order_traces
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

revoke all on table public.telegram_order_traces from anon, authenticated;
grant all on table public.telegram_order_traces to service_role;
alter table public.telegram_subscriptions
  add column if not exists consent_notice_version text,
  add column if not exists consent_notice_text text;

comment on column public.telegram_subscriptions.consent_notice_version
  is 'Version del aviso de privacidad mostrado al titular antes de aceptar el bot.';

comment on column public.telegram_subscriptions.consent_notice_text
  is 'Texto del aviso aceptado o rechazado para trazabilidad de consentimiento.';
create or replace function public.eciencia_is_valid_ec_cedula(value text)
returns boolean
language plpgsql
immutable
as $$
declare
  digits text := regexp_replace(coalesce(value, ''), '\D', '', 'g');
  coefficients int[] := array[2, 1, 2, 1, 2, 1, 2, 1, 2];
  province int;
  third_digit int;
  total int := 0;
  product int;
  expected int;
begin
  if digits !~ '^\d{10}$' then
    return false;
  end if;

  province := substring(digits from 1 for 2)::int;
  third_digit := substring(digits from 3 for 1)::int;
  if province < 1 or province > 24 or third_digit > 5 then
    return false;
  end if;

  for i in 1..9 loop
    product := substring(digits from i for 1)::int * coefficients[i];
    if product >= 10 then
      product := product - 9;
    end if;
    total := total + product;
  end loop;

  expected := (10 - (total % 10)) % 10;
  return expected = substring(digits from 10 for 1)::int;
end;
$$;

create or replace function public.eciencia_is_valid_ec_ruc(value text)
returns boolean
language plpgsql
immutable
as $$
declare
  digits text := regexp_replace(coalesce(value, ''), '\D', '', 'g');
  province int;
  third_digit int;
  coefficients int[];
  total int := 0;
  verifier int;
  expected int;
  verifier_position int;
begin
  if digits !~ '^\d{13}$' or right(digits, 3) = '000' then
    return false;
  end if;

  province := substring(digits from 1 for 2)::int;
  third_digit := substring(digits from 3 for 1)::int;
  if province < 1 or province > 24 then
    return false;
  end if;

  if third_digit < 6 then
    return public.eciencia_is_valid_ec_cedula(left(digits, 10));
  elsif third_digit = 6 then
    coefficients := array[3, 2, 7, 6, 5, 4, 3, 2];
    verifier_position := 9;
  elsif third_digit = 9 then
    coefficients := array[4, 3, 2, 7, 6, 5, 4, 3, 2];
    verifier_position := 10;
  else
    return false;
  end if;

  for i in 1..array_length(coefficients, 1) loop
    total := total + substring(digits from i for 1)::int * coefficients[i];
  end loop;

  verifier := 11 - (total % 11);
  if verifier = 11 then
    expected := 0;
  elsif verifier = 10 then
    return false;
  else
    expected := verifier;
  end if;

  return expected = substring(digits from verifier_position for 1)::int;
end;
$$;

do $$
declare
  item record;
  has_columns boolean;
begin
  for item in
    select *
    from (
      values
        ('empleados', 'chk_empleados_nombre_len', array['nombre'], 'char_length(nombre) <= 60'),
        ('empleados', 'chk_empleados_apellido_len', array['apellido'], 'char_length(apellido) <= 60'),
        ('empleados', 'chk_empleados_username_format', array['nombre_usuario'], 'nombre_usuario ~ ''^[A-Za-z0-9._-]{1,40}$'''),
        ('empleados', 'chk_empleados_correo_len', array['correo'], 'correo is null or char_length(correo) <= 254'),
        ('categorias_productos', 'chk_categorias_productos_nombre_len', array['nombre_categoria'], 'char_length(nombre_categoria) <= 80'),
        ('productos', 'chk_productos_nombre_len', array['nombre_producto'], 'char_length(nombre_producto) <= 80'),
        ('productos', 'chk_productos_precio_non_negative', array['precio_unitario'], 'precio_unitario >= 0'),
        ('productos', 'chk_productos_descripcion_len', array['descripcion'], 'descripcion is null or char_length(descripcion) <= 300'),
        ('convenios', 'chk_convenios_nombre_len', array['nombre_empresa'], 'char_length(nombre_empresa) <= 120'),
        ('convenios', 'chk_convenios_representante_len', array['representante'], 'representante is null or char_length(representante) <= 120'),
        ('convenios', 'chk_convenios_telefono_digits', array['telefono'], 'telefono is null or telefono ~ ''^\d{8,15}$'''),
        ('convenios', 'chk_convenios_email_len', array['email'], 'email is null or char_length(email) <= 254'),
        ('convenios', 'chk_convenios_cupo_non_negative', array['cupo_maximo'], 'cupo_maximo >= 0'),
        ('clientes', 'chk_clientes_nombre_len', array['nombre'], 'char_length(nombre) <= 60'),
        ('clientes', 'chk_clientes_apellido_len', array['apellido'], 'char_length(apellido) <= 60'),
        ('clientes', 'chk_clientes_telefono_digits', array['telefono'], 'telefono is null or telefono ~ ''^\d{8,15}$'''),
        ('saldos_servicio', 'chk_saldos_servicio_cantidad_non_negative', array['cantidad_disponible'], 'cantidad_disponible >= 0'),
        ('recargas_saldo', 'chk_recargas_saldo_cantidad_positive', array['cantidad_comprada'], 'cantidad_comprada > 0'),
        ('recargas_saldo', 'chk_recargas_saldo_monto_non_negative', array['monto_total'], 'monto_total >= 0'),
        ('recargas_saldo', 'chk_recargas_saldo_factura_len', array['numero_factura'], 'numero_factura is null or char_length(numero_factura) <= 50'),
        ('ordenes', 'chk_ordenes_canal_len', array['canal_origen'], 'canal_origen is null or char_length(canal_origen) <= 40'),
        ('ordenes', 'chk_ordenes_metodo_pago_len', array['metodo_pago'], 'metodo_pago is null or char_length(metodo_pago) <= 60'),
        ('ordenes', 'chk_ordenes_observaciones_len', array['observaciones'], 'observaciones is null or char_length(observaciones) <= 500'),
        ('detalle_orden', 'chk_detalle_orden_cantidad_range', array['cantidad'], 'cantidad between 1 and 20'),
        ('detalle_orden', 'chk_detalle_orden_precio_non_negative', array['precio_aplicado'], 'precio_aplicado >= 0'),
        ('alimentos', 'chk_alimentos_nombre_len', array['nombre_alimento'], 'char_length(nombre_alimento) <= 80'),
        ('menu_diario', 'chk_menu_diario_imagen_url_len', array['imagen_url'], 'imagen_url is null or char_length(imagen_url) <= 2048')
    ) as validations(table_name, constraint_name, columns, condition)
  loop
    if to_regclass('public.' || item.table_name) is null then
      continue;
    end if;

    select bool_and(
      exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = item.table_name
          and column_name = column_name_check
      )
    )
    into has_columns
    from unnest(item.columns) as required_columns(column_name_check);

    if has_columns and not exists (
      select 1
      from pg_constraint
      where conrelid = ('public.' || item.table_name)::regclass
        and conname = item.constraint_name
    ) then
      execute format(
        'alter table public.%I add constraint %I check (%s) not valid',
        item.table_name,
        item.constraint_name,
        item.condition
      );
    end if;
  end loop;
end;
$$;
create or replace function public.eciencia_is_valid_ec_cedula(value text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  digits text := regexp_replace(coalesce(value, ''), '\D', '', 'g');
  coefficients int[] := array[2, 1, 2, 1, 2, 1, 2, 1, 2];
  province int;
  third_digit int;
  total int := 0;
  product int;
  expected int;
begin
  if digits !~ '^\d{10}$' then
    return false;
  end if;

  province := substring(digits from 1 for 2)::int;
  third_digit := substring(digits from 3 for 1)::int;
  if province < 1 or province > 24 or third_digit > 5 then
    return false;
  end if;

  for i in 1..9 loop
    product := substring(digits from i for 1)::int * coefficients[i];
    if product >= 10 then
      product := product - 9;
    end if;
    total := total + product;
  end loop;

  expected := (10 - (total % 10)) % 10;
  return expected = substring(digits from 10 for 1)::int;
end;
$$;

create or replace function public.eciencia_is_valid_ec_ruc(value text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  digits text := regexp_replace(coalesce(value, ''), '\D', '', 'g');
  province int;
  third_digit int;
  coefficients int[];
  total int := 0;
  verifier int;
  expected int;
  verifier_position int;
begin
  if digits !~ '^\d{13}$' or right(digits, 3) = '000' then
    return false;
  end if;

  province := substring(digits from 1 for 2)::int;
  third_digit := substring(digits from 3 for 1)::int;
  if province < 1 or province > 24 then
    return false;
  end if;

  if third_digit < 6 then
    return public.eciencia_is_valid_ec_cedula(left(digits, 10));
  elsif third_digit = 6 then
    coefficients := array[3, 2, 7, 6, 5, 4, 3, 2];
    verifier_position := 9;
  elsif third_digit = 9 then
    coefficients := array[4, 3, 2, 7, 6, 5, 4, 3, 2];
    verifier_position := 10;
  else
    return false;
  end if;

  for i in 1..array_length(coefficients, 1) loop
    total := total + substring(digits from i for 1)::int * coefficients[i];
  end loop;

  verifier := 11 - (total % 11);
  if verifier = 11 then
    expected := 0;
  elsif verifier = 10 then
    return false;
  else
    expected := verifier;
  end if;

  return expected = substring(digits from verifier_position for 1)::int;
end;
$$;
create index if not exists idx_telegram_order_traces_update_id
  on public.telegram_order_traces (update_id)
  where update_id is not null;
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
-- Tipo de almuerzo contratado por convenio (empresa).
-- Los clientes de convenio reciben este tipo fijo en el bot Telegram;
-- los clientes frecuentes siguen eligiendo el paquete.
-- Depende de 20260701120000_official_lunch_packages.sql (crea el tipo 9).

alter table public.convenios
  add column if not exists id_tipo_almuerzo bigint
    references public.tipos_almuerzo(id_tipo_almuerzo);

-- Backfill: convenios sin tipo -> Almuerzo del Dia (9), solo si el tipo existe.
update public.convenios c
set id_tipo_almuerzo = 9
where c.id_tipo_almuerzo is null
  and exists (
    select 1 from public.tipos_almuerzo t where t.id_tipo_almuerzo = 9
  );

alter table public.convenios
  alter column id_tipo_almuerzo set default 9;

create index if not exists idx_convenios_id_tipo_almuerzo
  on public.convenios(id_tipo_almuerzo);

notify pgrst, 'reload schema';
-- Categorias de menu para el modelo por componentes del paquete oficial.
-- El menu diario es unico/compartido; cada paquete toma el subconjunto de
-- componentes que incluye (entrada, sopa, plato fuerte, postre, bebida).
-- Se conservan Sopas, Segundos/Platos fuertes y Guarniciones existentes.
-- Nota: en la base real categorias_menu tiene una columna codigo NOT NULL
-- (creada fuera de las migraciones del repo), por lo que la insercion se
-- adapta a ambos esquemas.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'categorias_menu' and column_name = 'codigo'
  ) then
    insert into public.categorias_menu (nombre_categoria, codigo)
    select v.nombre, v.codigo
    from (values ('Entradas', 'entradas'), ('Postres', 'postres'), ('Bebidas', 'bebidas')) as v(nombre, codigo)
    where not exists (
      select 1 from public.categorias_menu c
      where lower(c.nombre_categoria) = lower(v.nombre)
         or lower(c.codigo) = lower(v.codigo)
    );
  else
    insert into public.categorias_menu (nombre_categoria)
    select v.nombre
    from (values ('Entradas'), ('Postres'), ('Bebidas')) as v(nombre)
    where not exists (
      select 1 from public.categorias_menu c
      where lower(c.nombre_categoria) = lower(v.nombre)
    );
  end if;
end $$;

notify pgrst, 'reload schema';
-- El menu diario por componentes solo exige plato fuerte (segundos).
-- Sopa, entrada, postre, bebida y guarnicion son opcionales, por lo que la
-- restriccion de menu_envios ya no debe exigir sopa: un menu sin sopa debe
-- poder enviarse y persistirse en menu_envios.

alter table public.menu_envios
  drop constraint if exists menu_envios_sections_check;

alter table public.menu_envios
  add constraint menu_envios_sections_check
  check (
    jsonb_typeof(menu_payload->'segundos') = 'array'
    and jsonb_array_length(menu_payload->'segundos') > 0
    and (not (menu_payload ? 'entradas') or jsonb_typeof(menu_payload->'entradas') = 'array')
    and (not (menu_payload ? 'sopas') or jsonb_typeof(menu_payload->'sopas') = 'array')
    and (not (menu_payload ? 'postres') or jsonb_typeof(menu_payload->'postres') = 'array')
    and (not (menu_payload ? 'bebidas') or jsonb_typeof(menu_payload->'bebidas') = 'array')
    and (not (menu_payload ? 'guarniciones') or jsonb_typeof(menu_payload->'guarniciones') = 'array')
  );

notify pgrst, 'reload schema';
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

