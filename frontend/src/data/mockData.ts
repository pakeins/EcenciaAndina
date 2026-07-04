import {
  Order,
  Client,
  Convenio,
  Product,
  User,
  DashboardMetrics,
  ChartData,
  TipoAlmuerzo,
} from '@/types';

export const mockUsers: User[] = [
  { id: '1', nombre: 'Admin Usuario', email: 'admin@ecencia.com', rol: 'administrador' },
  { id: '2', nombre: 'Cajero Principal', email: 'caja@ecencia.com', rol: 'caja' },
];

// Menú del día
export const tiposAlmuerzo: { value: TipoAlmuerzo; label: string; precio: number }[] = [
  { value: 'normal', label: 'Normal', precio: 4.5 },
  { value: 'vip', label: 'VIP', precio: 6.5 },
  { value: 'ejecutivo', label: 'Ejecutivo', precio: 8.5 },
];

export const platosFuertes: string[] = ['Lomo Saltado', 'Pollo a la Plancha'];
export const sopas: string[] = ['Crema de Zapallo', 'Sopa Criolla'];

export const getTipoAlmuerzoLabel = (tipo: TipoAlmuerzo): string => {
  return tiposAlmuerzo.find((t) => t.value === tipo)?.label || tipo;
};

export const buildAlmuerzoLabel = (tipo: TipoAlmuerzo, plato: string, sopa: string): string => {
  return `${getTipoAlmuerzoLabel(tipo)} — ${plato} + ${sopa}`;
};

export const mockConvenios: Convenio[] = [
  {
    id: '1',
    ruc: '1790012345001',
    nombre_empresa: 'Corporacion Favorita',
    representante: 'María González',
    telefono: '+593 987654321',
    email: 'convenio1@empresas.example',
    fecha_inicio: '2026-01-01',
    fecha_caducidad: '2026-12-31',
    activo: true,
    totalColaboradores: 4,
    consumoMensual: 1250.0,
  },
  {
    id: '2',
    ruc: '1790067890001',
    nombre_empresa: 'Banco Pichincha',
    representante: 'Roberto Sánchez',
    telefono: '+593 912345678',
    email: 'convenio2@empresas.example',
    fecha_inicio: '2026-01-01',
    fecha_caducidad: '2026-06-30',
    activo: true,
    totalColaboradores: 3,
    consumoMensual: 890.5,
  },
  {
    id: '3',
    ruc: '1790099999001',
    nombre_empresa: 'Pronaca',
    representante: 'Carmen Herrera',
    telefono: '+593 998877665',
    email: 'convenio3@empresas.example',
    fecha_inicio: '2025-06-01',
    fecha_caducidad: '2025-12-31',
    activo: false,
    totalColaboradores: 1,
    consumoMensual: 0,
  },
];

export const mockClients: Client[] = [
  {
    id: '1',
    cedula: '1712345601',
    nombre: 'Carlos',
    apellido: 'Pérez',
    telefono: '+593987654321',
    correo: 'carlos.perez@clientes.example',
    activo: true,
  },
  {
    id: '2',
    cedula: '1712345602',
    nombre: 'Ana',
    apellido: 'Martínez',
    telefono: '+593987654322',
    correo: 'ana.martinez@clientes.example',
    activo: true,
  },
  {
    id: '3',
    cedula: '1712345603',
    nombre: 'Diana',
    apellido: 'López',
    telefono: '+593912345678',
    correo: 'diana.lopez@clientes.example',
    activo: true,
  },
  {
    id: '4',
    cedula: '1712345604',
    nombre: 'Juan',
    apellido: 'Rodríguez',
    telefono: '+593998765432',
    correo: 'juan.rodriguez@clientes.example',
    activo: true,
  },
  {
    id: '5',
    cedula: '1712345605',
    nombre: 'Laura',
    apellido: 'Gómez',
    telefono: '+593976543210',
    correo: 'laura.gomez@clientes.example',
    activo: true,
  },
  {
    id: '6',
    cedula: '1712345606',
    nombre: 'Pedro',
    apellido: 'Morales',
    telefono: '+593965432109',
    correo: 'pedro.morales@clientes.example',
    activo: false,
  },
];

export const mockProducts: Product[] = [
  { id: '1', nombre: 'Bebida Gaseosa', precio: 1.5, categoria: 'Bebidas' },
  { id: '2', nombre: 'Jugo Natural', precio: 2.0, categoria: 'Bebidas' },
  { id: '3', nombre: 'Postre del Día', precio: 2.5, categoria: 'Postres' },
  { id: '4', nombre: 'Café Americano', precio: 1.25, categoria: 'Bebidas' },
  { id: '5', nombre: 'Snack Saludable', precio: 1.75, categoria: 'Snacks' },
  { id: '6', nombre: 'Agua Mineral', precio: 1.0, categoria: 'Bebidas' },
  { id: '7', nombre: 'Té Helado', precio: 1.75, categoria: 'Bebidas' },
  { id: '8', nombre: 'Limonada Natural', precio: 2.25, categoria: 'Bebidas' },
  { id: '9', nombre: 'Capuchino', precio: 2.0, categoria: 'Bebidas' },
  { id: '10', nombre: 'Flan de Caramelo', precio: 2.25, categoria: 'Postres' },
  { id: '11', nombre: 'Helado Artesanal', precio: 2.75, categoria: 'Postres' },
  { id: '12', nombre: 'Brownie con Helado', precio: 3.5, categoria: 'Postres' },
  { id: '13', nombre: 'Fruta Fresca', precio: 1.5, categoria: 'Postres' },
  { id: '14', nombre: 'Papas Fritas', precio: 2.0, categoria: 'Snacks' },
  { id: '15', nombre: 'Nachos con Queso', precio: 3.0, categoria: 'Snacks' },
  { id: '16', nombre: 'Empanada de Carne', precio: 1.75, categoria: 'Snacks' },
  { id: '17', nombre: 'Porción Extra de Arroz', precio: 1.0, categoria: 'Extras' },
  { id: '18', nombre: 'Porción Extra de Ensalada', precio: 1.25, categoria: 'Extras' },
  { id: '19', nombre: 'Pan de Ajo', precio: 1.5, categoria: 'Extras' },
  { id: '20', nombre: 'Salsa Adicional', precio: 0.5, categoria: 'Extras' },
];

