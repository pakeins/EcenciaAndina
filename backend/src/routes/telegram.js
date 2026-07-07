const express = require('express');
const { getAdminClient } = require('../config/supabase');
const { normalizePhone } = require('../validation/eciencia');
const { createOrderTrace, updateOrderTrace } = require('../services/telegramOrderTrace');
const {
  claimInvitation,
  consumeInvitation,
  getConsentVersion,
  getInvitationByToken,
  getPrivacySettings,
  hasCurrentConsent,
  privacyText,
  recordConsentEvent,
} = require('../services/telegramConsent');
const {
  answerCallback,
  deleteMessage,
  removeInlineKeyboard,
  sendMessage,
} = require('../services/telegramApi');

const router = express.Router();

const TIMEZONE = process.env.N8N_ECIENCIA_TIMEZONE || 'America/Bogota';
const DEFAULT_PRODUCT_NAME = process.env.N8N_ECIENCIA_PRODUCTO_ALMUERZO_NOMBRE || 'Almuerzo';
const ORIGEN_NOMBRE = process.env.N8N_ECIENCIA_ORIGEN_NOMBRE || 'Telegram';
const ESTADO_RESERVADO_NOMBRE = process.env.N8N_ECIENCIA_ESTADO_RESERVADO_NOMBRE || 'Reservado';
const QUANTITIES = Array.from({ length: 20 }, (_, index) => index + 1);

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
  if (process.env.ECIENCIA_BUSINESS_DAYS_ONLY === 'false') return true;
  const day = dayOfWeekInTimezone();
  return !['saturday', 'sunday'].includes(day);
};

const tomorrowFromDate = (date) => {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
};

const inlineKeyboard = (rows) => ({ inline_keyboard: rows });

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
    const genCode = t.nombreProducto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '_');
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
  rows.push([{ text: '⬅️ Volver a confirmar', callback_data: `confirmar:back:${sid}` }]);
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

const menuCaption = (today) =>
  `<b>🍱 Menú del día ${today}</b>\n\n` +
  'Realiza tu pedido seleccionando las opciones con los botones de abajo.\n\n' +
  '👉 <b>Paso 1:</b> Elige el tipo de almuerzo que deseas hoy:';

const TIPOS_ALMUERZO = [
  { id: 6, code: 'ejecutivo_completo', label: 'Almuerzo Ejecutivo Completo', shortLabel: 'Ejecutivo Completo', nombreProducto: 'Almuerzo Ejecutivo Completo', requiresEntrada: true, requiresSopa: true, requiresSegundo: true, requiresBebida: true, requiresPostre: true },
  { id: 7, code: 'ejecutivo_sin_sopa', label: 'Almuerzo Ejecutivo Sin Sopa', shortLabel: 'Ejecutivo Sin Sopa', nombreProducto: 'Almuerzo Ejecutivo Sin Sopa', requiresEntrada: true, requiresSopa: false, requiresSegundo: true, requiresBebida: true, requiresPostre: true },
  { id: 8, code: 'ejecutivo_simple', label: 'Almuerzo Ejecutivo Simple', shortLabel: 'Ejecutivo Simple', nombreProducto: 'Almuerzo Ejecutivo Simple', requiresEntrada: false, requiresSopa: false, requiresSegundo: true, requiresBebida: true, requiresPostre: true },
  { id: 9, code: 'almuerzo_dia', label: 'Almuerzo del Dia', shortLabel: 'Almuerzo del Dia', nombreProducto: 'Almuerzo del Dia', requiresEntrada: false, requiresSopa: true, requiresSegundo: true, requiresBebida: true, requiresPostre: false },
  { id: 10, code: 'almuerzo_dia_simple', label: 'Almuerzo del Dia Simple', shortLabel: 'Almuerzo del Dia Simple', nombreProducto: 'Almuerzo del Dia Simple', requiresEntrada: false, requiresSopa: false, requiresSegundo: true, requiresBebida: true, requiresPostre: false },
];

const readUpdate = (update) => {
  if (update.callback_query) {
    const from = update.callback_query.from || {};
    return {
      updateId: Number(update.update_id || 0) || null,
      messageId: Number(update.callback_query.message?.message_id || 0) || null,
      chatId: String(update.callback_query.message?.chat?.id || from.id || ''),
      telegramUserId: String(from.id || ''),
      telegramUsername: String(from.username || ''),
      text: String(update.callback_query.data || ''),
      callbackId: String(update.callback_query.id || ''),
      isCallback: true,
      contactPhone: '',
      contactVerified: false,
    };
  }

  const message = update.message || update.edited_message || {};
  const from = message.from || {};
  const contact = message.contact || null;
  const contactUserId = contact?.user_id ? String(contact.user_id) : '';
  const fromId = String(from.id || '');

  return {
    updateId: Number(update.update_id || 0) || null,
    messageId: Number(message.message_id || 0) || null,
    chatId: String(message.chat?.id || from.id || ''),
    telegramUserId: fromId,
    telegramUsername: String(from.username || ''),
    text: String(message.text || ''),
    callbackId: '',
    isCallback: false,
    contactPhone: String(contact?.phone_number || ''),
    contactVerified: Boolean(contact?.phone_number && contactUserId && fromId && contactUserId === fromId),
  };
};

const parseStartToken = (text) => {
  const match = String(text || '').trim().match(/^\/start(?:@\w+)?(?:\s+([A-Za-z0-9_-]{1,128}))?$/i);
  if (!match) return null;
  return { isStart: true, token: match[1] || '' };
};

const stateKey = (chatId) => `session:${chatId}`;
const consentKey = (chatId) => `consent:${chatId}`;

const getState = async (key) => {
  const { data, error } = await getAdminClient()
    .from('telegram_bot_state')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  if (error) throw error;
  return data?.value || null;
};

const setState = async (key, value) => {
  const { error } = await getAdminClient()
    .from('telegram_bot_state')
    .upsert(
      { key, value: { ...(value || {}), updatedAt: new Date().toISOString() } },
      { onConflict: 'key' },
    );
  if (error) throw error;
};

const deleteState = async (key) => {
  const { error } = await getAdminClient().from('telegram_bot_state').delete().eq('key', key);
  if (error) throw error;
};

const deleteChatStates = async (chatId) => {
  await Promise.all([deleteState(stateKey(chatId)), deleteState(consentKey(chatId))]);
};

const getSubscriptionByChat = async (chatId) => {
  const { data, error } = await getAdminClient()
    .from('telegram_subscriptions')
    .select('*')
    .eq('chat_id', String(chatId))
    .maybeSingle();
  if (error) throw error;
  return data || null;
};

const getSubscriptionByClient = async (idCliente) => {
  const { data, error } = await getAdminClient()
    .from('telegram_subscriptions')
    .select('*')
    .eq('id_cliente', idCliente)
    .maybeSingle();
  if (error) throw error;
  return data || null;
};

const getSubscriptionByPhone = async (phone) => {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  const { data, error } = await getAdminClient()
    .from('telegram_subscriptions')
    .select('*')
    .eq('phone_normalized', normalized)
    .maybeSingle();
  if (error) throw error;
  return data || null;
};

const getClientById = async (id) => {
  const { data, error } = await getAdminClient()
    .from('clientes')
    .select(
      'id_cliente,cedula,nombre,apellido,telefono,esta_activo,clientes_convenios(id_convenio,convenios(id_convenio,nombre_empresa,esta_activo,fecha_caducidad,tipos_almuerzo_permitidos))',
    )
    .eq('id_cliente', id)
    .maybeSingle();
  if (error) throw error;
  return data || null;
};

