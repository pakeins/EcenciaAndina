insert into public.roles (id_rol, nombre_rol)
values
  (1, 'Super Admin'),
  (2, 'Empleado')
on conflict (id_rol) do update set nombre_rol = excluded.nombre_rol;

insert into public.tipos_cliente (id_tipo_cliente, nombre_tipo)
values
  (1, 'Cliente frecuente'),
  (2, 'Cliente de convenio')
on conflict (id_tipo_cliente) do update set nombre_tipo = excluded.nombre_tipo;

insert into public.estados_orden (id_estado, nombre_estado)
values
  (1, 'Reservado'),
  (2, 'Consumido'),
  (3, 'Cancelado')
on conflict (id_estado) do update set nombre_estado = excluded.nombre_estado;

insert into public.origenes_pedido (id_origen, nombre_origen)
values
  (1, 'Telegram'),
  (2, 'Sistema')
on conflict (id_origen) do update set nombre_origen = excluded.nombre_origen;

insert into public.categorias_productos (id_categoria, nombre_categoria)
values
  (1, 'Almuerzos'),
  (2, 'Restaurante'),
  (3, 'Tienda')
on conflict (id_categoria) do update set nombre_categoria = excluded.nombre_categoria;

insert into public.categorias_menu (id_categoria_menu, nombre_categoria, codigo)
values
  (1, 'Sopa', 'sopas'),
  (2, 'Plato fuerte', 'segundos'),
  (3, 'Guarnicion', 'guarniciones')
on conflict (id_categoria_menu) do update set
  nombre_categoria = excluded.nombre_categoria,
  codigo = excluded.codigo;

-- Canonical development catalog. This seed is only used for fresh/local resets.
delete from public.alimentos;
delete from public.productos;

insert into public.productos (
  id_producto,
  id_categoria,
  nombre_producto,
  precio_unitario,
  descripcion,
  esta_activo
)
values
  (1, 1, 'Almuerzo', 4.50, 'Almuerzo completo del dia', true),
  (2, 1, 'Almuerzo Telegram', 4.50, 'Almuerzo reservado mediante Telegram', true),
  (3, 2, 'Jugo natural', 1.50, 'Jugo natural de temporada', true),
  (4, 2, 'Postre de la casa', 2.00, 'Postre artesanal', true),
  (5, 3, 'Agua mineral 500ml', 1.00, 'Botella personal', true),
  (6, 3, 'Cafe organico', 1.75, 'Cafe caliente', true)
on conflict (id_producto) do update set
  id_categoria = excluded.id_categoria,
  nombre_producto = excluded.nombre_producto,
  precio_unitario = excluded.precio_unitario,
  descripcion = excluded.descripcion,
  esta_activo = excluded.esta_activo;

insert into public.alimentos (id_alimento, id_categoria_menu, nombre_alimento)
values
  (1, 1, 'Sopa de quinoa'),
  (2, 1, 'Crema de zapallo'),
  (3, 2, 'Pollo al horno con hierbas'),
  (4, 2, 'Llapingacho con ensalada'),
  (5, 2, 'Menestra de lenteja'),
  (6, 3, 'Mote pillo'),
  (7, 3, 'Pure de papa')
on conflict (id_alimento) do update set
  id_categoria_menu = excluded.id_categoria_menu,
  nombre_alimento = excluded.nombre_alimento;

insert into public.menu_settings (id, image_retention_days)
values (1, 14)
on conflict (id) do update set image_retention_days = excluded.image_retention_days;

select setval(pg_get_serial_sequence('public.roles', 'id_rol'), greatest((select max(id_rol) from public.roles), 1), true);
select setval(pg_get_serial_sequence('public.tipos_cliente', 'id_tipo_cliente'), greatest((select max(id_tipo_cliente) from public.tipos_cliente), 1), true);
select setval(pg_get_serial_sequence('public.estados_orden', 'id_estado'), greatest((select max(id_estado) from public.estados_orden), 1), true);
select setval(pg_get_serial_sequence('public.origenes_pedido', 'id_origen'), greatest((select max(id_origen) from public.origenes_pedido), 1), true);
select setval(pg_get_serial_sequence('public.categorias_productos', 'id_categoria'), greatest((select max(id_categoria) from public.categorias_productos), 1), true);
select setval(pg_get_serial_sequence('public.categorias_menu', 'id_categoria_menu'), greatest((select max(id_categoria_menu) from public.categorias_menu), 1), true);
select setval(pg_get_serial_sequence('public.productos', 'id_producto'), greatest((select max(id_producto) from public.productos), 1), true);
select setval(pg_get_serial_sequence('public.alimentos', 'id_alimento'), greatest((select max(id_alimento) from public.alimentos), 1), true);
