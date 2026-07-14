const TIPOS_ALMUERZO = [
  { id: 6, code: 'ejecutivo_completo', label: 'Almuerzo Ejecutivo Completo', shortLabel: 'Ejecutivo Completo', nombreProducto: 'Almuerzo Ejecutivo Completo', requiresEntrada: true, requiresSopa: true, requiresSegundo: true, requiresBebida: true, requiresPostre: true },
  { id: 7, code: 'ejecutivo_sin_sopa', label: 'Almuerzo Ejecutivo Sin Sopa', shortLabel: 'Ejecutivo Sin Sopa', nombreProducto: 'Almuerzo Ejecutivo Sin Sopa', requiresEntrada: true, requiresSopa: false, requiresSegundo: true, requiresBebida: true, requiresPostre: true },
  { id: 8, code: 'ejecutivo_simple', label: 'Almuerzo Ejecutivo Simple', shortLabel: 'Ejecutivo Simple', nombreProducto: 'Almuerzo Ejecutivo Simple', requiresEntrada: false, requiresSopa: false, requiresSegundo: true, requiresBebida: true, requiresPostre: true },
  { id: 9, code: 'almuerzo_dia', label: 'Almuerzo del Dia', shortLabel: 'Almuerzo del Dia', nombreProducto: 'Almuerzo del Dia', requiresEntrada: false, requiresSopa: true, requiresSegundo: true, requiresBebida: true, requiresPostre: false },
  { id: 10, code: 'almuerzo_dia_simple', label: 'Almuerzo del Dia Simple', shortLabel: 'Almuerzo del Dia Simple', nombreProducto: 'Almuerzo del Dia Simple', requiresEntrada: false, requiresSopa: false, requiresSegundo: true, requiresBebida: true, requiresPostre: false },
];

const { labelForStep } = require('../utils/telegramHelpers');

const QUANTITIES = Array.from({ length: 20 }, (_, index) => index + 1);

const inlineKeyboard = (rows) => ({ inline_keyboard: rows });

const optionsKeyboard = (kind, options, sid) => {
  const rows = options.map((option, index) => [
    { text: String(option), callback_data: sid ? `${kind}:${index}:${sid}` : `${kind}:${index}` },
  ]);
  rows.push([
    { text: `Sin ${labelForStep(kind)}`, callback_data: sid ? `${kind}:sin:${sid}` : `${kind}:sin` },
  ]);
  rows.push([
    { text: '❌ Cancelar pedido', callback_data: 'confirm:cancel' },
  ]);
  return inlineKeyboard(rows);
};

const tipoAlmuerzoKeyboard = (sid, permitidos) => {
  const options = TIPOS_ALMUERZO.filter((t) => {
    if (!permitidos || permitidos.length === 0) return true;
    const genCode = t.nombreProducto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_');
    return permitidos.includes(t.code) || permitidos.includes(genCode);
  });
  return inlineKeyboard(
    options.map((tipo) => [{ text: tipo.shortLabel, callback_data: `tipo:${tipo.code}:${sid}` }]),
  );
};

const consentKeyboard = () =>
  inlineKeyboard([
    [{ text: 'Acepto', callback_data: 'consent:accept' }],
    [{ text: 'No acepto', callback_data: 'consent:reject' }],
  ]);

const revokeConfirmKeyboard = () =>
  inlineKeyboard([
    [{ text: 'Si, revocar mi consentimiento', callback_data: 'revocar:confirm' }],
    [{ text: 'No, mantener mi acceso', callback_data: 'revocar:cancel' }],
  ]);

const contactKeyboard = () => ({
  keyboard: [[{ text: 'Compartir mi telefono', request_contact: true }]],
  resize_keyboard: true,
  one_time_keyboard: true,
  input_field_placeholder: 'Usa el boton para continuar',
});

const removeKeyboard = () => ({ remove_keyboard: true });

const quantityKeyboard = () =>
  inlineKeyboard(
    QUANTITIES.reduce((rows, quantity, index) => {
      if (index % 5 === 0) rows.push([]);
      rows.at(-1).push({
        text: String(quantity),
        callback_data: `quantity:${quantity}`,
      });
      return rows;
    }, []),
  );

const confirmacionKeyboard = (sid) =>
  inlineKeyboard([
    [{ text: 'Aceptar', callback_data: `confirmar:ok:${sid}` }],
    [{ text: 'Modificar selección', callback_data: `confirmar:edit:${sid}` }],
    [{ text: '❌ Cancelar pedido', callback_data: 'confirm:cancel' }],
  ]);

