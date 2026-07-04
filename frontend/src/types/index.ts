// User roles
export type UserRole = 'administrador' | 'caja';

// Order states
export type OrderState = 'reservado' | 'consumido' | 'cancelado';

// Client types
export type ClientType = 'convenio' | 'cliente';
export type TelegramStatus =
  | 'no_invitation'
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'revoked'
  | 'deletion_pending';

// Lunch types
export type TipoAlmuerzo = 'normal' | 'vip' | 'ejecutivo';

export interface User {
  id: string;
  nombre: string;
  apellido?: string;
  nombre_usuario?: string;
  email: string;
  rol: UserRole;
}

export interface Client {
  id: string;
  cedula: string;
  nombre: string;
  apellido: string;
  telefono: string;
  correo: string;
  activo: boolean;
  id_tipo_cliente?: number;
  tipo_nombre?: string;
  convenio?: {
    id: string;
    nombre: string;
  } | null;
  telegram?: {
    status: TelegramStatus;
    policy_current: boolean;
    consent_version: string | null;
    has_chat: boolean;
    telegram_username: string | null;
    invitation_expires_at: string | null;
    last_menu_sent_at: string | null;
    email_delivery: TelegramEmailDelivery | null;
  };
  telegram_onboarding?: TelegramOnboarding;
}

export interface TelegramOnboarding {
  status: 'pending' | 'sent';
  onboarding_url: string | null;
  expires_at: string | null;
  email_delivery: TelegramEmailDelivery | null;
}

export interface TelegramEmailDelivery {
  status: 'not_attempted' | 'not_configured' | 'pending' | 'sent' | 'failed';
  recipient: string | null;
  provider_id: string | null;
  attempted_at?: string | null;
  sent_at?: string | null;
}

export interface TelegramPrivacyRequest {
  id: string;
  request_type: 'access' | 'deletion' | 'revocation' | 'other';
  status: 'pending' | 'in_review' | 'resolved' | 'rejected';
  retained_order_count: number;
  details: Record<string, unknown>;
  requested_at: string;
  resolved_at: string | null;
  resolution_notes: string | null;
  clientes?: {
    id_cliente: string;
    nombre: string;
    apellido: string;
    cedula: string;
  } | null;
}

export interface Convenio {
  id: string;
  ruc: string;
  nombre_empresa: string;
  representante: string;
  telefono: string;
  email: string;
  fecha_inicio: string;
  fecha_caducidad: string;
  activo: boolean;
  cupo_maximo: number;
  totalColaboradores: number;
  consumoMensual: number;
  archivo_firmado?: string;
}

export interface ConvenioHistorial {
  id: string;
  id_convenio: string;
  fecha_inicio: string;
  fecha_caducidad: string;
  archivo_firmado: string | null;
  archivo_url: string | null;
  fecha_registro: string;
}

export interface Product {
  id: string;
  nombre: string;
  precio: number;
  categoria: string;
}

export interface OrderProduct {
  productoId: string;
  nombre: string;
  cantidad: number;
  precio: number;
}

export interface Order {
  id: string;
  clienteId: string;
  clienteNombre: string;
  appMensajeria: string;
  tipoCliente: ClientType;
  convenioNombre?: string;
  almuerzo: string;
  tipoAlmuerzo: TipoAlmuerzo;
  platoFuerte: string;
  sopa: string;
  cantidad: number;
  estado: OrderState;
  productos: OrderProduct[];
  observaciones: string;
  fecha: string;
  hora: string;
}

export interface Consumption {
  id: string;
  pedidoId: string;
  clienteId: string;
  convenioId?: string;
  cantidad: number;
  total: number;
  fecha: string;
}

export interface DashboardMetrics {
  almuerzosHoy: number;
  almuerzosMes: number;
  conveniosActivos: number;
  clientesFrecuentes: number;
}

export interface ChartData {
  name: string;
  value: number;
}

export interface Alimento {
  id: number;
  nombre: string;
  id_categoria: number;
}
