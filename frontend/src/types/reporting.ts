export type ReportType = 'ventas' | 'estados' | 'productos' | 'convenio' | 'clientes';

export interface ChartPoint {
  name: string;
  value: number;
  date?: string;
}

export interface DashboardMetricsResponse {
  almuerzosHoy: number;
  almuerzosHoyTitle: string;
  almuerzosHoyDesc: string;
  almuerzosMes: number;
  almuerzosMesTitle: string;
  almuerzosMesDesc: string;
  conveniosActivos: number;
  clientesFrecuentes: number;
}

export interface ReservationsVsConsumptionsPoint {
  name: string;
  date: string;
  reservados: number;
  consumidos: number;
}

export interface DashboardResponse {
  metrics: DashboardMetricsResponse;
  consumosPorDia: ChartPoint[];
  consumosPorConvenio: ChartPoint[];
  reservasVsConsumos: ReservationsVsConsumptionsPoint[];
  topProducts: ChartPoint[];
}

export interface SalesReportRow {
  metodo_pago: string;
  cantidadAlmuerzos: number;
  totalConsumo: number;
}

export interface OrderReportRow {
  id: string;
  fecha: string;
  cliente?: string;
  convenio?: string;
  estado: string;
  metodo_pago: string;
  descripcion: string;
  cantidadAlmuerzos: number;
  totalConsumo: number;
}

export interface ProductReportRow {
  nombre: string;
  categoria: string;
  cantidadVendida: number;
  ingresosGenerados: number;
}

export interface AgreementConsumption {
  fecha: string;
  producto: string;
  cantidad: number;
  valor: number;
}

export interface AgreementReportRow {
  empleado: string;
  cedula: string;
  total: number;
  consumos: AgreementConsumption[];
}

export type ReportData =
  | SalesReportRow[]
  | OrderReportRow[]
  | ProductReportRow[]
  | AgreementReportRow[];
