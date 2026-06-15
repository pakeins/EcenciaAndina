const DEFAULT_TIME_ZONE = 'America/Bogota';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const getReportTimeZone = () =>
  process.env.REPORT_TIMEZONE || process.env.N8N_ECIENCIA_TIMEZONE || DEFAULT_TIME_ZONE;

const getLunchCategoryIds = () => {
  const ids = String(process.env.REPORT_LUNCH_CATEGORY_IDS || '1')
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);
  return new Set(ids.length ? ids : [1]);
};

const getConsumedStateId = () => {
  const value = Number(process.env.REPORT_CONSUMED_STATE_ID || 2);
  return Number.isInteger(value) && value > 0 ? value : 2;
};

const createHttpError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const parseDateParts = (value) => {
  if (!DATE_PATTERN.test(String(value || ''))) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
};

const formatDateParts = ({ year, month, day }) =>
  `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

const addDays = (dateString, amount) => {
  const parts = parseDateParts(dateString);
  if (!parts) throw createHttpError(400, 'La fecha debe tener formato YYYY-MM-DD.');
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + amount));
  return formatDateParts({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
};

const getDateInTimeZone = (date, timeZone = getReportTimeZone()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
};

const getTimeZoneOffsetMilliseconds = (date, timeZone) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(value.year),
    Number(value.month) - 1,
    Number(value.day),
    Number(value.hour),
    Number(value.minute),
    Number(value.second),
  );
  return asUtc - date.getTime();
};

const zonedStartOfDay = (dateString, timeZone = getReportTimeZone()) => {
  const parts = parseDateParts(dateString);
  if (!parts) throw createHttpError(400, 'La fecha debe tener formato YYYY-MM-DD.');

  const localMidnightAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day);
  let instant = new Date(localMidnightAsUtc);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const offset = getTimeZoneOffsetMilliseconds(instant, timeZone);
    instant = new Date(localMidnightAsUtc - offset);
  }
  return instant;
};

const buildDateRange = (startDate, endDate, timeZone = getReportTimeZone()) => ({
  startDate,
  endDate,
  start: zonedStartOfDay(startDate, timeZone).toISOString(),
  endExclusive: zonedStartOfDay(addDays(endDate, 1), timeZone).toISOString(),
  timeZone,
});

const parseDateRange = (
  query,
  { required = false, timeZone = getReportTimeZone() } = {},
) => {
  const startDate = String(query.fecha_inicio || '').trim();
  const endDate = String(query.fecha_fin || '').trim();

  if (!startDate && !endDate) {
    if (required) {
      throw createHttpError(400, 'Las fechas de inicio y fin son obligatorias.');
    }
    return null;
  }
  if (!startDate || !endDate) {
    throw createHttpError(400, 'Debe enviar ambas fechas: fecha_inicio y fecha_fin.');
  }
  if (!parseDateParts(startDate) || !parseDateParts(endDate)) {
    throw createHttpError(400, 'El formato de las fechas debe ser YYYY-MM-DD.');
  }
  if (endDate < startDate) {
    throw createHttpError(400, 'La fecha de fin no puede ser anterior a la de inicio.');
  }
  return buildDateRange(startDate, endDate, timeZone);
};

const getDefaultDashboardRanges = (now = new Date(), timeZone = getReportTimeZone()) => {
  const currentDate = getDateInTimeZone(now, timeZone);
  const parts = parseDateParts(currentDate);
  const utcDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const dayOfWeek = utcDate.getUTCDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekStart = addDays(currentDate, mondayOffset);
  const weekEnd = addDays(weekStart, 6);
  const monthStart = `${currentDate.slice(0, 7)}-01`;
  const nextMonth = new Date(Date.UTC(parts.year, parts.month, 1));
  const monthEnd = addDays(
    `${nextMonth.getUTCFullYear()}-${String(nextMonth.getUTCMonth() + 1).padStart(2, '0')}-01`,
    -1,
  );

  return {
    day: buildDateRange(currentDate, currentDate, timeZone),
    week: buildDateRange(weekStart, weekEnd, timeZone),
    month: buildDateRange(monthStart, monthEnd, timeZone),
  };
};

const applyDateRange = (query, range, column = 'created_at') =>
  query.gte(column, range.start).lt(column, range.endExclusive);

const isWithinRange = (dateValue, range) => {
  const timestamp = new Date(dateValue).getTime();
  return timestamp >= new Date(range.start).getTime() && timestamp < new Date(range.endExclusive).getTime();
};

const asRelation = (value) => (Array.isArray(value) ? value[0] : value);
const asArray = (value) => (Array.isArray(value) ? value : []);
const asNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const getProduct = (detail) => asRelation(detail?.productos);

const getConvenioName = (order) => {
  const client = asRelation(order?.clientes);
  const link = asArray(client?.clientes_convenios)[0];
  const convenio = asRelation(link?.convenios);
  return convenio?.nombre_empresa || 'Clientes frecuentes';
};

const getOrderDetails = (order) => asArray(order?.detalle_orden);

const getLunchDetails = (order, lunchCategoryIds) =>
  getOrderDetails(order).filter((detail) => {
    const product = getProduct(detail);
    return lunchCategoryIds.has(Number(product?.id_categoria));
  });

const getRangeDates = (range) => {
  const dates = [];
  for (let current = range.startDate; current <= range.endDate; current = addDays(current, 1)) {
    dates.push(current);
  }
  return dates;
};

const getDayLabel = (dateString, compact) => {
  if (compact) {
    const [, month, day] = dateString.split('-');
    return `${day}/${month}`;
  }
  const labels = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
  const parts = parseDateParts(dateString);
  return labels[new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()];
};

const sumLunches = (orders, range, lunchCategoryIds, dateField = 'consumed_at') =>
  orders
    .filter((order) => order[dateField] && isWithinRange(order[dateField], range))
    .reduce(
      (total, order) =>
        total + getLunchDetails(order, lunchCategoryIds).reduce((sum, detail) => sum + asNumber(detail.cantidad), 0),
      0,
    );

const sumLunchIncome = (orders, range, lunchCategoryIds, dateField = 'consumed_at') =>
  orders
    .filter((order) => order[dateField] && isWithinRange(order[dateField], range))
    .reduce(
      (total, order) =>
        total +
        getLunchDetails(order, lunchCategoryIds).reduce(
          (sum, detail) => sum + asNumber(detail.cantidad) * asNumber(detail.precio_aplicado),
          0,
        ),
      0,
    );

const aggregateDashboard = ({
  orders = [],
  reservationOrders = [],
  customRange = null,
  defaultRanges,
  activeConvenios = 0,
  activeClients = 0,
  timeZone = getReportTimeZone(),
  lunchCategoryIds = getLunchCategoryIds(),
  consumedStateId = getConsumedStateId(),
}) => {
  const consumedOrders = orders.filter((order) => Number(order.id_estado) === consumedStateId);
  const primaryRange = customRange || defaultRanges.day;
  const secondaryRange = customRange || defaultRanges.month;
  const chartRange = customRange || defaultRanges.week;
  const convenioRange = customRange || defaultRanges.month;
  const productRange = customRange || defaultRanges.month;
  const dailyMap = Object.fromEntries(getRangeDates(chartRange).map((date) => [date, 0]));
  consumedOrders
    .filter((order) => order.consumed_at && isWithinRange(order.consumed_at, chartRange))
    .forEach((order) => {
      const localDate = getDateInTimeZone(new Date(order.consumed_at), timeZone);
      if (dailyMap[localDate] === undefined) return;
      dailyMap[localDate] += getLunchDetails(order, lunchCategoryIds).reduce(
        (sum, detail) => sum + asNumber(detail.cantidad),
        0,
      );
    });

  const convenioMap = {};
  consumedOrders
    .filter((order) => order.consumed_at && isWithinRange(order.consumed_at, convenioRange))
    .forEach((order) => {
      const quantity = getLunchDetails(order, lunchCategoryIds).reduce(
        (sum, detail) => sum + asNumber(detail.cantidad),
        0,
      );
      if (!quantity) return;
      const name = getConvenioName(order);
      convenioMap[name] = (convenioMap[name] || 0) + quantity;
    });

  const productMap = {};
  consumedOrders
    .filter((order) => order.consumed_at && isWithinRange(order.consumed_at, productRange))
    .forEach((order) => {
      getOrderDetails(order).forEach((detail) => {
        const product = getProduct(detail);
        const name = product?.nombre_producto || 'Sin producto';
        productMap[name] = (productMap[name] || 0) + asNumber(detail.cantidad);
      });
    });

  return {
    metrics: {
      almuerzosHoy: sumLunches(consumedOrders, primaryRange, lunchCategoryIds),
      almuerzosHoyTitle: customRange ? 'Almuerzos del periodo' : 'Almuerzos hoy',
      almuerzosHoyDesc: customRange ? 'Consumidos en el periodo filtrado' : 'Consumidos el dia de hoy',
      almuerzosMes: customRange
        ? Number(sumLunchIncome(consumedOrders, secondaryRange, lunchCategoryIds).toFixed(2))
        : sumLunches(consumedOrders, secondaryRange, lunchCategoryIds),
      almuerzosMesTitle: customRange ? 'Ingresos por almuerzos' : 'Almuerzos del mes',
      almuerzosMesDesc: customRange ? 'Ventas del periodo filtrado' : 'Total acumulado mensual',
      conveniosActivos: asNumber(activeConvenios),
      clientesFrecuentes: asNumber(activeClients),
    },
    consumosPorDia: Object.entries(dailyMap).map(([date, value]) => ({
      name: getDayLabel(date, Boolean(customRange)),
      date,
      value,
    })),
    consumosPorConvenio: Object.entries(convenioMap)
      .map(([name, value]) => ({ name, value }))
      .sort((left, right) => right.value - left.value),
    reservasVsConsumos: getRangeDates(chartRange).map((date) => ({
      name: getDayLabel(date, Boolean(customRange)),
      date,
      reservados: reservationOrders.filter(
        (order) =>
          order.created_at &&
          getDateInTimeZone(new Date(order.created_at), timeZone) === date,
      ).length,
      consumidos: consumedOrders.filter(
        (order) =>
          order.consumed_at &&
          getDateInTimeZone(new Date(order.consumed_at), timeZone) === date,
      ).length,
    })),
    topProducts: Object.entries(productMap)
      .map(([name, value]) => ({ name, value }))
      .sort((left, right) => right.value - left.value)
      .slice(0, 4),
  };
};

module.exports = {
  DATE_PATTERN,
  addDays,
  aggregateDashboard,
  applyDateRange,
  buildDateRange,
  createHttpError,
  getConsumedStateId,
  getDateInTimeZone,
  getDefaultDashboardRanges,
  getLunchCategoryIds,
  getReportTimeZone,
  parseDateParts,
  parseDateRange,
  zonedStartOfDay,
};
