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
