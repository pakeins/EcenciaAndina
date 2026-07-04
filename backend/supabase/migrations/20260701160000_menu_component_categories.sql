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
