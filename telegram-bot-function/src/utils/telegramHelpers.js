const crypto = require('crypto');

const generateSid = () => crypto.randomBytes(8).toString('hex');

const TIMEZONE = process.env.N8N_ECENCIA_TIMEZONE || 'America/Bogota';
const MAX_QUANTITY = 20;

const normalizeText = (value) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const todayInTimezone = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

const dayOfWeekInTimezone = () =>
  new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, weekday: 'long' }).format(new Date()).toLowerCase();

const isBusinessDay = () => {
  if (process.env.ECENCIA_BUSINESS_DAYS_ONLY === 'false') return true;
  const day = dayOfWeekInTimezone();
  return day !== 'saturday' && day !== 'sunday';
};

const tomorrowFromDate = (date) => {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
};

const labelForStep = (kind) => {
  switch (kind) {
  case 'entrada': return 'Entrada';
  case 'sopa': return 'Sopa';
  case 'segundo': return 'Plato Fuerte';
  case 'bebida': return 'Bebida';
  case 'postre': return 'Postre';
  default: return 'Opción';
  }
};

const quantityFromText = (text, current = null) => {
  const str = String(text || '');
  // Busca patrones: "cantidad: 3", "3 almuerzos", "pedido -2"
  const patterns = [
    /(?:cantidad|porci[oó]n|almuerzos?|pedidos?)[:\s]+([+-]?\d{1,2})(?!\d)/i,
    /([+-]?\d{1,2})(?!\d)\s*(?:almuerzos?|pedidos?|porciones?)/i,
    /pedido\s+([+-]?\d{1,2})(?!\d)/i,
  ];
  for (const re of patterns) {
    const m = str.match(re);
    if (m) {
      const value = Number.parseInt(m[1], 10);
      return { provided: true, valid: value >= 1 && value <= MAX_QUANTITY, value };
    }
  }
  return { provided: false, valid: true, value: current };
};

const parseStartToken = (text) => {
  const match = String(text || '').trim().match(/^\/start(?:@\w+)?(?:\s+([A-Za-z0-9_-]{1,128}))?$/i);
  if (!match) return null;
  return { isStart: true, token: match[1] || '' };
};

const activeConvenio = (client, today) => {
  for (const link of client.clientes_convenios || []) {
    const convenio = Array.isArray(link.convenios) ? link.convenios[0] : link.convenios;
    if (convenio?.esta_activo !== false && (!convenio?.fecha_caducidad || convenio.fecha_caducidad >= today)) {
      return {
        id_convenio: convenio.id_convenio || link.id_convenio,
        nombre_empresa: convenio.nombre_empresa || 'Convenio',
        tipos_almuerzo_permitidos: convenio.tipos_almuerzo_permitidos || null,
      };
    }
  }
  return null;
};

const orderConfirmation = (session, order) => {
  const numOrden = order.numero_orden || (order.id_orden ? order.id_orden.split('-')[0].substring(0, 5).toUpperCase() : '');
  const numText = numOrden ? ` #${numOrden}` : '';
  return (
    `✅ <b>¡Reserva Registrada Exitosamente!</b>\n\n` +
    `Tu pedido ha sido registrado con éxito.\n\n` +
    `🆔 <b>Orden:</b>${numText}\n` +
    `👤 <b>Cliente:</b> ${session.cliente?.nombre || ''} ${session.cliente?.apellido || ''}\n\n` +
    `<i>Puedes consultar o modificar tu reserva en cualquier momento usando el comando /pedido.</i>`
  );
};

module.exports = { normalizeText, todayInTimezone, dayOfWeekInTimezone, isBusinessDay, tomorrowFromDate, labelForStep, quantityFromText, parseStartToken, generateSid, activeConvenio, orderConfirmation };