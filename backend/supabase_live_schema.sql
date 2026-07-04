-- Base de Datos Actual (Extraída desde Supabase OpenAPI)

CREATE TABLE public.saldos_servicio (
  id_cliente uuid NOT NULL PRIMARY KEY REFERENCES public.clientes(id_cliente),
  id_producto bigint NOT NULL PRIMARY KEY REFERENCES public.productos(id_producto),
  cantidad_disponible integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone DEFAULT now(),
  updated_by uuid
);

CREATE TABLE public.productos (
  id_producto bigint NOT NULL PRIMARY KEY,
  id_categoria bigint REFERENCES public.categorias_productos(id_categoria),
  nombre_producto text NOT NULL,
  precio_unitario numeric NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  created_by uuid,
  updated_at timestamp with time zone DEFAULT now(),
  updated_by uuid,
  esta_activo boolean DEFAULT true,
  descripcion text
);

CREATE TABLE public.categorias_productos (
  id_categoria bigint NOT NULL PRIMARY KEY,
  nombre_categoria text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  created_by uuid
);

CREATE TABLE public.detalle_orden (
  id_detalle uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  id_orden uuid REFERENCES public.ordenes(id_orden),
  id_producto bigint REFERENCES public.productos(id_producto),
  cantidad integer NOT NULL,
  precio_aplicado numeric NOT NULL,
  updated_at timestamp with time zone DEFAULT now(),
  created_by uuid REFERENCES public.empleados(id),
  updated_by uuid REFERENCES public.empleados(id),
  opciones jsonb
);

CREATE TABLE public.clientes_convenios (
  id_cliente uuid NOT NULL PRIMARY KEY REFERENCES public.clientes(id_cliente),
  id_convenio uuid NOT NULL PRIMARY KEY REFERENCES public.convenios(id_convenio),
  created_at timestamp with time zone DEFAULT now(),
  created_by uuid
);

CREATE TABLE public.ordenes (
  id_orden uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  id_cliente uuid REFERENCES public.clientes(id_cliente),
  id_estado bigint REFERENCES public.estados_orden(id_estado),
  id_origen bigint REFERENCES public.origenes_pedido(id_origen),
  canal_origen text,
  created_at timestamp with time zone DEFAULT now(),
  created_by uuid,
  observaciones text,
  id_empleado_atiende uuid REFERENCES public.empleados(id),
  metodo_pago text,
  updated_at timestamp with time zone DEFAULT now(),
  updated_by uuid
);

CREATE TABLE public.menu_diario (
  id_menu_diario uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha date NOT NULL,
  id_alimento bigint REFERENCES public.alimentos(id_alimento),
  created_at timestamp with time zone DEFAULT now(),
  created_by uuid
);

CREATE TABLE public.conveniohistorial (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  id_convenio uuid REFERENCES public.convenios(id_convenio),
  fecha_inicio date NOT NULL,
  fecha_caducidad date NOT NULL,
  archivo_firmado text,
  fecha_registro timestamp with time zone DEFAULT now()
);

CREATE TABLE public.origenes_pedido (
  id_origen bigint NOT NULL PRIMARY KEY,
  nombre_origen text NOT NULL
);

CREATE TABLE public.tipos_cliente (
  id_tipo_cliente bigint NOT NULL PRIMARY KEY,
  nombre_tipo text NOT NULL
);

CREATE TABLE public.alimentos (
  id_alimento bigint NOT NULL PRIMARY KEY,
  id_categoria_menu bigint REFERENCES public.categorias_menu(id_categoria_menu),
  nombre_alimento text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  created_by uuid,
  updated_at timestamp with time zone DEFAULT now(),
  updated_by uuid
);

CREATE TABLE public.recargas_saldo (
  id_recarga uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  id_cliente uuid REFERENCES public.clientes(id_cliente),
  id_producto bigint REFERENCES public.productos(id_producto),
  cantidad_comprada integer NOT NULL,
  monto_total numeric NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  created_by uuid,
  updated_at timestamp with time zone DEFAULT now(),
  updated_by uuid,
  numero_factura character varying
);

CREATE TABLE public.categorias_menu (
  id_categoria_menu bigint NOT NULL PRIMARY KEY,
  nombre_categoria text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  created_by uuid,
  updated_at timestamp with time zone DEFAULT now(),
  updated_by uuid
);

CREATE TABLE public.convenios (
  id_convenio uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  ruc text NOT NULL,
  nombre_empresa text NOT NULL,
  representante text,
  telefono text,
  email text,
  fecha_inicio date NOT NULL,
  fecha_caducidad date NOT NULL,
  esta_activo boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  created_by uuid,
  updated_at timestamp with time zone DEFAULT now(),
  updated_by uuid,
  cupo_maximo integer DEFAULT 0,
  archivo_firmado text
);

CREATE TABLE public.clientes (
  id_cliente uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  id_tipo_cliente bigint REFERENCES public.tipos_cliente(id_tipo_cliente),
  cedula text NOT NULL,
  nombre text NOT NULL,
  apellido text NOT NULL,
  telefono text,
  esta_activo boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  created_by uuid,
  updated_at timestamp with time zone DEFAULT now(),
  updated_by uuid
);

CREATE TABLE public.roles (
  id_rol bigint NOT NULL PRIMARY KEY,
  nombre_rol text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  created_by uuid,
  updated_at timestamp with time zone DEFAULT now(),
  updated_by uuid
);

CREATE TABLE public.empleados (
  id uuid NOT NULL PRIMARY KEY,
  id_rol bigint REFERENCES public.roles(id_rol),
  nombre text NOT NULL,
  apellido text NOT NULL,
  nombre_usuario text NOT NULL,
  correo text,
  esta_activo boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  created_by uuid,
  updated_at timestamp with time zone DEFAULT now(),
  updated_by uuid
);

CREATE TABLE public.estados_orden (
  id_estado bigint NOT NULL PRIMARY KEY,
  nombre_estado text NOT NULL
);