const modificarPasosKeyboard = (session, sid) => {
  const tipo = session.tipoAlmuerzo;
  const rows = [];
  if (tipo.requiresEntrada && session.opciones?.entrada) {
    rows.push([{ text: `🥗 Entrada (${session.opciones.entrada})`, callback_data: `modstep:entrada:${sid}` }]);
  }
  if (tipo.requiresSopa && session.opciones?.sopa) {
    rows.push([{ text: `🍜 Sopa (${session.opciones.sopa})`, callback_data: `modstep:sopa:${sid}` }]);
  }
  if (tipo.requiresSegundo && session.opciones?.segundo) {
    rows.push([{ text: `🍽️ Plato Fuerte (${session.opciones.segundo})`, callback_data: `modstep:segundo:${sid}` }]);
  }
  if (tipo.requiresBebida && session.opciones?.bebida) {
    rows.push([{ text: `🥤 Bebida (${session.opciones.bebida})`, callback_data: `modstep:bebida:${sid}` }]);
  }
  if (tipo.requiresPostre && session.opciones?.postre) {
    rows.push([{ text: `🍰 Postre (${session.opciones.postre})`, callback_data: `modstep:postre:${sid}` }]);
  }
  rows.push([{ text: '🔙 Volver al resumen', callback_data: `confirmar:back:${sid}` }]);
  return inlineKeyboard(rows);
};

const confirmationKeyboard = () =>
  inlineKeyboard([
    [{ text: 'Confirmar reserva', callback_data: 'confirm:yes' }],
    [{ text: 'Cambiar seleccion', callback_data: 'confirm:edit' }],
    [{ text: 'Cancelar', callback_data: 'confirm:cancel' }],
  ]);

const pedidoKeyboard = (orderId) =>
  inlineKeyboard([
    [{ text: 'Modificar reserva', callback_data: `pedido:mod:${orderId}` }],
    [{ text: 'Cancelar reserva', callback_data: `pedido:can:${orderId}` }],
  ]);

const cancelConfirmKeyboard = (orderId) =>
  inlineKeyboard([
    [{ text: 'Si, cancelar mi reserva', callback_data: `pedido:can2:${orderId}` }],
    [{ text: 'No, mantener mi reserva', callback_data: `pedido:keep:${orderId}` }],
  ]);

const buildOrderSummaryMessage = (order, detail) => {
  const opc = detail?.opciones || {};
  const estadoStr = order._estadoNombre || String(order.id_estado);
  return (
    '✅ <b>Ya tienes una reserva activa para hoy:</b>\n\n' +
    `🍱 <b>Tipo:</b> ${detail?.productos?.nombre_producto || 'Almuerzo'}\n` +
    (opc.entrada ? `🥗 <b>Entrada:</b> ${opc.entrada}\n` : '') +
    (opc.sopa ? `🍜 <b>Sopa:</b> ${opc.sopa}\n` : '') +
    (opc.segundo ? `🍽️ <b>Plato fuerte:</b> ${opc.segundo}\n` : '') +
    (opc.bebida ? `🥤 <b>Bebida:</b> ${opc.bebida}\n` : '') +
    (opc.postre ? `🍰 <b>Postre:</b> ${opc.postre}\n` : '') +
    `\nℹ️ <b>Estado:</b> ${estadoStr}\n` +
    `🆔 <b>Orden:</b> #${order.numero_orden || order.id_orden.split('-')[0].substring(0, 5).toUpperCase()}\n\n` +
    '<i>Usa los botones de abajo si deseas interactuar con tu pedido.</i>'
  );
};

const buildPedidoMessage = (order, detail) => {
  const opc = detail?.opciones || {};
  return (
    '📋 <b>Tu reserva de hoy:</b>\n\n' +
    `🍱 <b>Producto:</b> ${detail?.productos?.nombre_producto || 'Almuerzo'}\n` +
    (opc.entrada ? `🥗 <b>Entrada:</b> ${opc.entrada}\n` : '') +
    (opc.sopa ? `🍜 <b>Sopa:</b> ${opc.sopa}\n` : '') +
    (opc.segundo ? `🍽️ <b>Plato fuerte:</b> ${opc.segundo}\n` : '') +
    (opc.bebida ? `🥤 <b>Bebida:</b> ${opc.bebida}\n` : '') +
    (opc.postre ? `🍰 <b>Postre:</b> ${opc.postre}\n` : '') +
    '\nℹ️ <b>Estado:</b> Reservado\n' +
    `🆔 <b>Orden:</b> #${order.numero_orden || order.id_orden.split('-')[0].substring(0, 5).toUpperCase()}`
  );
};

module.exports = { TIPOS_ALMUERZO, inlineKeyboard, optionsKeyboard, tipoAlmuerzoKeyboard, consentKeyboard, revokeConfirmKeyboard, contactKeyboard, removeKeyboard, quantityKeyboard, confirmacionKeyboard, modificarPasosKeyboard, confirmationKeyboard, pedidoKeyboard, cancelConfirmKeyboard, buildPedidoMessage, buildOrderSummaryMessage };