export const mockOrders: Order[] = [
  {
    id: '1',
    clienteId: '1',
    clienteNombre: 'Carlos Pérez',
    appMensajeria: '+593987654321',
    tipoCliente: 'convenio',
    convenioNombre: 'Corporacion Favorita',
    almuerzo: 'Ejecutivo — Lomo Saltado + Crema de Zapallo',
    tipoAlmuerzo: 'ejecutivo',
    platoFuerte: 'Lomo Saltado',
    sopa: 'Crema de Zapallo',
    cantidad: 1,
    estado: 'reservado',
    productos: [{ productoId: '2', nombre: 'Jugo Natural', cantidad: 1, precio: 2.0 }],
    observaciones: 'Sin cebolla',
    fecha: '2026-01-19',
    hora: '12:30',
  },
  {
    id: '2',
    clienteId: '2',
    clienteNombre: 'Ana Martínez',
    appMensajeria: '+593987654322',
    tipoCliente: 'convenio',
    convenioNombre: 'Corporacion Favorita',
    almuerzo: 'VIP — Pollo a la Plancha + Sopa Criolla',
    tipoAlmuerzo: 'vip',
    platoFuerte: 'Pollo a la Plancha',
    sopa: 'Sopa Criolla',
    cantidad: 2,
    estado: 'reservado',
    productos: [],
    observaciones: '',
    fecha: '2026-01-19',
    hora: '12:45',
  },
  {
    id: '3',
    clienteId: '4',
    clienteNombre: 'Juan Rodríguez',
    appMensajeria: '+593998765432',
    tipoCliente: 'cliente',
    almuerzo: 'Normal — Pollo a la Plancha + Crema de Zapallo',
    tipoAlmuerzo: 'normal',
    platoFuerte: 'Pollo a la Plancha',
    sopa: 'Crema de Zapallo',
    cantidad: 1,
    estado: 'consumido',
    productos: [],
    observaciones: 'Vegetariano',
    fecha: '2026-01-19',
    hora: '13:00',
  },
  {
    id: '4',
    clienteId: '3',
    clienteNombre: 'Diana López',
    appMensajeria: '+593912345678',
    tipoCliente: 'convenio',
    convenioNombre: 'Banco Pichincha',
    almuerzo: 'Ejecutivo — Lomo Saltado + Sopa Criolla',
    tipoAlmuerzo: 'ejecutivo',
    platoFuerte: 'Lomo Saltado',
    sopa: 'Sopa Criolla',
    cantidad: 1,
    estado: 'reservado',
    productos: [
      { productoId: '1', nombre: 'Bebida Gaseosa', cantidad: 1, precio: 1.5 },
      { productoId: '3', nombre: 'Postre del Día', cantidad: 1, precio: 2.5 },
    ],
    observaciones: '',
    fecha: '2026-01-19',
    hora: '12:15',
  },
  {
    id: '5',
    clienteId: '5',
    clienteNombre: 'Laura Gómez',
    appMensajeria: '+593976543210',
    tipoCliente: 'cliente',
    almuerzo: 'Normal — Lomo Saltado + Crema de Zapallo',
    tipoAlmuerzo: 'normal',
    platoFuerte: 'Lomo Saltado',
    sopa: 'Crema de Zapallo',
    cantidad: 1,
    estado: 'reservado',
    productos: [],
    observaciones: 'Extra arroz',
    fecha: '2026-01-19',
    hora: '13:15',
  },
];

export const mockDashboardMetrics: DashboardMetrics = {
  almuerzosHoy: 47,
  almuerzosMes: 856,
  conveniosActivos: 2,
  clientesFrecuentes: 23,
};

export const mockConsumosPorDia: ChartData[] = [
  { name: 'Lun', value: 42 },
  { name: 'Mar', value: 38 },
  { name: 'Mié', value: 45 },
  { name: 'Jue', value: 51 },
  { name: 'Vie', value: 47 },
  { name: 'Sáb', value: 12 },
  { name: 'Dom', value: 0 },
];

export const mockConsumosPorConvenio: ChartData[] = [
  { name: 'Corporacion Favorita', value: 320 },
  { name: 'Banco Pichincha', value: 245 },
  { name: 'Clientes', value: 180 },
  { name: 'Otros', value: 111 },
];