const ensurePendingSubscription = async (
  { idCliente, chatId, telegramUserId, telegramUsername },
) => {
  const [byClient, byChat] = await Promise.all([
    getSubscriptionByClient(idCliente),
    getSubscriptionByChat(chatId),
  ]);

  if (byClient && byChat && byClient.id !== byChat.id) {
    const error = new Error('El chat o cliente ya esta vinculado a otra suscripcion.');
    error.status = 409;
    throw error;
  }
  if (byChat?.id_cliente && byChat.id_cliente !== idCliente) {
    const error = new Error('Este chat ya pertenece a otro cliente.');
    error.status = 409;
    throw error;
  }
  if (byClient?.chat_id && String(byClient.chat_id) !== String(chatId)) {
    const error = new Error('El cliente ya esta vinculado a otro chat.');
    error.status = 409;
    throw error;
  }

  const payload = {
    id_cliente: idCliente,
    chat_id: String(chatId),
    telegram_user_id: telegramUserId ? String(telegramUserId) : null,
    telegram_username: telegramUsername || null,
    consent_status: 'pending',
    is_active: false,
    consent_notice_version: getConsentVersion(),
    consent_notice_text: privacyText(),
    consent_method: null,
    accepted_at: null,
    rejected_at: null,
    revoked_at: null,
    deletion_requested_at: null,
  };

  const existing = byClient || byChat;
  if (existing) {
    const { data, error } = await getAdminClient()
      .from('telegram_subscriptions')
      .update(payload)
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await getAdminClient()
    .from('telegram_subscriptions')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
};

const beginConsent = async ({
  idCliente,
  chatId,
  telegramUserId,
  telegramUsername,
  invitationId = null,
  cleanupMessageIds = [],
}) => {
  const subscription = await ensurePendingSubscription({
    idCliente,
    chatId,
    telegramUserId,
    telegramUsername,
  });
  const sent = await sendMessage(chatId, privacyText(), consentKeyboard());
  await setState(consentKey(chatId), {
    status: 'awaiting_decision',
    idCliente,
    subscriptionId: subscription.id,
    invitationId,
    policyVersion: getConsentVersion(),
    promptMessageIds: [],
    cleanupMessageIds: cleanupMessageIds.filter(Boolean),
  });
  return subscription;
};

const cleanupConsentMessages = async (chatId, state, additionalMessageIds = []) => {
  const ids = new Set([
    ...(state?.promptMessageIds || []),
    ...(state?.cleanupMessageIds || []),
    ...additionalMessageIds,
  ]);
  await Promise.all([...ids].filter(Boolean).map((messageId) => deleteMessage(chatId, messageId)));
};

const DEFAULT_TIPO_ALMUERZO_ID = 9; // almuerzo_dia

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
  return { id_convenio: null, nombre_empresa: 'Cliente frecuente', tipos_almuerzo_permitidos: null };
};

const getLookupId = async (table, idField, nameField, value) => {
  const { data, error } = await getAdminClient()
    .from(table)
    .select(`${idField},${nameField}`)
    .ilike(nameField, value)
    .limit(1);
  if (error) throw error;
  if (data?.[0]?.[idField]) return data[0][idField];
  throw new Error(`No encontre ${value} en ${table}.`);
};

const getProduct = async () => {
  const { data, error } = await getAdminClient()
    .from('productos')
    .select('id_producto,nombre_producto,precio_unitario,esta_activo')
    .eq('esta_activo', true)
    .order('id_producto', { ascending: true });
  if (error) throw error;
  const exact = (data || []).find((row) => normalizeText(row.nombre_producto) === normalizeText(DEFAULT_PRODUCT_NAME));
  const lunch = (data || []).find((row) => normalizeText(row.nombre_producto).includes('almuerzo'));
  const product = exact || lunch || data?.[0];
  if (!product) throw new Error('No hay producto activo para registrar la reserva.');
  return product;
};

const getActiveMenu = async () => {
  const state = await getState('latest-menu:active');
  if (!state || !state.menu) return null;
  return state;
};

const crypto = require('crypto');

const generateSid = () => crypto.randomBytes(8).toString('hex');

const startSessionForClient = async (chatId, client, opts = {}) => {
  const activeMenu = await getActiveMenu();
  if (!activeMenu) return null;

  const today = todayInTimezone();
  const sid = opts.sid || generateSid();
  const session = {
    sid,
    mode: opts.mode || 'new',
    step: opts.step || 'tipo',
    date: today,
    menuDate: activeMenu.date || today,
    menu: activeMenu.menu,
    quantity: opts.quantity || 1,
    opciones: opts.opciones || {},
    tipoAlmuerzo: opts.tipoAlmuerzo || null,
    cliente: {
      id_cliente: client.id_cliente,
      nombre: client.nombre,
      apellido: client.apellido,
    },
    convenio: activeConvenio(client, today),
    estadoReservadoId: await getLookupId('estados_orden', 'id_estado', 'nombre_estado', ESTADO_RESERVADO_NOMBRE),
    origenTelegramId: await getLookupId('origenes_pedido', 'id_origen', 'nombre_origen', ORIGEN_NOMBRE),
    createdAt: new Date().toISOString(),
    ...(opts.orderId ? { orderId: opts.orderId } : {}),
  };
  await setState(stateKey(chatId), session);
  return session;
};

const findActiveTodayOrder = async (clientId) => {
  const today = todayInTimezone();
  const { data, error } = await getAdminClient()
    .from('ordenes')
    .select('id_orden,id_estado,created_at,canal_origen')
    .eq('id_cliente', clientId)
    .eq('canal_origen', 'Telegram')
    .neq('id_estado', 3) // Excluir cancelados
    .gte('created_at', `${today}T00:00:00Z`)
    .lt('created_at', `${tomorrowFromDate(today)}T00:00:00Z`)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
};

