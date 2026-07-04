export type LunchTypeCode =
  | 'ejecutivo_completo'
  | 'ejecutivo_sin_sopa'
  | 'ejecutivo_simple'
  | 'almuerzo_dia'
  | 'almuerzo_dia_simple'
  | 'normal_ejecutivo'
  | 'segundo_almuerzo'
  | 'vegetariano'
  | 'especial'
  | 'con_extras';

export interface LunchType {
  id_tipo_almuerzo: number;
  codigo: LunchTypeCode;
  nombre: string;
  requiere_observaciones?: boolean;
  permite_extras?: boolean;
  es_principal?: boolean;
  esta_activo?: boolean;
}

export const LUNCH_TYPE_CODES = {
  ejecutivoCompleto: 'ejecutivo_completo',
  ejecutivoSinSopa: 'ejecutivo_sin_sopa',
  ejecutivoSimple: 'ejecutivo_simple',
  almuerzoDia: 'almuerzo_dia',
  almuerzoDiaSimple: 'almuerzo_dia_simple',
  normalEjecutivo: 'normal_ejecutivo',
  segundoAlmuerzo: 'segundo_almuerzo',
  vegetariano: 'vegetariano',
  especial: 'especial',
  conExtras: 'con_extras',
} as const;

export const LUNCH_TYPE_LABELS: Record<LunchTypeCode, string> = {
  ejecutivo_completo: 'Almuerzo Ejecutivo Completo',
  ejecutivo_sin_sopa: 'Almuerzo Ejecutivo Sin Sopa',
  ejecutivo_simple: 'Almuerzo Ejecutivo Simple',
  almuerzo_dia: 'Almuerzo del Dia',
  almuerzo_dia_simple: 'Almuerzo del Dia Simple',
  normal_ejecutivo: 'Normal / Ejecutivo',
  segundo_almuerzo: 'Segundo almuerzo',
  vegetariano: 'Vegetariano',
  especial: 'Especial',
  con_extras: 'Con extras',
};

export const DEFAULT_LUNCH_TYPE_ID = 9;
export const DEFAULT_LUNCH_TYPE_CODE = LUNCH_TYPE_CODES.almuerzoDia;

export const LUNCH_TYPE_REQUIRES_SOUP: Partial<Record<LunchTypeCode, boolean>> = {
  ejecutivo_completo: true,
  ejecutivo_sin_sopa: false,
  ejecutivo_simple: false,
  almuerzo_dia: true,
  almuerzo_dia_simple: false,
  normal_ejecutivo: true,
  segundo_almuerzo: false,
  vegetariano: true,
  especial: true,
  con_extras: true,
};

export const lunchTypeLabel = (code?: string, fallback = 'Almuerzo del Dia') =>
  (code && LUNCH_TYPE_LABELS[code as LunchTypeCode]) || fallback;

export const lunchTypeRequiresSoup = (code?: string) =>
  LUNCH_TYPE_REQUIRES_SOUP[code as LunchTypeCode] ?? true;
