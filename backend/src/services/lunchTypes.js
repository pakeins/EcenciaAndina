const LUNCH_TYPE_IDS = {
  normalEjecutivo: 1,
  segundoAlmuerzo: 2,
  vegetariano: 3,
  especial: 4,
  conExtras: 5,
  ejecutivoCompleto: 6,
  ejecutivoSinSopa: 7,
  ejecutivoSimple: 8,
  almuerzoDia: 9,
  almuerzoDiaSimple: 10,
};

const LUNCH_TYPE_CODES = {
  normalEjecutivo: 'normal_ejecutivo',
  segundoAlmuerzo: 'segundo_almuerzo',
  vegetariano: 'vegetariano',
  especial: 'especial',
  conExtras: 'con_extras',
  ejecutivoCompleto: 'ejecutivo_completo',
  ejecutivoSinSopa: 'ejecutivo_sin_sopa',
  ejecutivoSimple: 'ejecutivo_simple',
  almuerzoDia: 'almuerzo_dia',
  almuerzoDiaSimple: 'almuerzo_dia_simple',
};

const DEFAULT_LUNCH_TYPE_ID = LUNCH_TYPE_IDS.almuerzoDia;
const DEFAULT_LUNCH_TYPE_CODE = LUNCH_TYPE_CODES.almuerzoDia;

const LUNCH_PACKAGE_DETAILS = {
  [LUNCH_TYPE_CODES.ejecutivoCompleto]: {
    id: LUNCH_TYPE_IDS.ejecutivoCompleto,
    label: 'Almuerzo Ejecutivo Completo',
    productName: 'Almuerzo Ejecutivo Completo',
    price: 6.99,
    includesSoup: true,
    includedComponents: ['entrada', 'sopa', 'plato fuerte', 'postre', 'bebida'],
    reportKey: 'ejecutivoCompleto',
  },
  [LUNCH_TYPE_CODES.ejecutivoSinSopa]: {
    id: LUNCH_TYPE_IDS.ejecutivoSinSopa,
    label: 'Almuerzo Ejecutivo Sin Sopa',
    productName: 'Almuerzo Ejecutivo Sin Sopa',
    price: 6,
    includesSoup: false,
    includedComponents: ['entrada', 'plato fuerte', 'postre', 'bebida'],
    reportKey: 'ejecutivoSinSopa',
  },
  [LUNCH_TYPE_CODES.ejecutivoSimple]: {
    id: LUNCH_TYPE_IDS.ejecutivoSimple,
    label: 'Almuerzo Ejecutivo Simple',
    productName: 'Almuerzo Ejecutivo Simple',
    price: 4.5,
    includesSoup: false,
    includedComponents: ['plato fuerte', 'postre', 'bebida'],
    reportKey: 'ejecutivoSimple',
  },
  [LUNCH_TYPE_CODES.almuerzoDia]: {
    id: LUNCH_TYPE_IDS.almuerzoDia,
    label: 'Almuerzo del Dia',
    productName: 'Almuerzo del Dia',
    price: 4.5,
    includesSoup: true,
    includedComponents: ['sopa', 'plato fuerte', 'bebida'],
    reportKey: 'almuerzoDia',
  },
  [LUNCH_TYPE_CODES.almuerzoDiaSimple]: {
    id: LUNCH_TYPE_IDS.almuerzoDiaSimple,
    label: 'Almuerzo del Dia Simple',
    productName: 'Almuerzo del Dia Simple',
    price: 3.99,
    includesSoup: false,
    includedComponents: ['plato fuerte', 'bebida'],
    reportKey: 'almuerzoDiaSimple',
  },
};

const ACTIVE_LUNCH_TYPE_CODES = Object.keys(LUNCH_PACKAGE_DETAILS);

