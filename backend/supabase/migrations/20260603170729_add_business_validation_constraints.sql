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
        ('convenios', 'chk_convenios_ruc_ec', array['ruc'], 'public.eciencia_is_valid_ec_ruc(ruc)'),
        ('convenios', 'chk_convenios_nombre_len', array['nombre_empresa'], 'char_length(nombre_empresa) <= 120'),
        ('convenios', 'chk_convenios_representante_len', array['representante'], 'representante is null or char_length(representante) <= 120'),
        ('convenios', 'chk_convenios_telefono_digits', array['telefono'], 'telefono is null or telefono ~ ''^\d{8,15}$'''),
        ('convenios', 'chk_convenios_email_len', array['email'], 'email is null or char_length(email) <= 254'),
        ('convenios', 'chk_convenios_cupo_non_negative', array['cupo_maximo'], 'cupo_maximo >= 0'),
        ('clientes', 'chk_clientes_documento_ec', array['cedula'], 'public.eciencia_is_valid_ec_cedula(cedula) or public.eciencia_is_valid_ec_ruc(cedula)'),
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
