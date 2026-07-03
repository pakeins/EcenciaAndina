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

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
alter function public.update_telegram_bot_state_updated_at() set search_path = public, pg_temp;