const LUNCH_TYPE_LABELS = {
  [LUNCH_TYPE_CODES.normalEjecutivo]: 'Normal / Ejecutivo',
  [LUNCH_TYPE_CODES.segundoAlmuerzo]: 'Segundo almuerzo',
  [LUNCH_TYPE_CODES.vegetariano]: 'Vegetariano',
  [LUNCH_TYPE_CODES.especial]: 'Especial',
  [LUNCH_TYPE_CODES.conExtras]: 'Con extras',
  ...Object.fromEntries(Object.entries(LUNCH_PACKAGE_DETAILS).map(([code, detail]) => [code, detail.label])),
};

const CODE_BY_ID = Object.fromEntries(
  Object.entries(LUNCH_TYPE_IDS).map(([, id]) => {
    const code = Object.values(LUNCH_TYPE_CODES).find((candidate) => LUNCH_TYPE_IDS[toCamelKey(candidate)] === id);
    return [id, code];
  }).filter(([, code]) => Boolean(code)),
);

function toCamelKey(code) {
  return String(code || '').replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase());
}

const normalizeText = (value) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const getLunchTypeCode = (detail = {}) => {
  if (detail.tipos_almuerzo?.codigo) return detail.tipos_almuerzo.codigo;
  if (detail.tipo_almuerzo?.codigo) return detail.tipo_almuerzo.codigo;
  if (detail.tipoAlmuerzoCodigo) return detail.tipoAlmuerzoCodigo;

  const codeById = CODE_BY_ID[Number(detail.id_tipo_almuerzo)];
  if (codeById) return codeById;

  return DEFAULT_LUNCH_TYPE_CODE;
};

const getLunchTypeLabel = (detail = {}) => {
  const code = getLunchTypeCode(detail);
  if (detail.tipos_almuerzo?.nombre) return detail.tipos_almuerzo.nombre;
  if (detail.tipo_almuerzo?.nombre) return detail.tipo_almuerzo.nombre;
  return LUNCH_TYPE_LABELS[code] || LUNCH_TYPE_LABELS[DEFAULT_LUNCH_TYPE_CODE];
};

const getLunchPackage = (codeOrDetail) => {
  const code = typeof codeOrDetail === 'string' ? codeOrDetail : getLunchTypeCode(codeOrDetail);
  return LUNCH_PACKAGE_DETAILS[code] || null;
};

const isActiveLunchPackageCode = (code) => Boolean(LUNCH_PACKAGE_DETAILS[code]);

const lunchTypeIncludesSoup = (codeOrDetail) => Boolean(getLunchPackage(codeOrDetail)?.includesSoup);

const lunchTypeIncludedComponents = (codeOrDetail) => getLunchPackage(codeOrDetail)?.includedComponents || [];

const isLunchProduct = (detail = {}) => {
  const product = detail.productos || detail.producto || {};
  const category = product.categorias_productos || product.categoria || {};
  const categoryName = normalizeText(category.nombre_categoria || detail.categoria_nombre || '');
  const productName = normalizeText(product.nombre_producto || detail.nombre_producto || detail.nombre || '');
  if (categoryName.includes('almuerzo')) return true;
  if (productName.includes('almuerzo')) return true;
  if (Number(product.id_tipo_almuerzo_default || detail.id_tipo_almuerzo_default || 0) > 0) return true;
  return false;
};

const toNumber = (value) => Number(value || 0);

const emptyPackageCounts = () => ({
  ejecutivoCompleto: 0,
  ejecutivoSinSopa: 0,
  ejecutivoSimple: 0,
  almuerzoDia: 0,
  almuerzoDiaSimple: 0,
  otrosAlmuerzos: 0,
  segundosAlmuerzos: 0,
  vegetarianos: 0,
  especiales: 0,
  almuerzosConExtras: 0,
});

