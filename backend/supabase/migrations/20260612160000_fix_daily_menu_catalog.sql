alter table public.categorias_menu
  add column if not exists codigo text;

update public.categorias_menu
set codigo = case id_categoria_menu
  when 1 then 'sopas'
  when 2 then 'segundos'
  when 3 then 'guarniciones'
  else 'menu_' || id_categoria_menu::text
end
where codigo is null or btrim(codigo) = '';

alter table public.categorias_menu
  alter column codigo set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.categorias_menu'::regclass
      and conname = 'categorias_menu_codigo_key'
  ) then
    alter table public.categorias_menu
      add constraint categorias_menu_codigo_key unique (codigo);
  end if;
end;
$$;

alter table public.alimentos
  add column if not exists nombre_normalizado text generated always as (
    lower(regexp_replace(btrim(nombre_alimento), '\s+', ' ', 'g'))
  ) stored;

create unique index if not exists alimentos_categoria_nombre_normalizado_uidx
  on public.alimentos (id_categoria_menu, nombre_normalizado);

create or replace function public.replace_daily_menu(
  p_fecha date,
  p_alimentos_ids bigint[],
  p_imagen_url text,
  p_user_id uuid
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  inserted_count integer;
begin
  if p_fecha is null then
    raise exception 'La fecha del menu es obligatoria.';
  end if;

  if p_alimentos_ids is null or cardinality(p_alimentos_ids) = 0 then
    raise exception 'El menu debe contener al menos un alimento.';
  end if;

  if cardinality(p_alimentos_ids) <> (
    select count(distinct item_id)
    from unnest(p_alimentos_ids) as items(item_id)
  ) then
    raise exception 'El menu no puede contener alimentos duplicados.';
  end if;

  delete from public.menu_diario
  where fecha = p_fecha;

  insert into public.menu_diario (
    fecha,
    id_alimento,
    imagen_url,
    created_by
  )
  select
    p_fecha,
    item_id,
    p_imagen_url,
    p_user_id
  from unnest(p_alimentos_ids) as items(item_id);

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.replace_daily_menu(date, bigint[], text, uuid)
  from public, anon, authenticated;
grant execute on function public.replace_daily_menu(date, bigint[], text, uuid)
  to service_role;