const getOrderDetail = async (orderId) => {
  const { data, error } = await getAdminClient()
    .from('detalle_orden')
    .select('id_orden,id_producto,cantidad,precio_aplicado,id_tipo_almuerzo,observaciones_tipo,opciones,productos(nombre_producto)')
    .eq('id_orden', orderId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
};

const getEstadoName = async (idEstado) => {
  const { data } = await getAdminClient()
    .from('estados_orden')
    .select('nombre_estado')
    .eq('id_estado', idEstado)
    .maybeSingle();
  return data?.nombre_estado || String(idEstado);
};

const buildOrderSummaryMessage = (order, detail) => {
  const opc = detail?.opciones || {};
  const estadoStr = order._estadoNombre || String(order.id_estado);
  return (
    'Ya tienes una reserva registrada para hoy:\n\n' +
    `Tipo: ${detail?.productos?.nombre_producto || 'Almuerzo'}\n` +
    (opc.sopa ? `Sopa: ${opc.sopa}\n` : '') +
    (opc.segundo ? `Plato fuerte: ${opc.segundo}\n` : '') +
    `Estado: ${estadoStr}\n` +
    `Orden: ${order.id_orden}`
  );
};

const buildPedidoMessage = (order, detail) => {
  const opc = detail?.opciones || {};
  return (
    'Tu reserva de hoy:\n\n' +
    `Producto: ${detail?.productos?.nombre_producto || 'Almuerzo'}\n` +
    (opc.sopa ? `Sopa: ${opc.sopa}\n` : '') +
    (opc.segundo ? `Plato fuerte: ${opc.segundo}\n` : '') +
    'Estado: Reservado\n' +
    `Orden: ${order.id_orden}`
  );
};

const findTodayOrder = async (clientId, today) => {
  const { data, error } = await getAdminClient()
    .from('ordenes')
    .select('id_orden,created_at')
    .eq('id_cliente', clientId)
    .eq('canal_origen', 'Telegram')
    .neq('id_estado', 3) // Excluir cancelados
    .gte('created_at', `${today}T00:00:00Z`)
    .lt('created_at', `${tomorrowFromDate(today)}T00:00:00Z`)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
};

const insertOrder = async (session) => {
  const today = todayInTimezone();

  // Modo modificacion: actualizar detalle existente
  if (session.mode === 'modify' && session.orderId) {
    const tipoAlm = session.tipoAlmuerzo || {};
    const adminClient = getAdminClient();
    await adminClient
      .from('detalle_orden')
      .update({
        id_tipo_almuerzo: tipoAlm.id || null,
        opciones: {
          ...(session.opciones || {}),
          tipoAlmuerzo: tipoAlm.code || null,
          tipoOrigen: 'cliente_elige',
        },
      })
      .eq('id_orden', session.orderId);
    return { id_orden: session.orderId, modified: true };
  }

  const existing = await findTodayOrder(session.cliente.id_cliente, today);
  if (existing?.id_orden) return { id_orden: existing.id_orden, duplicate: true };

  const adminClient = getAdminClient();
  const tipoAlm = session.tipoAlmuerzo || {};
  const product = await (async () => {
    if (tipoAlm.nombreProducto) {
      const { data } = await adminClient
        .from('productos')
        .select('id_producto,nombre_producto,precio_unitario')
        .ilike('nombre_producto', tipoAlm.nombreProducto)
        .limit(1)
        .maybeSingle();
      if (data) return data;
    }
    return getProduct();
  })();

  const { data: order, error: orderError } = await adminClient
    .from('ordenes')
    .insert({
      id_cliente: session.cliente.id_cliente,
      id_estado: session.estadoReservadoId,
      id_origen: session.origenTelegramId,
      canal_origen: 'Telegram',
      metodo_pago: session.convenio?.id_convenio ? 'Convenio Empresa' : 'Pendiente',
      observaciones: `Reserva via Telegram ${today}.`,
    })
    .select()
    .single();
  if (orderError) throw orderError;

  const { error: detailError } = await adminClient.from('detalle_orden').insert({
    id_orden: order.id_orden,
    id_producto: product.id_producto,
    cantidad: Number(session.quantity || 1),
    precio_aplicado: Number(product.precio_unitario || 0),
    id_tipo_almuerzo: tipoAlm.id || null,
    opciones: {
      ...(session.opciones || {}),
      tipoAlmuerzo: tipoAlm.code || null,
      tipoOrigen: 'cliente_elige',
      menuDate: session.menuDate || session.date,
      canal: 'Telegram',
    },
  });
  if (detailError) {
    await adminClient.from('ordenes').delete().eq('id_orden', order.id_orden);
    throw detailError;
  }
  return order;
};

const optionFromCallback = (text, kind, options) => {
  const parts = String(text || '').split(':');
  const receivedKind = parts[0];
  const rawIndex = parts[1];
  if (receivedKind !== kind) return '';
  if (rawIndex === 'sin') {
    return `Sin ${labelForStep(kind)}`;
  }
  const index = Number(rawIndex);
  if (!Number.isInteger(index) || index < 0 || index >= options.length) return '';
  return options[index];
};

const orderSummary = (session) => {
  const opc = session.opciones || {};
  const entrada = opc.entrada || session.entrada;
  const sopa = opc.sopa || session.sopa;
  const segundo = opc.segundo || session.segundo;
  const bebida = opc.bebida || session.bebida;
  const postre = opc.postre || session.postre;
  const guarnicion = opc.guarnicion || session.guarnicion;
  const quantity = session.quantity;
  const tipoLabel = session.tipoAlmuerzo?.shortLabel;
  return (
    (tipoLabel ? `📌 <b>Tipo:</b> ${tipoLabel}\n` : '') +
    (quantity ? `🔢 <b>Cantidad:</b> ${Number(quantity)}\n` : '') +
    (entrada ? `🥗 <b>Entrada:</b> ${entrada}\n` : '') +
    (sopa ? `🍜 <b>Sopa:</b> ${sopa}\n` : '') +
    (segundo ? `🍽️ <b>Plato fuerte:</b> ${segundo}\n` : '') +
    (guarnicion ? `🧆 <b>Guarnición:</b> ${guarnicion}\n` : '') +
    (bebida ? `🥤 <b>Bebida:</b> ${bebida}\n` : '') +
    (postre ? `🍰 <b>Postre:</b> ${postre}\n` : '')
  );
};

const getNextStep = (tipo, currentStep) => {
  const flow = [];
  if (tipo?.requiresEntrada) flow.push('entrada');
  if (tipo?.requiresSopa) flow.push('sopa');
  if (tipo?.requiresSegundo) flow.push('segundo');
  if (tipo?.requiresBebida) flow.push('bebida');
  if (tipo?.requiresPostre) flow.push('postre');
  flow.push('confirmar');

  if (!currentStep) return flow[0];
  const idx = flow.indexOf(currentStep);
  if (idx === -1 || idx === flow.length - 1) return 'confirmar';
  return flow[idx + 1];
};

const getMenuOptionsForStep = (menu, step) => {
  if (!menu) return [];
  switch (step) {
  case 'entrada': return menu.entradas || [];
  case 'sopa': return menu.sopas || [];
  case 'segundo': return menu.segundos || [];
  case 'bebida': return menu.bebidas || [];
  case 'postre': return menu.postres || [];
  default: return [];
  }
};

const getPromptTextForStep = (tipo, step) => {
  const base = `🍱 <b>Tipo de Almuerzo:</b> ${tipo?.shortLabel || 'Almuerzo'}\n\n`;
  switch (step) {
  case 'entrada': return `${base}🥗 <b>Paso siguiente:</b> Elige tu entrada favorita:`;
  case 'sopa': return `${base}🍜 <b>Paso siguiente:</b> Selecciona la sopa de hoy:`;
  case 'segundo': return `${base}🍽️ <b>Paso siguiente:</b> Selecciona tu plato fuerte:`;
  case 'bebida': return `${base}🥤 <b>Paso siguiente:</b> Elige tu bebida:`;
  case 'postre': return `${base}🍰 <b>Paso siguiente:</b> Por último, elige tu postre:`;
  default: return 'Selecciona una de las opciones:';
  }
};

const promptForStep = async (chatId, session, step) => {
  if (step === 'confirmar') {
    const resumen = `📝 <b>Resumen de tu Selección:</b>\n\n${orderSummary(session)}\n❓ <b>¿Confirmas tu reserva para hoy?</b>`;
    await sendMessage(chatId, resumen, confirmacionKeyboard(session.sid), 'HTML');
    return;
  }
  const options = getMenuOptionsForStep(session.menu, step);
  if (!options.length) {
    const nextStep = getNextStep(session.tipoAlmuerzo, step);
    session.step = nextStep;
    await setState(stateKey(chatId), session);
    return promptForStep(chatId, session, nextStep);
  }
  const promptText = getPromptTextForStep(session.tipoAlmuerzo, step);
  await sendMessage(chatId, promptText, optionsKeyboard(step, options, session.sid), 'HTML');
};

const orderConfirmation = (session, order) => {
  if (order.modified) {
    return (
      '🔄 <b>¡Tu reserva ha sido modificada correctamente!</b>\n\n' +
      `📝 <b>Detalle del Pedido:</b>\n${orderSummary(session)}` +
      `🔢 <b>Número de Orden:</b> <code>${order.id_orden}</code>\n\n` +
      '¡Que disfrutes tu comida! 🍽️✨'
    );
  }
  if (order.duplicate) {
    return 'Tu almuerzo quedó reservado.';
  }
  return (
    '✅ <b>¡Tu reserva ha sido registrada con éxito!</b> 🎉\n\n' +
    `📝 <b>Detalle del Pedido:</b>\n${orderSummary(session)}` +
    `🔢 <b>Número de Orden:</b> <code>${order.id_orden}</code>\n\n` +
    '¡Que disfrutes tu comida! 🍽️✨'
  );
};

// Valida que el callback pertenece a la sesion actual (por sid embebido)
const extractSidFromCallback = (text) => {
  const parts = String(text || '').split(':');
  // confirmar:ok:SID => parts[2]
  // tipo:code:SID => parts[2]
  // segundo:0:SID => parts[2]
  return parts.length >= 3 ? parts[parts.length - 1] : null;
};

const sessionSidValid = (session, callbackSid) => {
  if (!callbackSid) return true; // callbacks legacy sin sid siempre son validos
  if (!session?.sid) return true; // sesion legacy sin sid es valida
  return session.sid === callbackSid;
};

const handleAcceptedSession = async (parsed, traceId) => {
  const { chatId, text, isCallback, messageId } = parsed;
  const trace = (patch) => updateOrderTrace(traceId, patch);
  let session = await getState(stateKey(chatId));

  if (!session) {
    await trace({
      interpreted_payload: { source: isCallback ? 'buttons' : 'text', step: 'missing_session' },
      outcome: 'failed',
      error_message: 'No existe una sesion de menu activa',
    });
    if (!isCallback) await deleteMessage(chatId, messageId);
    await sendMessage(chatId, 'No hay una seleccion activa. Usa /menu y luego los botones.');
    return;
  }

  if (session.date !== todayInTimezone()) {
    await deleteState(stateKey(chatId));
    await sendMessage(chatId, 'El menu activo ya vencio. Usa /menu para cargar el menu de hoy.');
    return;
  }

  if (!isCallback) {
    await deleteMessage(chatId, messageId);
    if (!session.invalidInputNoticeSent) {
      await setState(stateKey(chatId), { ...session, invalidInputNoticeSent: true });
      await sendMessage(chatId, 'Por seguridad, esta reserva solo acepta botones. Continua con la opcion visible.');
    }
    return;
  }

  await removeInlineKeyboard(chatId, messageId);

  // Verificar SID para callbacks con sid embebido (confirmar:ok:sid, tipo:*:sid, segundo:*:sid)
  const callbackSid = extractSidFromCallback(text);
  if (!sessionSidValid(session, callbackSid)) {
    await sendMessage(chatId, 'Este boton pertenece a un menu anterior y ya no es valido.');
    return;
  }

  // ---- Modificación interactiva (modstep:category:sid) ----
  if (String(text).startsWith('modstep:')) {
    const parts = String(text).split(':');
    const targetStep = parts[1];
    session.step = targetStep;
    session.modifying = true;
    await setState(stateKey(chatId), session);
    await promptForStep(chatId, session, targetStep);
    return;
  }

  // ---- Paso: eleccion de tipo de almuerzo ----
  if (session.step === 'tipo') {
    const parts = String(text).split(':');
    const kind = parts[0];
    const code = parts[1];
    if (kind !== 'tipo') {
      await sendMessage(chatId, 'Elige el tipo de almuerzo con los botones.', await tipoAlmuerzoKeyboard(session.sid, session.convenio?.tipos_almuerzo_permitidos));
      return;
    }
    const tipo = TIPOS_ALMUERZO.find((t) => t.code === code);
    if (!tipo) {
      await sendMessage(chatId, 'Tipo de almuerzo no reconocido. Usa los botones.', await tipoAlmuerzoKeyboard(session.sid, session.convenio?.tipos_almuerzo_permitidos));
      return;
    }
    
    const nextStep = getNextStep(tipo, null);
    session = { ...session, tipoAlmuerzo: tipo, step: nextStep };
    await setState(stateKey(chatId), session);
    await promptForStep(chatId, session, nextStep);
    return;
  }

  // ---- Paso: confirmacion (nuevo protocolo confirmar:ok:sid) ----
  if (session.step === 'confirmar') {
    const parts = String(text).split(':');
    const kind = parts[0];
    const action = parts[1];

    if (kind === 'confirmar' && action === 'edit') {
      await sendMessage(chatId, '¿Qué parte de tu almuerzo deseas modificar?', modificarPasosKeyboard(session, session.sid), 'HTML');
      return;
    }

    if (kind === 'confirmar' && action === 'back') {
      await promptForStep(chatId, session, 'confirmar');
      return;
    }

    if (kind !== 'confirmar' || action !== 'ok') {
      const resumen = `📝 <b>Resumen de tu Selección:</b>\n\n${orderSummary(session)}\n❓ <b>¿Confirmas tu reserva para hoy?</b>`;
      await sendMessage(chatId, resumen, confirmacionKeyboard(session.sid), 'HTML');
      return;
    }

    // Verificar duplicado ANTES de insertar
    const today = todayInTimezone();
    const existing = await findActiveTodayOrder(session.cliente.id_cliente);
    if (existing?.id_orden && session.mode !== 'modify') {
      // Hay una reserva activa — preparamos la sesion actual para reemplazarla
      session.mode = 'modify';
      session.orderId = existing.id_orden;
      await setState(stateKey(chatId), session);

      const detail = await getOrderDetail(existing.id_orden);
      const estadoNombre = await getEstadoName(existing.id_estado);
      existing._estadoNombre = estadoNombre;
      
      const msg = buildOrderSummaryMessage(existing, detail) + 
                  '\n\n⚠️ <b>Tienes una nueva selección pendiente.</b> ¿Qué deseas hacer?';
                  
      const replaceKeyboard = inlineKeyboard([
        [{ text: '🔄 Reemplazar con nueva selección', callback_data: `confirmar:ok:${session.sid}` }],
        [{ text: '❌ Mantener reserva anterior', callback_data: 'confirm:cancel' }]
      ]);

      await sendMessage(chatId, msg, replaceKeyboard, 'HTML');
      return;
    }

    let order;
    try {
      order = await insertOrder(session);
    } catch (error) {
      await sendMessage(chatId, 'No pude registrar la reserva. Tus selecciones siguen disponibles.', confirmacionKeyboard(session.sid), 'HTML');
      return;
    }

    await deleteState(stateKey(chatId));
    await sendMessage(chatId, orderConfirmation(session, order), null, 'HTML');
    return;
  }

  // ---- Pasos Dinamicos: entrada, sopa, segundo, bebida, postre ----
  const validSteps = ['entrada', 'sopa', 'segundo', 'bebida', 'postre'];
  if (validSteps.includes(session.step)) {
    const parts = String(text).split(':');
    const kind = parts[0];
    const options = getMenuOptionsForStep(session.menu, session.step);
    
    if (kind !== session.step) {
      await sendMessage(chatId, `Por favor, elige tu ${session.step} con los botones.`, optionsKeyboard(session.step, options, session.sid), 'HTML');
      return;
    }
    
    const chosen = optionFromCallback(text, session.step, options);
    if (!chosen) {
      await sendMessage(chatId, `Opcion invalida. Elige tu ${session.step} con los botones.`, optionsKeyboard(session.step, options, session.sid), 'HTML');
      return;
    }
    
    session.opciones = { ...(session.opciones || {}), [session.step]: chosen };
    
    if (session.modifying) {
      delete session.modifying;
      session.step = 'confirmar';
      await setState(stateKey(chatId), session);
      await promptForStep(chatId, session, 'confirmar');
      return;
    }
    
    const nextStep = getNextStep(session.tipoAlmuerzo, session.step);
    session.step = nextStep;
    await setState(stateKey(chatId), session);
    await promptForStep(chatId, session, nextStep);
    return;
  }

  await sendMessage(chatId, 'No hay una seleccion activa. Usa /menu y luego los botones.');
};

// ---- Handler de pedido: mostrar / cancelar / modificar reserva del dia ----

const handlePedidoCallback = async (parsed, subscription) => {
  const { chatId, text } = parsed;
  const parts = String(text).split(':');
  // pedido:can:orderId / pedido:can2:orderId / pedido:keep:orderId / pedido:mod:orderId
  if (parts[0] !== 'pedido') return false;

  const action = parts[1];
  const orderId = parts.slice(2).join(':');

  if (action === 'can') {
    // Pedir confirmacion antes de cancelar
    const { data: order } = await getAdminClient()
      .from('ordenes').select('id_orden,id_estado').eq('id_orden', orderId).maybeSingle();
    if (!order || order.id_estado !== 1) {
      await sendMessage(chatId, 'Esta reserva ya no esta en estado Reservado y no puede cancelarse.');
      return true;
    }
    await sendMessage(chatId, 'Confirma tu decision:\n\n\xbfDeseas cancelar tu reserva de hoy?', cancelConfirmKeyboard(orderId));
    return true;
  }

  if (action === 'can2') {
    // Confirmar cancelacion
    const { data: order } = await getAdminClient()
      .from('ordenes').select('id_orden,id_estado').eq('id_orden', orderId).maybeSingle();
    if (!order || order.id_estado !== 1) {
      await sendMessage(chatId, 'Esta reserva ya no esta en estado Reservado.');
      return true;
    }
    const estadoAnterior = order.id_estado;
    await getAdminClient()
      .from('ordenes')
      .update({ id_estado: 3 })
      .eq('id_orden', orderId);
    await getAdminClient()
      .from('orden_estado_auditoria')
      .insert([{ id_orden: orderId, estado_anterior: estadoAnterior, estado_nuevo: 3 }]);
    await sendMessage(chatId, 'Tu reserva fue cancelada. Puedes hacer una nueva reserva con /menu.');
    return true;
  }

  if (action === 'keep') {
    await sendMessage(chatId, 'Tu reserva se mantiene sin cambios.');
    return true;
  }

  if (action === 'mod') {
    // Verificar que la orden sigue en estado Reservado
    const { data: order } = await getAdminClient()
      .from('ordenes').select('id_orden,id_estado,id_cliente').eq('id_orden', orderId).maybeSingle();
    if (!order || order.id_estado !== 1) {
      await sendMessage(chatId, 'Esta reserva ya no esta en estado Reservado y no puede modificarse.');
      return true;
    }
    const client = await getClientById(subscription.id_cliente);
    if (!client) return true;

    // Cargar opciones existentes
    const detail = await getOrderDetail(orderId);
    if (!detail) {
      await sendMessage(chatId, 'No se encontraron los detalles de la reserva.');
      return true;
    }
    const opciones = detail.opciones || {};
    const tipoCode = opciones.tipoAlmuerzo;
    const tipoAlmuerzo = TIPOS_ALMUERZO.find((t) => t.code === tipoCode) || TIPOS_ALMUERZO.find((t) => t.id === detail.id_tipo_almuerzo) || null;

    const session = await startSessionForClient(chatId, client, { 
      mode: 'modify', 
      orderId,
      step: 'confirmar',
      opciones,
      tipoAlmuerzo
    });
    if (!session) {
      await sendMessage(chatId, 'No hay menu activo para modificar la reserva.');
      return true;
    }
    
    await sendMessage(chatId, `Vamos a modificar tu reserva <code>${orderId}</code>.\n¿Qué parte de tu almuerzo deseas modificar?`, modificarPasosKeyboard(session, session.sid), 'HTML');
    return true;
  }

  return false;
};

const promptMenu = async (chatId, client) => {
  const session = await startSessionForClient(chatId, client);
  if (!session) {
    await sendMessage(chatId, 'Aun no hay un menu activo. Recibiras el siguiente envio disponible.');
    return;
  }
  await sendMessage(chatId, menuCaption(session.date), await tipoAlmuerzoKeyboard(session.sid, session.convenio?.tipos_almuerzo_permitidos), 'HTML');
};

const tracePatch = (session, step, extra = {}) => ({
  id_cliente: session?.cliente?.id_cliente,
  interpreted_payload: {
    source: 'buttons',
    step,
    quantity: session?.quantity || null,
    sopa: session?.sopa || null,
    segundo: session?.segundo || null,
    guarnicion: session?.guarnicion || null,
    ...extra,
  },
});


const invitationFailureText = (reason) => {
  if (reason === 'claimed') return 'Este enlace ya fue abierto desde otro chat. Solicita una nueva invitacion al administrador.';
  if (reason === 'inactive_client') return 'El cliente de esta invitacion no esta activo.';
  return 'La invitacion no es valida, ya fue usada o expiro. Solicita una nueva al administrador.';
};

const acceptConsent = async (parsed, subscription, consentState) => {
  if (!consentState || consentState.status !== 'awaiting_decision') return;
  await removeInlineKeyboard(parsed.chatId, parsed.messageId);  const sent = await sendMessage(
    parsed.chatId,
    '📱 <b>¡Paso Final!</b>\n\nPara validar tu suscripcion, necesitamos verificar tu usuario.\n\nPor favor, utiliza el boton <b>"Compartir mi telefono"</b> que acaba de aparecer en la parte inferior de tu pantalla.\n\n<i>(Si no ves el boton en la parte inferior, busca en la barra inferior el icono de un cuadrado para compartir tu numero).</i>',
    contactKeyboard(),
    'HTML'
  );
  await setState(consentKey(parsed.chatId), {
    ...consentState,
    status: 'accepted_pending_phone',
    promptMessageIds: [],
  });
  await getAdminClient()
    .from('telegram_subscriptions')
    .update({
      telegram_user_id: parsed.telegramUserId || subscription.telegram_user_id,
      telegram_username: parsed.telegramUsername || subscription.telegram_username,
    })
    .eq('id', subscription.id);
};

const rejectConsent = async (parsed, subscription, consentState) => {
  if (!consentState?.idCliente || !subscription) return;
  await removeInlineKeyboard(parsed.chatId, parsed.messageId);
  await getAdminClient()
    .from('telegram_subscriptions')
    .update({
      consent_status: 'rejected',
      is_active: false,
      rejected_at: new Date().toISOString(),
      accepted_at: null,
      revoked_at: null,
      consent_notice_version: getConsentVersion(),
      consent_notice_text: privacyText(),
      consent_method: 'telegram_inline_button',
    })
    .eq('id', subscription.id);
  await recordConsentEvent({
    idCliente: consentState.idCliente,
    subscriptionId: subscription.id,
    invitationId: consentState.invitationId,
    eventType: 'rejected',
    method: 'telegram_inline_button',
    telegramUserId: parsed.telegramUserId,
    chatId: parsed.chatId,
  });
  await consumeInvitation(consentState.invitationId);
  await deleteChatStates(parsed.chatId);
  await cleanupConsentMessages(parsed.chatId, consentState);
  await sendMessage(
    parsed.chatId,
    '🚫 <b>Suscripcion Rechazada</b>\n\nRegistramos que no aceptas. Esta suscripcion queda bloqueada hasta que un administrador la reactive.',
    removeKeyboard(),
    'HTML'
  );
};

const validateAndSaveContact = async (parsed, subscription, consentState) => {
  if (!subscription || consentState?.status !== 'accepted_pending_phone') return false;
  await deleteMessage(parsed.chatId, parsed.messageId);
  if (!parsed.contactVerified) {
    await sendMessage(
      parsed.chatId, 
      '⚠️ Por favor, utiliza el boton <b>"Compartir mi telefono"</b> para validar tu suscripcion.\n\n<i>(Si no ves el boton en la parte inferior, busca en la barra inferior el icono de un cuadrado para compartir tu numero).</i>', 
      contactKeyboard(), 
      'HTML'
    );
    return true;
  }

  const client = await getClientById(consentState.idCliente);
  if (!client?.esta_activo) {
    await sendMessage(
      parsed.chatId, 
      '⚠️ <b>Cliente Inactivo</b>\n\nEl cliente invitado no esta activo. Contacta al administrador.', 
      removeKeyboard(),
      'HTML'
    );
    return true;
  }
  const contactPhone = normalizePhone(parsed.contactPhone);
  const clientPhone = normalizePhone(client.telefono);
  if (!contactPhone || !clientPhone || contactPhone !== clientPhone) {
    await sendMessage(
      parsed.chatId,
      '❌ <b>Telefono no coincide</b>\n\nEl telefono compartido no coincide con el cliente invitado. Pide al administrador que revise el registro.',
      contactKeyboard(),
      'HTML'
    );
    return true;
  }

  const phoneOwner = await getSubscriptionByPhone(contactPhone);
  // Solo es conflicto real si la suscripcion del telefono pertenece a otro cliente
  if (phoneOwner && phoneOwner.id !== subscription.id && phoneOwner.id_cliente && phoneOwner.id_cliente !== consentState.idCliente) {
    await sendMessage(
      parsed.chatId, 
      '⚠️ <b>Telefono en uso</b>\n\nEse telefono ya esta vinculado a otra suscripcion.', 
      removeKeyboard(),
      'HTML'
    );
    return true;
  }

  const acceptedAt = new Date().toISOString();
  const { data: accepted, error } = await getAdminClient()
    .from('telegram_subscriptions')
    .update({
      id_cliente: client.id_cliente,
      phone_normalized: contactPhone,
      chat_id: String(parsed.chatId),
      telegram_user_id: parsed.telegramUserId || null,
      telegram_username: parsed.telegramUsername || null,
      consent_status: 'accepted',
      is_active: true,
      consent_notice_version: getConsentVersion(),
      consent_notice_text: privacyText(),
      consent_method: 'telegram_contact_button',
      accepted_at: acceptedAt,
      rejected_at: null,
      revoked_at: null,
      linked_at: acceptedAt,
      deletion_requested_at: null,
    })
    .eq('id', subscription.id)
    .select()
    .single();
  if (error) throw error;

  try {
    await recordConsentEvent({
      idCliente: client.id_cliente,
      subscriptionId: accepted.id,
      invitationId: consentState.invitationId,
      eventType: 'accepted',
      method: 'telegram_contact_button',
      telegramUserId: parsed.telegramUserId,
      chatId: parsed.chatId,
      phone: contactPhone,
      evidence: { contact_owner_verified: true, client_phone_matched: true },
    });
  } catch (eventError) {
    await getAdminClient()
      .from('telegram_subscriptions')
      .update({ consent_status: 'pending', is_active: false, accepted_at: null })
      .eq('id', subscription.id);
    throw eventError;
  }

  await consumeInvitation(consentState.invitationId);
  await deleteChatStates(parsed.chatId);
  await cleanupConsentMessages(parsed.chatId, consentState);
  await sendMessage(
    parsed.chatId,
    `🎉 <b>¡Registro Exitoso!</b>\n\nHola <b>${client.nombre}</b>, tu Telegram quedo vinculado con tu registro de cliente.\n\nUsa /menu cuando quieras reservar.`,
    removeKeyboard(),
    'HTML'
  );
  return true;
};

const handlePrivacyCommand = async (command, parsed, subscription) => {
  if (command === '/privacidad') {
    const settings = getPrivacySettings();
    await sendMessage(
      parsed.chatId,
      `🛡️ <b>Centro de Privacidad</b>\n\n${privacyText()}\n\n<b>Comandos disponibles:</b>\n/misdatos - Ver mis datos\n/eliminarmisdatos - Borrar mis datos\n/revocar - Retirar consentimiento\n/ayuda - Ver mas opciones\n\n<a href="${settings.policyUrl}">Ver Politica Completa</a>`,
      null,
      'HTML'
    );
    return true;
  }

  if (command === '/ayuda') {
    await sendMessage(
      parsed.chatId,
      '🆘 <b>Ayuda y Comandos</b>\n\n🍲 <b>Reservas</b>\nUsa /menu para reservar mediante botones.\nConsulta tu reserva del dia con /pedido.\n\n🔒 <b>Privacidad</b>\n/privacidad - Centro de privacidad\n/misdatos - Ver que guardamos\n/eliminarmisdatos - Solicitar borrado\n/revocar - Bloquear acceso\n\n📞 <b>Contacto:</b> ' + getPrivacySettings().contact,
      null,
      'HTML'
    );
    return true;
  }

  if (command === '/misdatos') {
    if (!subscription) {
      await sendMessage(parsed.chatId, '⚠️ <b>Sin suscripcion</b>\n\nEste chat no tiene una suscripcion de Telegram vinculada.', null, 'HTML');
      return true;
    }
    await getAdminClient()
      .from('telegram_privacy_audits')
      .insert({ action: 'misdatos', outcome: 'informed', chat_id: String(parsed.chatId) });
    await sendMessage(
      parsed.chatId,
      '📁 <b>Tus Datos Personales</b>\n\nCategorias de datos que almacenamos:\n' +
      '• Identificador del chat de Telegram\n' +
      '• Numero de telefono (enmascarado)\n' +
      '• Nombre del cliente (segun tu registro)\n' +
      '• Selecciones de menu y reservas\n' +
      '• Historial de consentimiento\n\n' +
      `<b>Estado del consentimiento:</b> <code>${subscription.consent_status}</code>\n\n` +
      `Para acceder, rectificar o eliminar tus datos, contacta a: <b>${getPrivacySettings().contact}</b> o usa /eliminarmisdatos.`,
      null,
      'HTML'
    );
    return true;
  }

  if (command === '/revocar') {
    if (!subscription) {
      await sendMessage(parsed.chatId, '⚠️ <b>Sin suscripcion</b>\n\nNo existe una suscripcion vinculada para revocar.', null, 'HTML');
      return true;
    }
    if (['rejected', 'revoked'].includes(subscription.consent_status)) {
      await sendMessage(parsed.chatId, '🚫 <b>Ya estas revocado</b>\n\nTu suscripcion ya se encuentra bloqueada.', null, 'HTML');
      return true;
    }
    await sendMessage(
      parsed.chatId,
      '🛑 <b>Revocar Consentimiento</b>\n\n<b>Confirma tu decision:</b>\n\nRevocar el consentimiento bloqueara tu acceso al bot de Ecencia Andina. No recibiras menus hasta que un administrador reactive tu suscripcion.',
      revokeConfirmKeyboard(),
      'HTML'
    );
    return true;
  }

  if (parsed.text === 'revocar:cancel') {
    if (parsed.isCallback) await removeInlineKeyboard(parsed.chatId, parsed.messageId);
    await sendMessage(parsed.chatId, '✅ <b>Accion Cancelada</b>\n\nTu consentimiento se mantiene activo y seguiras disfrutando del servicio.', null, 'HTML');
    return true;
  }

  if (parsed.text === 'revocar:confirm') {
    if (parsed.isCallback) await removeInlineKeyboard(parsed.chatId, parsed.messageId);
    if (!subscription) {
      await sendMessage(parsed.chatId, '⚠️ <b>Sin suscripcion</b>\n\nNo existe una suscripcion vinculada para revocar.', null, 'HTML');
      return true;
    }
    await getAdminClient()
      .from('telegram_subscriptions')
      .update({
        consent_status: 'rejected',
        is_active: false,
        revoked_at: new Date().toISOString(),
      })
      .eq('id', subscription.id);
    await getAdminClient()
      .from('telegram_privacy_audits')
      .insert({ action: 'revocar', outcome: 'revoked', chat_id: String(parsed.chatId) });
    await deleteChatStates(parsed.chatId);
    await sendMessage(
      parsed.chatId,
      '🚫 <b>Consentimiento Revocado</b>\n\nTu acceso ha quedado bloqueado. Ya no recibiras el menu diario hasta que un administrador reactive tu suscripcion.',
      removeKeyboard(),
      'HTML'
    );
    return true;
  }

  if (command === '/eliminarmisdatos') {
    if (!subscription) {
      await sendMessage(parsed.chatId, '⚠️ <b>Sin datos</b>\n\nEste chat no tiene datos Telegram vinculados.', null, 'HTML');
      return true;
    }

    // Obtener los datos del cliente
    const client = await getClientById(subscription.id_cliente);

    // Verificar si ya existe una peticion pendiente o completada
    const { data: existingRequests } = await getAdminClient()
      .from('telegram_privacy_requests')
      .select('id, status')
      .eq('id_cliente', subscription.id_cliente)
      .in('status', ['pending', 'in_review', 'resolved']);

    if (existingRequests && existingRequests.length > 0) {
      if (existingRequests.some(r => ['pending', 'in_review'].includes(r.status))) {
        await sendMessage(
          parsed.chatId,
          '⏳ <b>Solicitud en curso</b>\n\nYa hemos recibido tu solicitud anteriormente. Actualmente se encuentra en proceso de gestion.',
          null,
          'HTML'
        );
        return true;
      }
      if (existingRequests.some(r => r.status === 'resolved') && subscription.consent_status !== 'accepted') {
        await sendMessage(
          parsed.chatId,
          '✅ <b>Solicitud Atendida</b>\n\nTu solicitud de eliminacion de datos ya fue procesada y finalizada exitosamente. Si tienes dudas, contacta al administrador.',
          null,
          'HTML'
        );
        return true;
      }
    }

    // Registrar auditoria
    await getAdminClient()
      .from('telegram_privacy_audits')
      .insert({ action: 'eliminarmisdatos', outcome: 'requested', chat_id: String(parsed.chatId) });

    // Insertar solicitud automatica en la tabla
    const { data: privacyRequest, error } = await getAdminClient()
      .from('telegram_privacy_requests')
      .insert({
        id_cliente: subscription.id_cliente,
        subscription_id: subscription.id,
        request_type: 'deletion',
        status: 'pending',
        source: 'telegram'
      })
      .select()
      .single();

    if (error && error.code !== '23505') {
      console.error('Error al insertar solicitud de privacidad:', error);
    }

    // Notificar al administrador por correo (asincrono para no bloquear)
    if (privacyRequest && client) {
      const { sendPrivacyRequestNotificationEmail } = require('../services/telegramInvitationEmail');
      sendPrivacyRequestNotificationEmail(client, privacyRequest).catch(err => console.error('Error notificacion:', err));
    }

    await sendMessage(
      parsed.chatId,
      '🗑️ <b>Solicitud Recibida</b>\n\nHemos recibido tu solicitud de eliminacion de datos personales.\n\nEl requerimiento ha sido registrado automaticamente y nuestro equipo de privacidad lo evaluara y procesara en el plazo establecido por la ley. En caso de requerir detalles adicionales, te contactaremos.',
      null,
      'HTML'
    );
    return true;
  }

  return false;
};

const handleStartInvitation = async (parsed, token) => {
  const invitation = await getInvitationByToken(token);
  const claimed = await claimInvitation(invitation, parsed);
  if (!claimed.valid) {
    await sendMessage(parsed.chatId, invitationFailureText(claimed.reason));
    return;
  }
  const relation = claimed.invitation.clientes;
  const client = Array.isArray(relation) ? relation[0] : relation;

  let subscription = await getSubscriptionByChat(parsed.chatId);
  if (!subscription) {
    const { data: inserted, error: insertError } = await getAdminClient()
      .from('telegram_subscriptions')
      .insert({
        id_cliente: client ? client.id_cliente : null,
        chat_id: String(parsed.chatId),
        consent_status: 'pending',
        is_active: false,
      })
      .select()
      .single();
    if (insertError) {
      throw insertError;
    }
    subscription = inserted;
  }

  if (!client?.id_cliente) {
    await sendMessage(parsed.chatId, invitationFailureText('invalid'));
    return;
  }

  await beginConsent({
    idCliente: client.id_cliente,
    chatId: parsed.chatId,
    telegramUserId: parsed.telegramUserId,
    telegramUsername: parsed.telegramUsername,
    invitationId: claimed.invitation.id,
    cleanupMessageIds: [],
  });
};

const requestPolicyReconsent = async (parsed, subscription) => {
  await recordConsentEvent({
    idCliente: subscription.id_cliente,
    subscriptionId: subscription.id,
    eventType: 'policy_reconsent_requested',
    method: 'telegram_command',
    telegramUserId: parsed.telegramUserId,
    chatId: parsed.chatId,
    phone: subscription.phone_normalized,
    evidence: {
      previous_version: subscription.consent_notice_version || null,
      required_version: getConsentVersion(),
    },
    includeNotice: false,
  });
  await beginConsent({
    idCliente: subscription.id_cliente,
    chatId: parsed.chatId,
    telegramUserId: parsed.telegramUserId,
    telegramUsername: parsed.telegramUsername,
  });
};

const handleTelegramUpdate = async (update) => {
  const parsed = readUpdate(update);
  if (!parsed.chatId) return;
  if (parsed.callbackId) await answerCallback(parsed.callbackId);

  const start = parseStartToken(parsed.text);
  if (start?.token) {
    await handleStartInvitation(parsed, start.token);
    return;
  }

  let subscription = await getSubscriptionByChat(parsed.chatId);
  const command = normalizeText(parsed.text).split(/\s+/)[0];
  if (await handlePrivacyCommand(command, parsed, subscription)) return;

  if (subscription?.consent_status === 'accepted' && !hasCurrentConsent(subscription)) {
    await requestPolicyReconsent(parsed, subscription);
    return;
  }

  if (start?.isStart) {
    if (hasCurrentConsent(subscription)) {
      await sendMessage(
        parsed.chatId, 
        '✅ <b>¡Ya estas suscrito!</b>\n\nRecibiras el menu cuando Ecencia Andina lo envie.\nUsa /menu para reservar o /ayuda para ver comandos.',
        null,
        'HTML'
      );
      return;
    }
    if (subscription?.consent_status === 'pending' && subscription.id_cliente) {
      await beginConsent({
        idCliente: subscription.id_cliente,
        chatId: parsed.chatId,
        telegramUserId: parsed.telegramUserId,
        telegramUsername: parsed.telegramUsername,
      });
      return;
    }
    if (['rejected', 'revoked'].includes(subscription?.consent_status)) {
      await sendMessage(
        parsed.chatId, 
        '🚫 <b>Suscripcion Bloqueada</b>\n\nActualmente no cuentas con una suscripcion. Por favor, acercate a Ecencia Andina para poderte ayudar.',
        null,
        'HTML'
      );
      return;
    }
    // Sin suscripcion previa: iniciar el flujo de consentimiento directamente
    await beginConsent({
      idCliente: subscription?.id_cliente || null,
      chatId: parsed.chatId,
      telegramUserId: parsed.telegramUserId,
      telegramUsername: parsed.telegramUsername,
    });
    return;
  }

  const consentState = await getState(consentKey(parsed.chatId));
  if (parsed.text === 'consent:accept') {
    await acceptConsent(parsed, subscription, consentState);
    return;
  }
  if (parsed.text === 'consent:reject') {
    await rejectConsent(parsed, subscription, consentState);
    return;
  }
  if (parsed.contactPhone) {
    await validateAndSaveContact(parsed, subscription, consentState);
    return;
  }

  if (['rejected', 'revoked'].includes(subscription?.consent_status)) {
    if (['/menu', '/pedido', '/cancelar'].includes(command)) {
      await sendMessage(
        parsed.chatId,
        '🚫 <b>Suscripcion Bloqueada</b>\n\nTu acceso ha sido revocado. Por favor, acercate a Ecencia Andina si deseas reactivar tu suscripcion.',
        null,
        'HTML'
      );
    }
    return;
  }
  if (subscription?.consent_status === 'pending') {
    if (consentState?.status === 'accepted_pending_phone') {
      // El usuario aun no ha compartido su telefono — re-solicitar el boton de contacto
      if (!parsed.isCallback) await deleteMessage(parsed.chatId, parsed.messageId);
      await sendMessage(
        parsed.chatId,
        '📲 <b>¡Casi listo!</b>\n\nAun necesitamos verificar tu usuario. Por favor, presiona el boton <b>"Compartir mi telefono"</b> que aparece en el teclado inferior.\n\n<i>(Si no ves el boton en la parte inferior, busca en la barra inferior el icono de un cuadrado para compartir tu numero).</i>',
        contactKeyboard(),
        'HTML'
      );
      return;
    }
    if (!parsed.isCallback) await deleteMessage(parsed.chatId, parsed.messageId);
    await sendMessage(parsed.chatId, 'Completa el consentimiento usando los botones visibles.');
    return;
  }

  if (command === '/cancelar' || parsed.text === 'confirm:cancel') {
    await deleteState(stateKey(parsed.chatId));
    if (parsed.isCallback && parsed.messageId) {
      await removeInlineKeyboard(parsed.chatId, parsed.messageId);
    }
    if (hasCurrentConsent(subscription)) {
      await sendMessage(parsed.chatId, 'La seleccion fue cancelada. Usa /menu para comenzar de nuevo.');
    }
    return;
  }

  if (command === '/pedido') {
    if (!hasCurrentConsent(subscription)) return;
    const today = todayInTimezone();
    const todayOrder = await findActiveTodayOrder(subscription.id_cliente);
    if (!todayOrder) {
      await sendMessage(parsed.chatId, 'No tienes una reserva registrada hoy. Usa /menu para reservar.');
      return;
    }
    const detail = await getOrderDetail(todayOrder.id_orden);
    await sendMessage(parsed.chatId, buildPedidoMessage(todayOrder, detail), pedidoKeyboard(todayOrder.id_orden));
    return;
  }

  if (command === '/menu') {
    if (!hasCurrentConsent(subscription)) return;
    if (!isBusinessDay()) {
      await sendMessage(parsed.chatId, 'El servicio de reservas esta disponible de lunes a viernes. Vuelve el proximo dia habil.');
      return;
    }
    const client = await getClientById(subscription.id_cliente);
    if (!client?.esta_activo) {
      await sendMessage(parsed.chatId, 'El cliente vinculado no esta activo. Contacta al administrador.');
      return;
    }
    // Si ya tiene reserva activa hoy, mostrarla en lugar de iniciar nueva
    const todayOrder = await findActiveTodayOrder(subscription.id_cliente);
    if (todayOrder && todayOrder.id_estado === 1) {
      await deleteState(stateKey(parsed.chatId));
      const detail = await getOrderDetail(todayOrder.id_orden);
      const estadoNombre = await getEstadoName(todayOrder.id_estado);
      todayOrder._estadoNombre = estadoNombre;
      await sendMessage(parsed.chatId, buildOrderSummaryMessage(todayOrder, detail), pedidoKeyboard(todayOrder.id_orden));
      return;
    }
    await promptMenu(parsed.chatId, client);
    return;
  }

  if (!hasCurrentConsent(subscription)) return;

  // Callbacks de gestion de pedido (pedido:can, pedido:mod, etc.)
  if (parsed.isCallback && String(parsed.text).startsWith('pedido:')) {
    await handlePedidoCallback(parsed, subscription);
    return;
  }

  const traceId = await createOrderTrace(parsed, {
    clientId: subscription.id_cliente,
    subscriptionId: subscription.id,
  });
  try {
    await handleAcceptedSession(parsed, traceId);
  } catch (error) {
    await updateOrderTrace(traceId, {
      id_cliente: subscription.id_cliente,
      subscription_id: subscription.id,
      interpreted_payload: {
        source: parsed.isCallback ? 'buttons' : 'text',
        step: 'processing_error',
      },
      outcome: 'failed',
      error_message: error.message || 'Error inesperado al procesar el pedido',
    });
    throw error;
  }
};

router.get('/privacy', (req, res) => {
  try {
    const settings = getPrivacySettings();
    res.json({
      title: 'Privacidad y Telegram',
      version: settings.version,
      contact: settings.contact,
      policy_url: settings.policyUrl,
      notice: privacyText(),
      commands: ['/privacidad', '/misdatos', '/eliminarmisdatos', '/revocar', '/ayuda'],
    });
  } catch {
    res.status(500).json({ error: 'La informacion de privacidad no esta configurada.' });
  }
});

router.post('/webhook', async (req, res) => {
  try {
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET || '';
    const receivedSecret = req.get('x-telegram-bot-api-secret-token') || '';
    if (expectedSecret && receivedSecret !== expectedSecret) {
      return res.status(401).json({ error: 'Telegram webhook no autorizado.' });
    }
    if (!expectedSecret && process.env.NODE_ENV === 'production') {
      return res.status(500).json({ error: 'Falta TELEGRAM_WEBHOOK_SECRET en produccion.' });
    }

    await handleTelegramUpdate(req.body || {});
    res.sendStatus(204);
  } catch (error) {
    console.error('Error procesando webhook Telegram:', error);
    console.error('Payload causante:', JSON.stringify(req.body));
    res.status(500).json({ ok: false });
  }
});

// ---- Lógica de Broadcast para n8n ----

const phoneCandidates = (value) => {
  const normalized = normalizePhone(value);
  const out = new Set([normalized]);
  if (normalized.startsWith('593')) out.add('0' + normalized.slice(3));
  return [...out].filter(Boolean);
};

const getActiveClients = async () => {
  const { data, error } = await getAdminClient()
    .from('clientes')
    .select('id_cliente,cedula,nombre,apellido,telefono,esta_activo,clientes_convenios(id_convenio,convenios(id_convenio,nombre_empresa,esta_activo,fecha_caducidad,tipos_almuerzo_permitidos))')
    .eq('esta_activo', true);
  if (error) throw error;
  return data || [];
};

const getAcceptedSubscriptions = async () => {
  const { data, error } = await getAdminClient()
    .from('telegram_subscriptions')
    .select('id,id_cliente,phone_normalized,chat_id,consent_status,is_active,consent_notice_version')
    .eq('consent_status', 'accepted')
    .eq('is_active', true)
    .eq('consent_notice_version', getConsentVersion())
    .not('chat_id', 'is', null);
  if (error) throw error;
  return data || [];
};

router.post('/broadcast-sessions', async (req, res) => {
  try {
    const expectedSecret = process.env.N8N_MENU_WEBHOOK_SECRET || '';
    const receivedSecret = req.headers['x-eciencia-webhook-secret'] || req.headers['X-Eciencia-Webhook-Secret'];
    if (expectedSecret && receivedSecret !== expectedSecret) {
      return res.status(401).json({ error: 'Webhook no autorizado.' });
    }

    const payload = req.body || {};
    const today = todayInTimezone();
    
    const activeMenuState = await getActiveMenu();
    let menu = payload.menu || activeMenuState?.menu;
    
    if (!menu) {
      return res.status(400).json({ error: 'No se encontro el menu activo.' });
    }
    
    const photoUrl = payload.image || payload.photoUrl || activeMenuState?.photoUrl || process.env.N8N_ECIENCIA_MENU_IMAGE_URL || 'https://lkffhdcavohaxdihvwlb.supabase.co/storage/v1/object/public/eciencia-menu-assets/telegram/eciencia-menu-demo.png';
    const targetClientIds = new Set(Array.isArray(payload.clientIds) ? payload.clientIds.map(String).filter(Boolean) : []);
    
    const product = await getProduct();
    const estadoReservadoId = await getLookupId('estados_orden', 'id_estado', 'nombre_estado', ESTADO_RESERVADO_NOMBRE);
    const origenTelegramId = await getLookupId('origenes_pedido', 'id_origen', 'nombre_origen', ORIGEN_NOMBRE);
    
    const clients = await getActiveClients();
    const subscriptions = await getAcceptedSubscriptions();
    
    const subscriptionByClient = new Map();
    const subscriptionByPhone = new Map();
    for (const sub of subscriptions) {
      if (sub.id_cliente) subscriptionByClient.set(sub.id_cliente, sub);
      if (sub.phone_normalized) subscriptionByPhone.set(sub.phone_normalized, sub);
    }
    
    const newState = { date: today, menu, photoUrl, source: payload.source || 'backend' };
    await setState('latest-menu:' + today, newState);
    await setState('latest-menu:active', newState);
    
    const output = [];
    
    for (const client of clients) {
      if (targetClientIds.size && !targetClientIds.has(String(client.id_cliente))) continue;
    
      const subscription = subscriptionByClient.get(client.id_cliente) || 
        phoneCandidates(client.telefono).map(p => subscriptionByPhone.get(p)).find(Boolean);
    
      if (!subscription || !subscription.chat_id) continue;
    
      const chatId = String(subscription.chat_id);
      const convenio = activeConvenio(client, today);
      const sid = String(Date.now()) + Math.floor(Math.random() * 1000);
      
      const session = {
        sid,
        step: 'tipo',
        date: today,
        menuDate: newState.date || today,
        menu,
        quantity: null,
        cliente: {
          id_cliente: client.id_cliente,
          nombre: client.nombre,
          apellido: client.apellido,
        },
        convenio,
        product,
        estadoReservadoId,
        origenTelegramId,
        createdAt: new Date().toISOString(),
      };
      
      await setState(stateKey(chatId), session);
      
      output.push({
        chatId,
        subscriptionId: subscription.id,
        photoUrl,
        caption: menuCaption(today),
        inlineKeyboard: tipoAlmuerzoKeyboard(sid, convenio.tipos_almuerzo_permitidos).inline_keyboard,
      });
    }
    
    return res.json(output);
  } catch (error) {
    console.error('Error en /broadcast-sessions:', error);
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
module.exports.handleTelegramUpdate = handleTelegramUpdate;

// ---- Utilidades de parsing de texto libre ----

const QUANTITY_KEYWORDS = /\b(cantidad|almuerzos?|pedidos?|porciones?)\b/i;
const MAX_QUANTITY = 20;

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
      const value = parseInt(m[1], 10);
      return { provided: true, valid: value >= 1 && value <= MAX_QUANTITY, value };
    }
  }
  return { provided: false, valid: true, value: current };
};

const parseTextOrder = (text, session) => {
  const str = String(text || '');
  const norm = (v) => normalizeText(String(v || ''));
  const result = { session: { ...session }, invalid: [], missing: [], valid: false };

  const findOption = (kind, options, label) => {
    // Intento por numero: "sopa: 1" o "sopa: 2"
    const numRe = new RegExp(`${kind}[:\\s]+([+-]?\\d+)`, 'i');
    const numMatch = str.match(numRe);
    if (numMatch) {
      const idx = parseInt(numMatch[1], 10) - 1;
      if (idx >= 0 && idx < options.length) {
        return options[idx];
      }
      result.invalid.push(kind);
      return null;
    }
    // Intento por nombre
    for (const option of options) {
      if (str.includes(norm(option))) return option;
    }
    return undefined; // no encontrado pero no invalido
  };

  const tipoCode = session.tipoAlmuerzo?.code || 'almuerzo_dia';
  const needsSopa = !['almuerzo_dia_simple'].includes(tipoCode);

  if (needsSopa && session.menu.sopas?.length) {
    const sopa = findOption('sopa', session.menu.sopas.map(norm), 'sopa');
    if (sopa !== undefined && sopa !== null) result.session.sopa = session.menu.sopas[session.menu.sopas.map(norm).indexOf(sopa)] || sopa;
    else if (sopa === null) { /* invalido, ya anotado */ }
  }

  if (session.menu.segundos?.length) {
    const idx_norm = session.menu.segundos.map(norm);
    const seg = findOption('segundo', idx_norm, 'plato fuerte');
    if (seg !== undefined && seg !== null) {
      const real_idx = idx_norm.indexOf(seg);
      result.session.segundo = real_idx >= 0 ? session.menu.segundos[real_idx] : seg;
    }
  }

  // Verifica si hay alguna selección reconocible
  const hasSopa = result.session.sopa || !needsSopa;
  const hasSegundo = result.session.segundo;

  if (!hasSopa && !hasSegundo && result.invalid.length === 0) {
    // Intento de buscar por nombre directo en el texto
    let found = false;
    for (const s of (session.menu.sopas || [])) {
      if (norm(str).includes(norm(s))) { result.session.sopa = s; found = true; break; }
    }
    for (const s of (session.menu.segundos || [])) {
      if (norm(str).includes(norm(s))) { result.session.segundo = s; found = true; break; }
    }
    if (!found) {
      result.invalid.push('formato');
      return result;
    }
  }

  // Detectar cantidad
  const qty = quantityFromText(str, session.quantity || 1);
  if (qty.provided) {
    if (qty.valid) result.session.quantity = qty.value;
    else result.invalid.push('cantidad');
  }

  // Calcular lo que falta
  if (needsSopa && !result.session.sopa && !result.invalid.includes('sopa')) result.missing.push('sopa');
  if (!result.session.segundo && !result.invalid.includes('segundo')) result.missing.push('plato fuerte');

  result.valid = result.invalid.length === 0 && result.missing.length === 0;
  return result;
};

// Obtenemos los tipos de almuerzo de DB dinámicamente y los exportamos como un getter async
const getTiposAlmuerzoFromDB = async () => {
  const { data } = await getAdminClient().from('tipos_almuerzo').select('*');
  return data || [];
};

const getTelegramLunchTypeById = async (id) => {
  const tipos = await getTiposAlmuerzoFromDB();
  return tipos.find(t => t.id === id);
};

// Definicion de componentes por tipo de almuerzo
const LUNCH_COMPONENTS = {
  ejecutivo_completo: ['entrada', 'sopa', 'plato fuerte', 'postre', 'bebida'],
  almuerzo_dia: ['sopa', 'plato fuerte', 'bebida'],
  almuerzo_dia_simple: ['plato fuerte', 'bebida'],
};

const buildComponentPlan = ({ tipoAlmuerzo, menu }) => {
  const code = tipoAlmuerzo?.code || 'almuerzo_dia';
  const components = LUNCH_COMPONENTS[code] || ['sopa', 'plato fuerte'];
  const menuMap = {
    entrada: menu.entradas || [],
    sopa: menu.sopas || [],
    'plato fuerte': menu.segundos || [],
    postre: menu.postres || [],
    bebida: menu.bebidas || [],
  };

  const opciones = {};
  const pendingSteps = [];

  for (const comp of components) {
    const options = menuMap[comp] || [];
    if (options.length === 0) continue; // omitir componentes vacios
    if (options.length === 1) {
      opciones[comp === 'plato fuerte' ? 'segundo' : comp] = options[0];
    } else {
      pendingSteps.push(comp);
    }
  }

  return { opciones, pendingSteps };
};

module.exports._private = {
  activeConvenio,
  beginConsent,
  buildComponentPlan,
  handleAcceptedSession,
  invitationFailureText,
  orderConfirmation,
  parseStartToken,
  parseTextOrder,
  quantityFromText,
  readUpdate,
  getTelegramLunchTypeById,
};
