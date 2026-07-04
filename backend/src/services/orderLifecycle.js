const { ORDER_STATE, notifyOrderStatusChange } = require('./orderNotifications');

const TIMEZONE = 'America/Bogota';
const SERVICE_CUTOFF_HOUR = 15;

// Hora del cierre automatico. Configurable con ECIENCIA_SERVICE_CUTOFF_HOUR
// (0-23); 'off' desactiva el cierre (util para pruebas profundas).
const serviceCutoffHour = () => {
  const raw = String(process.env.ECIENCIA_SERVICE_CUTOFF_HOUR ?? '').trim().toLowerCase();
  if (!raw) return SERVICE_CUTOFF_HOUR;
  if (['off', 'none', 'disabled'].includes(raw)) return null;
  const hour = Number(raw);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : SERVICE_CUTOFF_HOUR;
};

const zonedParts = (date = new Date(), timeZone = TIMEZONE) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
};

const localDateString = (date = new Date(), timeZone = TIMEZONE) => {
  const parts = zonedParts(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const isAfterServiceCutoff = (date = new Date(), timeZone = TIMEZONE) => {
  const cutoffHour = serviceCutoffHour();
  if (cutoffHour === null) return false;
  const parts = zonedParts(date, timeZone);
  const hour = Number(parts.hour === '24' ? 0 : parts.hour);
  const minute = Number(parts.minute || 0);
  const second = Number(parts.second || 0);
  return hour > cutoffHour || (hour === cutoffHour && (minute > 0 || second >= 0));
};

const dayRangeUtcForTimezone = (date = new Date(), timeZone = TIMEZONE) => {
  const localDay = localDateString(date, timeZone);
  const [year, month, day] = localDay.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, day, 5, 0, 0, 0));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { localDay, startIso: start.toISOString(), endIso: end.toISOString() };
};

const auditStateChange = async (adminClient, payload) => {
  const { error } = await adminClient.from('orden_estado_auditoria').insert([payload]);
  if (error) {
    console.warn('No se pudo registrar auditoria de estado de pedido:', error.message);
  }
};

const closePendingReservations = async (adminClient, options = {}) => {
  const now = options.now || new Date();
  const timeZone = options.timeZone || TIMEZONE;
  const notify = options.notify || notifyOrderStatusChange;
  const cutoffHour = serviceCutoffHour();

  if (cutoffHour === null) {
    return {
      skipped: true,
      reason: 'cutoff_disabled',
      closed: 0,
      notifications: [],
    };
  }

  if (!isAfterServiceCutoff(now, timeZone)) {
    return {
      skipped: true,
      reason: 'before_cutoff',
      closed: 0,
      notifications: [],
    };
  }

  const { localDay, startIso, endIso } = dayRangeUtcForTimezone(now, timeZone);
  const { data: orders, error } = await adminClient
    .from('ordenes')
    .select('id_orden,id_cliente,id_estado,created_at')
    .eq('id_estado', ORDER_STATE.RESERVED)
    .gte('created_at', startIso)
    .lt('created_at', endIso);

  if (error) throw error;

  const notifications = [];
  let closed = 0;

  for (const order of orders || []) {
    const { data: updated, error: updateError } = await adminClient
      .from('ordenes')
      .update({
        id_estado: ORDER_STATE.CANCELLED,
        updated_by: options.createdBy || null,
      })
      .eq('id_orden', order.id_orden)
      .eq('id_estado', ORDER_STATE.RESERVED)
      .select()
      .maybeSingle();

    if (updateError) throw updateError;
    if (!updated) continue;

    closed += 1;
    await auditStateChange(adminClient, {
      id_orden: order.id_orden,
      estado_anterior: ORDER_STATE.RESERVED,
      estado_nuevo: ORDER_STATE.CANCELLED,
      motivo: `Cierre automatico de reservas ${localDay} ${cutoffHour}:00`,
      monto_ajustado: 0,
      created_by: options.createdBy || null,
    });

    const notification = await notify(adminClient, {
      idOrden: order.id_orden,
      idCliente: order.id_cliente,
      previousState: ORDER_STATE.RESERVED,
      nextState: ORDER_STATE.CANCELLED,
      reason: 'service_closed',
      createdBy: options.createdBy || null,
    });
    if (notification) notifications.push({ id_orden: order.id_orden, ...notification });
  }

  return {
    skipped: false,
    localDay,
    closed,
    notifications,
  };
};

module.exports = {
  SERVICE_CUTOFF_HOUR,
  TIMEZONE,
  closePendingReservations,
  dayRangeUtcForTimezone,
  isAfterServiceCutoff,
  localDateString,
  serviceCutoffHour,
};
