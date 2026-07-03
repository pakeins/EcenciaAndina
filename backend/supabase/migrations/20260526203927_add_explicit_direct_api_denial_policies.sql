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
    'telegram_bot_state',
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

alter function n8n.increment_workflow_version() set search_path = '';