const summarizeOrderDetails = (detalles = []) => {
  const summary = {
    almuerzosPrincipales: 0,
    ...emptyPackageCounts(),
    extrasCantidad: 0,
    extrasTotal: 0,
    totalConsumo: 0,
  };

  const detailRows = Array.isArray(detalles) ? detalles : [];

  for (const detail of detailRows) {
    const cantidad = toNumber(detail.cantidad);
    const lineTotal = cantidad * toNumber(detail.precio_aplicado);
    const code = getLunchTypeCode(detail);
    summary.totalConsumo += lineTotal;

    if (!isLunchProduct(detail)) {
      summary.extrasCantidad += cantidad;
      summary.extrasTotal += lineTotal;
      continue;
    }

    if (code === LUNCH_TYPE_CODES.segundoAlmuerzo) {
      summary.segundosAlmuerzos += cantidad;
      continue;
    }

    summary.almuerzosPrincipales += cantidad;
    const packageDetail = getLunchPackage(code);
    if (packageDetail?.reportKey) {
      summary[packageDetail.reportKey] += cantidad;
      continue;
    }

    summary.otrosAlmuerzos += cantidad;
    if (code === LUNCH_TYPE_CODES.vegetariano) summary.vegetarianos += cantidad;
    if (code === LUNCH_TYPE_CODES.especial) summary.especiales += cantidad;
    if (code === LUNCH_TYPE_CODES.conExtras) summary.almuerzosConExtras += cantidad;
  }

  return {
    ...summary,
    cantidadAlmuerzos: summary.almuerzosPrincipales,
  };
};

const formatDetailDescription = (detail = {}) => {
  const productName = detail.productos?.nombre_producto || detail.nombre_producto || 'Producto';
  const parts = [];
  parts.push(`${detail.cantidad}x ${productName}`);

  if (isLunchProduct(detail)) {
    parts.push(`(${getLunchTypeLabel(detail)})`);
  }

  if (detail.opciones?.sopa) parts.push(`Sopa: ${detail.opciones.sopa}`);
  if (detail.opciones?.segundo) parts.push(`Plato fuerte: ${detail.opciones.segundo}`);
  if (detail.opciones?.guarnicion) parts.push(`Guarnicion: ${detail.opciones.guarnicion}`);
  if (detail.observaciones_tipo) parts.push(`Obs. tipo: ${detail.observaciones_tipo}`);
  return parts.join(' - ');
};

const compactLunchSummary = (summary) => ({
  cantidadAlmuerzos: summary.almuerzosPrincipales,
  almuerzosPrincipales: summary.almuerzosPrincipales,
  ejecutivoCompleto: summary.ejecutivoCompleto,
  ejecutivoSinSopa: summary.ejecutivoSinSopa,
  ejecutivoSimple: summary.ejecutivoSimple,
  almuerzoDia: summary.almuerzoDia,
  almuerzoDiaSimple: summary.almuerzoDiaSimple,
  otrosAlmuerzos: summary.otrosAlmuerzos,
  segundosAlmuerzos: summary.segundosAlmuerzos,
  vegetarianos: summary.vegetarianos,
  especiales: summary.especiales,
  almuerzosConExtras: summary.almuerzosConExtras,
  extrasCantidad: summary.extrasCantidad,
  valorExtras: Number(summary.extrasTotal.toFixed(2)),
  totalConsumo: Number(summary.totalConsumo.toFixed(2)),
});

module.exports = {
  ACTIVE_LUNCH_TYPE_CODES,
  DEFAULT_LUNCH_TYPE_CODE,
  DEFAULT_LUNCH_TYPE_ID,
  LUNCH_PACKAGE_DETAILS,
  LUNCH_TYPE_CODES,
  LUNCH_TYPE_IDS,
  LUNCH_TYPE_LABELS,
  compactLunchSummary,
  formatDetailDescription,
  getLunchPackage,
  getLunchTypeCode,
  getLunchTypeLabel,
  isActiveLunchPackageCode,
  isLunchProduct,
  lunchTypeIncludedComponents,
  lunchTypeIncludesSoup,
  summarizeOrderDetails,
};
