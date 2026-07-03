const crypto = require('node:crypto');
const express = require('express');
const { getAdminClient } = require('../config/supabase');
const { normalizePhone } = require('../validation/eciencia');
const { createOrderTrace, updateOrderTrace } = require('../services/telegramOrderTrace');
const { answerTelegramCallback, sendTelegramMessage } = require('../services/telegramBot');
const { ORDER_STATE } = require('../services/orderNotifications');
const {
  ACTIVE_LUNCH_TYPE_CODES,
  DEFAULT_LUNCH_TYPE_ID,
  LUNCH_PACKAGE_DETAILS,
  LUNCH_TYPE_CODES,
  getLunchPackage,
  getLunchTypeCode,
  lunchTypeIncludedComponents,
  lunchTypeIncludesSoup,
} = require('../services/lunchTypes');

const router = express.Router();

const CONSENT_NOTICE_VERSION = 'EC-LOPDP-2026-06';
const TIMEZONE = process.env.N8N_ECIENCIA_TIMEZONE || 'America/Bogota';
const ORIGEN_NOMBRE = process.env.N8N_ECIENCIA_ORIGEN_NOMBRE || 'Telegram';
const ESTADO_RESERVADO_NOMBRE = process.env.N8N_ECIENCIA_ESTADO_RESERVADO_NOMBRE || 'Reservado';
const INVITATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{12,80}$/;

const TELEGRAM_LUNCH_TYPES = ACTIVE_LUNCH_TYPE_CODES.map((code) => ({
  id: LUNCH_PACKAGE_DETAILS[code].id,
  code,
  label: `${LUNCH_PACKAGE_DETAILS[code].label} $${LUNCH_PACKAGE_DETAILS[code].price.toFixed(2)}`,
  shortLabel: LUNCH_PACKAGE_DETAILS[code].label,
  price: LUNCH_PACKAGE_DETAILS[code].price,
}));
const TELEGRAM_LUNCH_TYPE_BY_CODE = Object.fromEntries(TELEGRAM_LUNCH_TYPES.map((type) => [type.code, type]));
const TELEGRAM_LUNCH_TYPE_BY_ID = Object.fromEntries(TELEGRAM_LUNCH_TYPES.map((type) => [type.id, type]));

const ESTADO_ORDEN_LABELS = {
  [ORDER_STATE.RESERVED]: 'Reservado',
  [ORDER_STATE.CONSUMED]: 'Consumido',
  [ORDER_STATE.CANCELLED]: 'Cancelado',
};

const PRIVACY_CONTACT = process.env.TELEGRAM_PRIVACY_CONTACT || 'el administrador de Ecencia Andina';

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

const dayOfWeekInTimezone = (date) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    weekday: 'short',
  }).format(new Date(`${date}T12:00:00.000Z`));

// ECIENCIA_BUSINESS_DAYS_ONLY=false permite reservar en fin de semana (pruebas).
const businessDaysOnly = () => String(process.env.ECIENCIA_BUSINESS_DAYS_ONLY ?? 'true').toLowerCase() !== 'false';

const isBusinessDay = (date) => !businessDaysOnly() || !['Sat', 'Sun'].includes(dayOfWeekInTimezone(date));

const notAvailableTodayText = () =>
  'La Experiencia del Dia esta disponible de lunes a viernes. Hoy no se registran reservas por Telegram.';

const tomorrowFromDate = (date) => {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
};

const privacyText = () =>
  'Aviso de privacidad y consentimiento - Ecencia Andina\n\n' +
  'Usaremos tu numero de telefono, identificador de Telegram, nombre de cliente y preferencias de menu para vincularte con tu registro, enviarte el menu del dia y registrar reservas solicitadas por este bot.\n\n' +
  'Base legal: tu consentimiento libre, especifico, informado e inequivoco conforme a la Ley Organica de Proteccion de Datos Personales de Ecuador.\n\n' +
  'Derechos: puedes solicitar acceso, rectificacion, actualizacion, eliminacion, oposicion, limitacion o revocar este consentimiento contactando al administrador de Ecencia Andina.\n\n' +
  'Si aceptas, te pediremos compartir tu telefono de Telegram para validar tu registro. Si no aceptas, no registraremos tu telefono ni te enviaremos menus por Telegram.';

const inlineKeyboard = (buttons) => ({
  inline_keyboard: buttons.map((button) => [{ text: button.text, callback_data: button.callbackData }]),
});

// Sufijo de sesion (sid) en el callback: permite rechazar botones de menus
// anteriores sin borrar la sesion vigente. Sesiones legadas no tienen sid.
const withSid = (base, sid) => (sid ? `${base}:${sid}` : base);

const newSessionId = () => crypto.randomBytes(4).toString('hex');

const callbackSid = (text) => {
  const parts = String(text || '').split(':');
  return parts.length >= 3 ? parts[parts.length - 1] : '';
};

const callbackMatchesSession = (text, session) => !session?.sid || callbackSid(text) === session.sid;

const optionsKeyboard = (kind, options, sid) =>
  inlineKeyboard(options.map((option, index) => ({ text: option, callbackData: withSid(`${kind}:${index}`, sid) })));

const lunchTypeKeyboard = (sid) =>
  inlineKeyboard(TELEGRAM_LUNCH_TYPES.map((type) => ({ text: type.label, callbackData: withSid(`tipo:${type.code}`, sid) })));

const consentKeyboard = () =>
  inlineKeyboard([
    { text: 'Acepto', callbackData: 'consent:accept' },
    { text: 'No acepto', callbackData: 'consent:reject' },
  ]);

const contactKeyboard = () => ({
  keyboard: [[{ text: 'Compartir telefono', request_contact: true }]],
  resize_keyboard: true,
  one_time_keyboard: true,
});

const typedPhonePendingText = () =>
  'Aun no pude validar tu registro. Por seguridad debes tocar el boton "Compartir telefono" de Telegram; no basta con escribir el numero.\n\n' +
  'Presiona "Compartir telefono" para completar el registro.';

const registrationCompleteText = (client) => {
  const firstName = String(client?.nombre || '').trim();
  const greeting = firstName ? `Listo ${firstName}` : 'Listo';
  return `${greeting}, tu Telegram quedo vinculado con tu registro de cliente.`;
};

const menuCaption = (today) =>
  'Ecencia Andina - Menu del dia ' +
  today +
  '\n\nToca primero el paquete de almuerzo. Luego elegiras sopa solo cuando aplique y plato fuerte.' +
  '\n\nEntrada, postre y bebida se muestran como incluidos segun el paquete; usa los botones para reservar.' +
  '\nUsa /cancelar para reiniciar.';

const answerCallback = async (callbackId) => {
  if (!callbackId) return;
  try {
    await answerTelegramCallback(callbackId);
  } catch (error) {
    const safeMessage = String(error?.message || '').replace(/[\r\n\t]+/g, ' ');
    console.warn('No se pudo responder callback Telegram:', safeMessage);
  }
};

const sendMessage = (chatId, text, replyMarkup = undefined) =>
  sendTelegramMessage(chatId, text, replyMarkup);

const readUpdate = (update) => {
  if (update.callback_query) {
    return {
      updateId: Number(update.update_id || 0) || null,
      messageId: Number(update.callback_query.message?.message_id || 0) || null,
      chatId: String(update.callback_query.message?.chat?.id || update.callback_query.from?.id || ''),
      text: String(update.callback_query.data || ''),
      callbackId: String(update.callback_query.id || ''),
      isCallback: true,
      contactPhone: '',
      contactVerified: false,
    };
  }

  const message = update.message || update.edited_message || {};
  const contact = message.contact || null;
  const chatId = String(message.chat?.id || message.from?.id || '');
  const fromId = String(message.from?.id || '');
  const contactUserId = contact?.user_id ? String(contact.user_id) : '';

  return {
    updateId: Number(update.update_id || 0) || null,
    messageId: Number(message.message_id || 0) || null,
    chatId,
    text: String(message.text || ''),
    callbackId: '',
    isCallback: false,
    contactPhone: contact?.phone_number || '',
    contactVerified: Boolean(contact?.phone_number) && (!contactUserId || contactUserId === fromId || contactUserId === chatId),
  };
};

const stateKey = (chatId) => `session:${chatId}`;
const consentKey = (chatId) => `consent:${chatId}`;

const startPayloadFromText = (text) => {
  const trimmed = String(text || '').trim();
  const lower = trimmed.toLowerCase();
  if (lower !== '/start' && !lower.startsWith('/start ')) return '';

  const token = trimmed.slice('/start'.length).trim();
  return INVITATION_TOKEN_PATTERN.test(token) ? token : '';
};

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
    .upsert({ key, value: { ...value, updatedAt: new Date().toISOString() } }, { onConflict: 'key' });
  if (error) throw error;
};

const deleteState = async (key) => {
  const { error } = await getAdminClient().from('telegram_bot_state').delete().eq('key', key);
  if (error) throw error;
};

const getInvitationByToken = async (token) => {
  if (!token) return null;
  const { data, error } = await getAdminClient()
    .from('telegram_convenio_invitaciones')
    .select('id,token,id_cliente,status')
    .eq('token', token)
    .maybeSingle();
  if (error) throw error;
  return data || null;
};

const updateInvitationByToken = async (token, patch) => {
  if (!token) return;
  const { error } = await getAdminClient()
    .from('telegram_convenio_invitaciones')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('token', token);
  if (error) throw error;
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

const getSubscriptionByPhone = async (phone) => {
  const { data, error } = await getAdminClient()
    .from('telegram_subscriptions')
    .select('*')
    .eq('phone_normalized', normalizePhone(phone))
    .maybeSingle();
  if (error) throw error;
  return data || null;
};

const upsertSubscriptionByChat = async (chatId, values) => {
  const existing = await getSubscriptionByChat(chatId);
  const payload = {
    chat_id: String(chatId),
    ...values,
  };

  if (existing?.id) {
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

const deleteSubscriptionById = async (id) => {
  const { error } = await getAdminClient().from('telegram_subscriptions').delete().eq('id', id);
  if (error) throw error;
};

const phoneCandidates = (phone) => {
  const normalized = normalizePhone(phone);
  const out = new Set([normalized]);
  if (normalized.startsWith('593')) out.add(`0${normalized.slice(3)}`);
  return [...out].filter(Boolean);
};

const looksLikePhoneText = (text) => {
  const trimmed = String(text || '').trim();
  if (!/^\+?[\d\s().-]{8,24}$/.test(trimmed)) return false;
  const normalized = normalizePhone(trimmed);
  return Boolean(normalized && /^\d{8,15}$/.test(normalized));
};

const getClients = async () => {
  const { data, error } = await getAdminClient()
    .from('clientes')
    .select(
      'id_cliente,cedula,nombre,apellido,telefono,esta_activo,clientes_convenios(id_convenio,convenios(id_convenio,nombre_empresa,esta_activo,fecha_caducidad,id_tipo_almuerzo))',
    )
    .eq('esta_activo', true);
  if (error) throw error;
  return data || [];
};

const findClientByPhone = async (phone) => {
  const candidates = phoneCandidates(phone);
  const clients = await getClients();
  return clients.find((client) => phoneCandidates(client.telefono).some((candidate) => candidates.includes(candidate))) || null;
};

const getClientById = async (id) => {
  const { data, error } = await getAdminClient()
    .from('clientes')
    .select(
      'id_cliente,cedula,nombre,apellido,telefono,esta_activo,clientes_convenios(id_convenio,convenios(id_convenio,nombre_empresa,esta_activo,fecha_caducidad,id_tipo_almuerzo))',
    )
    .eq('id_cliente', id)
    .eq('esta_activo', true)
    .maybeSingle();
  if (error) throw error;
  return data || null;
};

const findClientForSubscription = async (subscription) => {
  if (!subscription) return null;
  if (subscription.id_cliente) {
    const client = await getClientById(subscription.id_cliente);
    if (client) return client;
  }
  if (subscription.phone_normalized) return findClientByPhone(subscription.phone_normalized);
  return null;
};

const saveAcceptedSubscription = async (chatId, client, phone, contactVerified, options = {}) => {
  const phoneNormalized = normalizePhone(phone);
  const [byChat, byPhone] = await Promise.all([getSubscriptionByChat(chatId), getSubscriptionByPhone(phoneNormalized)]);

  if (!options.allowRejected && (byChat?.consent_status === 'rejected' || byPhone?.consent_status === 'rejected')) {
    return { blocked: true, reason: 'rejected' };
  }
  if (byPhone?.chat_id && String(byPhone.chat_id) !== String(chatId) && !contactVerified) {
    return { blocked: true, reason: 'chat_taken' };
  }

  if (byPhone && byChat && byPhone.id !== byChat.id) {
    await deleteSubscriptionById(byChat.id);
  }

  const payload = {
    id_cliente: client.id_cliente,
    phone_normalized: phoneNormalized,
    chat_id: String(chatId),
    consent_status: 'accepted',
    is_active: true,
    consent_notice_version: CONSENT_NOTICE_VERSION,
    consent_notice_text: privacyText(),
    accepted_at: new Date().toISOString(),
    rejected_at: null,
    linked_at: new Date().toISOString(),
  };

  const targetId = byPhone?.id || byChat?.id;
  if (targetId) {
    const { data, error } = await getAdminClient()
      .from('telegram_subscriptions')
      .update(payload)
      .eq('id', targetId)
      .select()
      .single();
    if (error) throw error;
    return { subscription: data };
  }

  const { data, error } = await getAdminClient().from('telegram_subscriptions').insert(payload).select().single();
  if (error) throw error;
  return { subscription: data };
};

const activeConvenio = (client, today) => {
  for (const link of client.clientes_convenios || []) {
    const convenio = Array.isArray(link.convenios) ? link.convenios[0] : link.convenios;
    if (convenio?.esta_activo !== false && (!convenio?.fecha_caducidad || convenio.fecha_caducidad >= today)) {
      return {
        id_convenio: convenio.id_convenio || link.id_convenio,
        nombre_empresa: convenio.nombre_empresa || 'Convenio',
        id_tipo_almuerzo: Number(convenio.id_tipo_almuerzo) || DEFAULT_LUNCH_TYPE_ID,
      };
    }
  }
  return { id_convenio: null, nombre_empresa: 'Cliente directo', id_tipo_almuerzo: null };
};

const getLookupId = async (table, idField, nameField, value) => {
  const { data, error } = await getAdminClient().from(table).select(`${idField},${nameField}`).ilike(nameField, value).limit(1);
  if (error) throw error;
  if (data?.[0]?.[idField]) return data[0][idField];
  throw new Error(`No encontre ${value} en ${table}.`);
};

const getProductForLunchType = async (selectedType) => {
  const { data, error } = await getAdminClient()
    .from('productos')
    .select('id_producto,nombre_producto,precio_unitario,esta_activo,id_tipo_almuerzo_default')
    .eq('esta_activo', true)
    .order('id_producto', { ascending: true });
  if (error) throw error;

  const packageDetail = getLunchPackage(selectedType?.code);
  const active = data || [];
  const product = active.find((row) => Number(row.id_tipo_almuerzo_default) === Number(selectedType?.id))
    || active.find((row) => packageDetail && normalizeText(row.nombre_producto) === normalizeText(packageDetail.productName))
    || active.find((row) => Number(row.id_tipo_almuerzo_default) === DEFAULT_LUNCH_TYPE_ID);

  if (!product) throw new Error('No hay producto activo para registrar la reserva.');
  return product;
};

const getActiveMenu = async () => {
  const state = await getState('latest-menu:active');
  if (!state?.menu?.segundos?.length) return null;
  return state;
};

// Fija el paquete elegido/contratado y resuelve el plan de componentes.
const applyLunchTypeToSession = (session, type) => {
  session.tipoAlmuerzo = type;
  const plan = buildComponentPlan(session);
  session.opciones = { ...session.opciones, ...plan.opciones };
  session.pendingSteps = plan.pendingSteps;
  session.step = plan.pendingSteps.length ? 'component' : 'confirmar';
  return session;
};

const startSessionForClient = async (chatId, client, options = {}) => {
  const activeMenu = await getActiveMenu();
  if (!activeMenu) return null;

  const today = todayInTimezone();
  const convenio = activeConvenio(client, today);
  // Convenio: la empresa contrata el tipo -> se fija y no se pregunta.
  // Cliente frecuente (sin convenio): elige el tipo (paso 'tipo').
  const contractedType = convenio.id_convenio
    ? (TELEGRAM_LUNCH_TYPE_BY_ID[Number(convenio.id_tipo_almuerzo)]
        || TELEGRAM_LUNCH_TYPE_BY_CODE[LUNCH_TYPE_CODES.almuerzoDia])
    : null;
  const session = {
    sid: newSessionId(),
    mode: options.mode === 'modify' ? 'modify' : 'new',
    orderId: options.orderId || null,
    step: 'tipo',
    date: today,
    menuDate: activeMenu.date || today,
    menu: activeMenu.menu,
    quantity: 1,
    opciones: {},
    cliente: {
      id_cliente: client.id_cliente,
      nombre: client.nombre,
      apellido: client.apellido,
      telefono: client.telefono,
    },
    convenio,
    estadoReservadoId: await getLookupId('estados_orden', 'id_estado', 'nombre_estado', ESTADO_RESERVADO_NOMBRE),
    origenTelegramId: await getLookupId('origenes_pedido', 'id_origen', 'nombre_origen', ORIGEN_NOMBRE),
    createdAt: new Date().toISOString(),
  };
  if (contractedType) applyLunchTypeToSession(session, contractedType);
  await setState(stateKey(chatId), session);
  return session;
};

const getTodayOrders = async (clientId, today) => {
  const { data, error } = await getAdminClient()
    .from('ordenes')
    .select('id_orden,id_cliente,id_estado,metodo_pago,created_at')
    .eq('id_cliente', clientId)
    .eq('canal_origen', 'Telegram')
    .gte('created_at', `${today}T00:00:00Z`)
    .lt('created_at', `${tomorrowFromDate(today)}T00:00:00Z`);
  if (error) throw error;
  return data || [];
};

// Solo una orden Reservada o Consumida bloquea el dia; las canceladas
// permiten reservar de nuevo.
const findBlockingTodayOrder = (orders) =>
  (orders || []).find((order) => Number(order.id_estado) === ORDER_STATE.RESERVED)
  || (orders || []).find((order) => Number(order.id_estado) === ORDER_STATE.CONSUMED)
  || null;

const getOrderDetail = async (orderId) => {
  const { data, error } = await getAdminClient()
    .from('detalle_orden')
    .select('id_orden,id_producto,cantidad,precio_aplicado,id_tipo_almuerzo,observaciones_tipo,opciones,productos(nombre_producto)')
    .eq('id_orden', orderId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
};

// Resumen con los datos reales guardados de la orden (no con la sesion).
const formatExistingOrder = (order, detail = null) => {
  const lines = [];
  const opciones = detail?.opciones || {};
  const code = detail ? getLunchTypeCode({ id_tipo_almuerzo: detail.id_tipo_almuerzo, tipoAlmuerzoCodigo: opciones.tipoAlmuerzo }) : '';
  const packageDetail = getLunchPackage(code);

  if (packageDetail) lines.push(`Tipo: ${packageDetail.label}`);
  if (detail) lines.push(`Cantidad: ${Number(detail.cantidad || 1)}`);
  const productName = detail?.productos?.nombre_producto;
  if (productName) lines.push(`Producto: ${productName}`);
  const showPrice = opciones.tipoOrigen !== 'convenio_contratado' && order.metodo_pago !== 'Convenio Empresa';
  if (showPrice && detail && Number.isFinite(Number(detail.precio_aplicado))) {
    lines.push(`Precio: $${Number(detail.precio_aplicado).toFixed(2)}`);
  }
  const components = packageDetail ? lunchTypeIncludedComponents(code) : [];
  if (components.length) lines.push(`Incluye: ${components.join(', ')}`);
  for (const def of Object.values(COMPONENT_DEFS)) {
    if (opciones[def.key]) lines.push(`${capitalizeText(def.prompt)}: ${opciones[def.key]}`);
  }
  if (detail?.observaciones_tipo) lines.push(`Observacion: ${detail.observaciones_tipo}`);
  lines.push(`Estado: ${ESTADO_ORDEN_LABELS[Number(order.id_estado)] || 'Desconocido'}`);
  lines.push(`Orden: ${order.id_orden}`);
  return lines.join('\n');
};

// Editable mientras siga Reservada; el cierre automatico (cron) la cancela
// al terminar el servicio y a partir de ahi el estado la vuelve no editable.
const orderIsEditable = (order) => Number(order?.id_estado) === ORDER_STATE.RESERVED;

const existingOrderKeyboard = (order) => {
  if (!orderIsEditable(order)) return undefined;
  return inlineKeyboard([
    { text: 'Modificar reserva', callbackData: `pedido:mod:${order.id_orden}` },
    { text: 'Cancelar reserva', callbackData: `pedido:can:${order.id_orden}` },
  ]);
};

const buildOrderOptions = (session, selectedType) => ({
  ...session.opciones,
  cantidad: Number(session.quantity || 1),
  menuDate: session.menuDate || session.date,
  canal: 'Telegram',
  tipoAlmuerzo: selectedType.code,
  tipoOrigen: session.convenio?.id_convenio ? 'convenio_contratado' : 'cliente_elige',
  componentesIncluidos: lunchTypeIncludedComponents(selectedType.code),
});

// Modificacion: misma orden (id_orden), se reemplaza el detalle guardado.
const applyOrderModification = async (session, orders) => {
  const target = (orders || []).find((order) => String(order.id_orden) === String(session.orderId));
  if (!target || Number(target.id_estado) !== ORDER_STATE.RESERVED) {
    return { modifyRejected: 'not_editable' };
  }

  const adminClient = getAdminClient();
  const selectedType = getSelectedLunchType(session);
  const product = await getProductForLunchType(selectedType);

  const { error: detailError } = await adminClient
    .from('detalle_orden')
    .update({
      id_producto: product.id_producto,
      cantidad: Number(session.quantity || 1),
      precio_aplicado: Number(product.precio_unitario || 0),
      id_tipo_almuerzo: selectedType.id,
      observaciones_tipo: session.tipoAlmuerzo?.observacion || null,
      opciones: buildOrderOptions(session, selectedType),
    })
    .eq('id_orden', target.id_orden);
  if (detailError) throw detailError;

  const { error: orderError } = await adminClient
    .from('ordenes')
    .update({
      observaciones: `Reserva via Telegram ${session.date} (modificada). Convenio: ${session.convenio.nombre_empresa}.`,
    })
    .eq('id_orden', target.id_orden);
  if (orderError) throw orderError;

  return { id_orden: target.id_orden, product, modified: true };
};

const insertOrder = async (session, chatId) => {
  const today = todayInTimezone();
  const orders = await getTodayOrders(session.cliente.id_cliente, today);

  if (session.mode === 'modify' && session.orderId) {
    return applyOrderModification(session, orders);
  }

  const blocking = findBlockingTodayOrder(orders);
  if (blocking) {
    const detail = await getOrderDetail(blocking.id_orden);
    return { id_orden: blocking.id_orden, duplicate: true, existingOrder: blocking, existingDetail: detail };
  }

  const adminClient = getAdminClient();
  const selectedType = getSelectedLunchType(session);
  const product = await getProductForLunchType(selectedType);
  const opciones = buildOrderOptions(session, selectedType);

  const { data: order, error: orderError } = await adminClient
    .from('ordenes')
    .insert({
      id_cliente: session.cliente.id_cliente,
      id_estado: session.estadoReservadoId,
      id_origen: session.origenTelegramId,
      canal_origen: 'Telegram',
      metodo_pago: session.convenio.id_convenio ? 'Convenio Empresa' : 'Pendiente',
      observaciones: `Reserva via Telegram ${today}. Convenio: ${session.convenio.nombre_empresa}. Chat: ${chatId}`,
    })
    .select()
    .single();
  if (orderError) throw orderError;

  const detailRows = [{
    id_orden: order.id_orden,
    id_producto: product.id_producto,
    cantidad: Number(session.quantity || 1),
    precio_aplicado: Number(product.precio_unitario || 0),
    id_tipo_almuerzo: selectedType.id,
    observaciones_tipo: session.tipoAlmuerzo?.observacion || null,
    opciones,
  }];
  const { error: detailError } = await adminClient.from('detalle_orden').insert(detailRows);
  if (detailError) {
    const { error: cleanupError } = await adminClient.from('ordenes').delete().eq('id_orden', order.id_orden);
    if (cleanupError) {
      console.error('No se pudo limpiar una orden Telegram incompleta:', cleanupError);
    }
    throw detailError;
  }

  return { ...order, product };
};

const optionFromCallback = (text, kind, options) => {
  const [receivedKind, rawIndex] = String(text || '').split(':');
  const index = Number(rawIndex);
  if (receivedKind !== kind || !Number.isInteger(index) || index < 0 || index >= options.length) return '';
  return options[index];
};

const cleanOptions = (options) =>
  Array.isArray(options) ? options.map((option) => String(option || '').trim()).filter(Boolean) : [];

const compactMenu = (menu = {}) => ({
  entradas: cleanOptions(menu.entradas).slice(0, 8),
  sopas: cleanOptions(menu.sopas).slice(0, 8),
  segundos: cleanOptions(menu.segundos).slice(0, 8),
  postres: cleanOptions(menu.postres).slice(0, 8),
  bebidas: cleanOptions(menu.bebidas).slice(0, 8),
  guarniciones: cleanOptions(menu.guarniciones).slice(0, 8),
});

// Menu diario unico compartido; el paquete decide que componentes se piden.
const menuForSessionType = (session = {}) => compactMenu(session.menu || {});

// Componentes variables del paquete (segun includedComponents del tipo).
const COMPONENT_DEFS = {
  entrada: { key: 'entrada', pool: 'entradas', kind: 'entrada', prompt: 'entrada' },
  sopa: { key: 'sopa', pool: 'sopas', kind: 'sopa', prompt: 'sopa' },
  'plato fuerte': { key: 'segundo', pool: 'segundos', kind: 'segundo', prompt: 'plato fuerte' },
  postre: { key: 'postre', pool: 'postres', kind: 'postre', prompt: 'postre' },
  bebida: { key: 'bebida', pool: 'bebidas', kind: 'bebida', prompt: 'bebida' },
};

// Resuelve, para el paquete de la sesion: componentes autoseleccionados (1
// opcion), pasos con botones (>=2) y omitidos (0). No incluye guarnicion.
const buildComponentPlan = (session = {}) => {
  const type = getSelectedLunchType(session);
  const components = lunchTypeIncludedComponents(type.code);
  const menu = menuForSessionType(session);
  const opciones = {};
  const pendingSteps = [];
  for (const component of components) {
    const def = COMPONENT_DEFS[component];
    if (!def) continue;
    const options = cleanOptions(menu[def.pool]);
    if (options.length === 0) continue;
    if (options.length === 1) {
      opciones[def.key] = options[0];
      continue;
    }
    pendingSteps.push(component);
  }
  return { opciones, pendingSteps };
};

const getSelectedLunchType = (session = {}) =>
  TELEGRAM_LUNCH_TYPE_BY_CODE[session.tipoAlmuerzo?.code]
  || TELEGRAM_LUNCH_TYPE_BY_CODE[LUNCH_TYPE_CODES.almuerzoDia]
  || TELEGRAM_LUNCH_TYPES[0];

const isDigit = (char) => {
  const code = String(char || '').codePointAt(0);
  return code >= 48 && code <= 57;
};

const isWordBoundary = (text, index) => !text[index] || !isDigit(text[index]);

const readSignedNumberAt = (text, index, maxDigits = 3) => {
  let cursor = index;
  let sign = '';
  if (text[cursor] === '-') {
    sign = '-';
    cursor += 1;
  }

  let digits = '';
  while (digits.length < maxDigits && isDigit(text[cursor])) {
    digits += text[cursor];
    cursor += 1;
  }

  if (!digits || !isWordBoundary(text, cursor)) return null;
  return {
    value: Number(`${sign}${digits}`),
    nextIndex: cursor,
  };
};

const readSelectionNumber = (text, labels) => {
  const labelsList = Array.isArray(labels) ? labels : [labels];
  for (const label of labelsList) {
    const start = text.indexOf(normalizeText(label));
    if (start === -1) continue;

    let cursor = start + normalizeText(label).length;
    while (text[cursor] === ' ') cursor += 1;
    if ([':', '#', '='].includes(text[cursor])) cursor += 1;
    while (text[cursor] === ' ') cursor += 1;

    let digits = '';
    while (digits.length < 2 && isDigit(text[cursor])) {
      digits += text[cursor];
      cursor += 1;
    }
    if (digits) return Number(digits);
  }
  return null;
};

const readQuantityAfterLabel = (text, label) => {
  const start = text.indexOf(label);
  if (start === -1) return null;

  let cursor = start + label.length;
  while (text[cursor] === ' ') cursor += 1;
  if ([':', '#', '='].includes(text[cursor])) cursor += 1;
  while (text[cursor] === ' ') cursor += 1;

  const parsed = readSignedNumberAt(text, cursor);
  return parsed ? parsed.value : null;
};

const readQuantityBeforeLabel = (text, label) => {
  const labelStart = text.indexOf(label);
  if (labelStart <= 0) return null;

  let cursor = labelStart - 1;
  while (cursor >= 0 && text[cursor] === ' ') cursor -= 1;

  const digitEnd = cursor + 1;
  while (cursor >= 0 && isDigit(text[cursor])) cursor -= 1;
  if (text[cursor] === '-') cursor -= 1;

  const numberStart = cursor + 1;
  const parsed = readSignedNumberAt(text, numberStart);
  return parsed?.nextIndex === digitEnd ? parsed.value : null;
};

const readQuantityValue = (text) => {
  const labels = ['cantidad', 'almuerzo', 'almuerzos', 'pedido', 'pedidos'];
  for (const label of labels) {
    const afterLabel = readQuantityAfterLabel(text, label);
    if (afterLabel !== null) return afterLabel;

    const beforeLabel = readQuantityBeforeLabel(text, label);
    if (beforeLabel !== null) return beforeLabel;
  }
  return null;
};

const optionFromText = (text, labels, options) => {
  const normalized = normalizeText(text);
  const availableOptions = cleanOptions(options);
  const selectionNumber = readSelectionNumber(normalized, labels);

  if (selectionNumber !== null) {
    const index = selectionNumber - 1;
    return {
      provided: true,
      value: Number.isInteger(index) && index >= 0 && index < availableOptions.length ? availableOptions[index] : '',
    };
  }

  const matchedOption = availableOptions.find((option) => normalized.includes(normalizeText(option)));
  return {
    provided: Boolean(matchedOption),
    value: matchedOption || '',
  };
};

const quantityFromText = (text, currentQuantity = 1) => {
  const normalized = normalizeText(text);
  const value = readQuantityValue(normalized);

  if (value === null) {
    return { provided: false, valid: true, value: Number(currentQuantity || 1) };
  }

  return {
    provided: true,
    valid: Number.isInteger(value) && value >= 1 && value <= 20,
    value,
  };
};

const stepForField = (field, fallback = 'sopa') => {
  if (field === 'plato fuerte') return 'segundo';
  if (field === 'sopa') return 'sopa';
  return fallback;
};

const parseTextOrder = (text, session) => {
  const menu = menuForSessionType(session);
  const requiresSoup = session.tipoAlmuerzo?.code ? lunchTypeIncludesSoup(session.tipoAlmuerzo.code) : true;
  const soup = optionFromText(text, 'sopa', menu.sopas);
  const main = optionFromText(text, ['segundo', 'plato fuerte', 'plato'], menu.segundos);
  const quantity = quantityFromText(text, session.quantity);
  const hasSelectionInput = soup.provided || main.provided || quantity.provided;

  const nextSession = {
    ...session,
    ...(soup.value ? { sopa: soup.value } : {}),
    ...(main.value ? { segundo: main.value } : {}),
    ...(quantity.valid ? { quantity: quantity.value } : {}),
  };

  const invalid = [];
  if (soup.provided && !soup.value) invalid.push('sopa');
  if (main.provided && !main.value) invalid.push('plato fuerte');
  if (!quantity.valid) invalid.push('cantidad');
  if (!hasSelectionInput) invalid.push('formato');

  const missing = [];
  if (requiresSoup && !nextSession.sopa) missing.push('sopa');
  if (!nextSession.segundo) missing.push('plato fuerte');

  const nextField = invalid.find((field) => field !== 'cantidad' && field !== 'formato') || missing[0];
  nextSession.step = stepForField(nextField, session.step);

  return {
    valid: invalid.length === 0 && missing.length === 0,
    invalid,
    missing,
    session: nextSession,
  };
};

const correctionText = ({ invalid, missing }) => {
  const lines = ['No pude interpretar el pedido. El pedido no fue registrado.'];

  if (invalid.includes('formato')) {
    lines.push('El mensaje no tiene un formato de pedido reconocido.');
  } else if (invalid.length) {
    lines.push(`Valores invalidos: ${invalid.join(', ')}.`);
  }
  if (missing.length) lines.push(`Falta: ${missing.join(', ')}.`);

  lines.push('Usa los botones del bot para escoger el paquete, la sopa cuando aplique y el plato fuerte.');
  return lines.join('\n\n');
};

const capitalizeText = (value) => (value ? value.charAt(0).toUpperCase() + value.slice(1) : value);

const orderConfirmation = (session, order) => {
  const selectedType = getSelectedLunchType(session);
  const components = lunchTypeIncludedComponents(selectedType.code);
  const showPrice = !session.convenio?.id_convenio; // convenio: sin precio
  const lines = [
    order.modified ? 'Tu reserva quedo actualizada.' : 'Tu almuerzo quedo reservado.',
    '',
    `Tipo: ${selectedType.shortLabel || selectedType.label}`,
    `Cantidad: ${Number(session.quantity || 1)}`,
  ];

  if (order.product?.nombre_producto) lines.push(`Producto: ${order.product.nombre_producto}`);
  if (showPrice && typeof order.product?.precio_unitario === 'number') {
    lines.push(`Precio: $${order.product.precio_unitario.toFixed(2)}`);
  }
  if (components.length) lines.push(`Incluye: ${components.join(', ')}`);
  const opts = session.opciones || {};
  for (const def of Object.values(COMPONENT_DEFS)) {
    if (opts[def.key]) lines.push(`${capitalizeText(def.prompt)}: ${opts[def.key]}`);
  }
  if (session.tipoAlmuerzo?.observacion) lines.push(`Observacion: ${session.tipoAlmuerzo.observacion}`);
  lines.push('Estado: Reservado', `Orden: ${order.id_orden}`);

  return lines.join('\n');
};

const orderRegistrationFailureText = () =>
  'No pude registrar tu pedido en este momento. El pedido no fue registrado.\n\n' +
  'Tus selecciones se conservaron. Intenta nuevamente o envia /cancelar para empezar otra vez.';

const promptConsent = async (chatId) => {
  await upsertSubscriptionByChat(chatId, {
    consent_status: 'pending',
    is_active: true,
    consent_notice_version: CONSENT_NOTICE_VERSION,
    consent_notice_text: privacyText(),
  });
  await sendMessage(chatId, privacyText(), consentKeyboard());
};

const confirmKeyboard = (sid) => inlineKeyboard([{ text: 'Confirmar reserva', callbackData: withSid('confirmar:ok', sid) }]);

// Mensaje + teclado del paso actual: siguiente componente pendiente o confirmacion.
const stepPromptText = (session) => {
  if (session.step === 'component' && session.pendingSteps?.length) {
    const def = COMPONENT_DEFS[session.pendingSteps[0]];
    const options = cleanOptions(menuForSessionType(session)[def.pool]);
    return { text: `Elige tu ${def.prompt}.`, keyboard: optionsKeyboard(def.kind, options, session.sid) };
  }
  const summary = [];
  const opts = session.opciones || {};
  for (const def of Object.values(COMPONENT_DEFS)) {
    if (opts[def.key]) summary.push(`${capitalizeText(def.prompt)}: ${opts[def.key]}`);
  }
  const body = summary.length ? `${summary.join('\n')}\n\n` : '';
  const confirmLabel = session.mode === 'modify' ? 'Confirma la modificacion de tu reserva.' : 'Confirma tu reserva.';
  return { text: `${body}${confirmLabel}`, keyboard: confirmKeyboard(session.sid) };
};

const promptMenu = async (chatId, client, prefix = '', options = {}) => {
  const today = todayInTimezone();
  if (!isBusinessDay(today)) {
    await sendMessage(chatId, `${prefix}${notAvailableTodayText()}`);
    return;
  }
  const session = await startSessionForClient(chatId, client, options);
  if (!session) {
    await sendMessage(chatId, `${prefix}Tu Telegram quedo vinculado. Aun no hay un menu activo; recibiras el siguiente envio disponible.`);
    return;
  }
  if (session.step === 'tipo') {
    // Cliente frecuente: elige el paquete (los botones muestran precio).
    await sendMessage(chatId, `${prefix}${menuCaption(session.date)}`, lunchTypeKeyboard(session.sid));
    return;
  }
  // Convenio: tipo contratado fijo (sin precio) -> pedir componentes aplicables.
  const type = getSelectedLunchType(session);
  const components = lunchTypeIncludedComponents(type.code);
  const includedText = components.length ? `\nIncluye: ${components.join(', ')}` : '';
  const header =
    `${prefix}Ecencia Andina - Menu del dia ${session.date}\n` +
    `Tu convenio (${session.convenio.nombre_empresa}) tiene contratado: ${type.shortLabel || type.label}.${includedText}\n\n`;
  const prompt = stepPromptText(session);
  await sendMessage(chatId, `${header}${prompt.text}`, prompt.keyboard);
};

const optionsForStep = (session) => {
  if (session.step === 'tipo') return lunchTypeKeyboard(session.sid);
  return stepPromptText(session).keyboard;
};

const processTextSession = async (
  chatId,
  text,
  session,
  {
    saveState = setState,
    notify = sendMessage,
    trace = async () => {},
  } = {},
) => {
  if (session.step === 'tipo') {
    await trace({
      id_cliente: session.cliente?.id_cliente,
      interpreted_payload: { source: 'text', step: 'tipo', text },
      outcome: 'failed',
      error_message: 'Tipo de almuerzo requerido antes del pedido',
    });
    await notify(chatId, 'Primero elige el tipo de almuerzo con los botones.', lunchTypeKeyboard(session.sid));
    return { status: 'invalid_type_required' };
  }

  await saveState(stateKey(chatId), session);
  await trace({
    id_cliente: session.cliente?.id_cliente,
    interpreted_payload: {
      source: 'text',
      step: session.step,
      text,
    },
    outcome: 'failed',
    error_message: 'El flujo de reservas solo acepta botones',
  });
  await notify(chatId, 'Usa los botones para escoger tu almuerzo. No registro el pedido por texto.', optionsForStep(session));
  return { status: 'buttons_required', session };
};

// Registra la reserva (path unico y traceado) tras resolver los componentes.
const reserveAndConfirm = async (chatId, session, trace) => {
  let order;
  try {
    order = await insertOrder(session, chatId);
  } catch (error) {
    await setState(stateKey(chatId), session);
    await trace({
      id_cliente: session.cliente?.id_cliente,
      interpreted_payload: {
        source: 'buttons',
        step: 'registration_error',
        tipoAlmuerzo: session.tipoAlmuerzo?.code,
        quantity: Number(session.quantity || 1),
        opciones: session.opciones || {},
      },
      outcome: 'failed',
      error_message: error.message || 'No se pudo registrar el pedido',
    });
    await sendMessage(chatId, orderRegistrationFailureText(), confirmKeyboard(session.sid));
    return;
  }

  await deleteState(stateKey(chatId));

  if (order.modifyRejected) {
    await trace({
      id_cliente: session.cliente?.id_cliente,
      interpreted_payload: { source: 'buttons', step: 'modify_rejected', reason: order.modifyRejected },
      outcome: 'rejected',
      error_message: 'La reserva ya no se puede modificar',
    });
    await sendMessage(
      chatId,
      'Tu reserva ya no esta en estado Reservado, asi que no se puede modificar.\n\nEnvia /pedido para ver tu reserva actual.',
    );
    return;
  }

  if (order.duplicate) {
    await trace({
      id_cliente: session.cliente?.id_cliente,
      id_orden: order.id_orden,
      interpreted_payload: {
        source: 'buttons',
        step: 'duplicate',
        tipoAlmuerzo: session.tipoAlmuerzo?.code,
        quantity: Number(session.quantity || 1),
        opciones: session.opciones || {},
      },
      outcome: 'rejected',
      error_message: 'Reserva duplicada para el dia',
    });
    const summary = formatExistingOrder(order.existingOrder, order.existingDetail);
    const footer = orderIsEditable(order.existingOrder)
      ? 'Puedes modificarla o cancelarla con los botones, o consultarla luego con /pedido.'
      : 'Consulta tu reserva con /pedido.';
    await sendMessage(
      chatId,
      `Ya tienes una reserva registrada para hoy; la nueva seleccion no fue registrada.\n\nEsta es tu reserva actual:\n\n${summary}\n\n${footer}`,
      existingOrderKeyboard(order.existingOrder),
    );
    return;
  }

  await trace({
    id_cliente: session.cliente?.id_cliente,
    id_orden: order.id_orden,
    interpreted_payload: {
      source: 'buttons',
      step: order.modified ? 'modified' : 'completed',
      tipoAlmuerzo: session.tipoAlmuerzo?.code,
      tipoOrigen: session.convenio?.id_convenio ? 'convenio_contratado' : 'cliente_elige',
      convenio: session.convenio?.nombre_empresa || null,
      producto: order.product?.nombre_producto || null,
      precio: order.product?.precio_unitario || null,
      componentesIncluidos: lunchTypeIncludedComponents(session.tipoAlmuerzo?.code),
      quantity: Number(session.quantity || 1),
      opciones: session.opciones || {},
    },
    outcome: 'success',
    error_message: null,
  });
  await sendMessage(chatId, orderConfirmation(session, order));
};

const helpText = () =>
  'Comandos disponibles:\n' +
  '/menu - Ver el menu del dia y reservar\n' +
  '/pedido - Consultar, modificar o cancelar tu reserva de hoy\n' +
  '/cancelar - Descartar la seleccion en curso (no cancela una reserva registrada)\n' +
  '/ayuda - Ver esta ayuda\n' +
  '/privacidad - Aviso de privacidad y consentimiento\n' +
  '/misdatos - Conocer que categorias de datos tratamos\n' +
  '/eliminarmisdatos - Solicitar la eliminacion de tus datos\n' +
  '/revocar - Revocar tu consentimiento y dejar de usar el bot';

const myDataText = (subscription) => {
  if (!subscription) {
    return 'No tenemos datos personales vinculados a este chat. Si deseas registrarte, envia /start.';
  }
  return (
    'Datos que tratamos vinculados a este chat (por seguridad no se muestran los valores):\n\n' +
    '- Identificador del chat de Telegram\n' +
    '- Telefono vinculado a tu registro de cliente\n' +
    '- Nombre y apellido del cliente\n' +
    '- Reservas y preferencias de menu solicitadas por este bot\n' +
    '- Trazas de tus pedidos por Telegram\n\n' +
    `Estado del consentimiento: ${subscription.consent_status || 'sin registro'}` +
    (subscription.consent_notice_version ? `\nVersion del aviso: ${subscription.consent_notice_version}` : '') +
    `\n\nPara acceso, rectificacion o eliminacion contacta a ${PRIVACY_CONTACT}.`
  );
};

const deleteDataText = () =>
  'Registramos tu solicitud de eliminacion de datos.\n\n' +
  `Un administrador de Ecencia Andina procesara la solicitud; puedes darle seguimiento con ${PRIVACY_CONTACT}.\n\n` +
  'Si ademas quieres dejar de usar el bot ahora mismo, envia /revocar.';

const revokeKeyboard = () =>
  inlineKeyboard([
    { text: 'Si, revocar mi consentimiento', callbackData: 'revocar:confirm' },
    { text: 'No, mantener mi acceso', callbackData: 'revocar:keep' },
  ]);

const recordPrivacyAudit = async ({ chatId, subscription, action, outcome, metadata = {} }) => {
  try {
    const { error } = await getAdminClient().from('telegram_privacy_audits').insert({
      chat_id: String(chatId),
      subscription_id: subscription?.id || null,
      id_cliente: subscription?.id_cliente || null,
      action,
      outcome,
      metadata,
    });
    if (error) throw error;
  } catch (error) {
    console.warn('No se pudo registrar la auditoria de privacidad Telegram:', error.message);
  }
};

// Revocacion/rechazo de consentimiento: mismo efecto que consent:reject.
const rejectConsentForChat = async (chatId) => {
  const consentStep = await getState(consentKey(chatId));
  await deleteState(stateKey(chatId));
  await deleteState(consentKey(chatId));
  if (consentStep?.inviteToken) await updateInvitationByToken(consentStep.inviteToken, { status: 'rejected' });
  await upsertSubscriptionByChat(chatId, {
    consent_status: 'rejected',
    is_active: false,
    consent_notice_version: CONSENT_NOTICE_VERSION,
    consent_notice_text: privacyText(),
    rejected_at: new Date().toISOString(),
  });
};

const sendExistingOrderSummary = async (chatId, order, detail, header) => {
  const summary = formatExistingOrder(order, detail);
  const footer = orderIsEditable(order) ? '\n\nPuedes modificarla o cancelarla con los botones.' : '';
  await sendMessage(chatId, `${header}\n\n${summary}${footer}`, existingOrderKeyboard(order));
};

const handlePedidoCommand = async (chatId, subscription) => {
  const client = await findClientForSubscription(subscription);
  if (!client) {
    await sendMessage(chatId, 'Tu suscripcion esta aceptada, pero el cliente no esta activo. Contacta a un administrador.');
    return;
  }
  const today = todayInTimezone();
  const orders = await getTodayOrders(client.id_cliente, today);
  if (!orders.length) {
    await sendMessage(chatId, 'No tienes una reserva registrada hoy. Envia /menu para reservar.');
    return;
  }
  const active = findBlockingTodayOrder(orders);
  if (!active) {
    const lastCancelled = orders[orders.length - 1];
    const detail = await getOrderDetail(lastCancelled.id_orden);
    await sendMessage(
      chatId,
      `Tu reserva de hoy esta cancelada:\n\n${formatExistingOrder(lastCancelled, detail)}\n\nEnvia /menu si deseas reservar de nuevo.`,
    );
    return;
  }
  const detail = await getOrderDetail(active.id_orden);
  await sendExistingOrderSummary(chatId, active, detail, 'Tu reserva de hoy:');
};

const cancelKeyboard = (orderId) =>
  inlineKeyboard([
    { text: 'Si, cancelar mi reserva', callbackData: `pedido:can2:${orderId}` },
    { text: 'No, mantener mi reserva', callbackData: `pedido:keep:${orderId}` },
  ]);

const cancelOrderForClient = async (order) => {
  const adminClient = getAdminClient();
  const { data: updated, error } = await adminClient
    .from('ordenes')
    .update({ id_estado: ORDER_STATE.CANCELLED })
    .eq('id_orden', order.id_orden)
    .eq('id_estado', ORDER_STATE.RESERVED)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!updated) return false;

  const { error: auditError } = await adminClient.from('orden_estado_auditoria').insert([{
    id_orden: order.id_orden,
    estado_anterior: ORDER_STATE.RESERVED,
    estado_nuevo: ORDER_STATE.CANCELLED,
    motivo: 'Cancelacion via Telegram por el cliente',
    monto_ajustado: 0,
    created_by: null,
  }]);
  if (auditError) console.warn('No se pudo auditar la cancelacion Telegram:', auditError.message);
  return true;
};

// Botones sobre la reserva real del dia: pedido:<accion>:<id_orden>.
const handlePedidoCallback = async (chatId, subscription, text, trace) => {
  const [, action, orderId] = String(text || '').split(':');
  const client = await findClientForSubscription(subscription);
  if (!client) {
    await sendMessage(chatId, 'Tu suscripcion esta aceptada, pero el cliente no esta activo. Contacta a un administrador.');
    return;
  }
  const today = todayInTimezone();
  const orders = await getTodayOrders(client.id_cliente, today);
  const order = orders.find((row) => String(row.id_orden) === String(orderId));

  if (!order) {
    await trace({
      id_cliente: client.id_cliente,
      interpreted_payload: { source: 'buttons', step: `pedido_${action || 'desconocido'}`, callbackData: text },
      outcome: 'rejected',
      error_message: 'La orden no corresponde a la reserva del dia',
    });
    await sendMessage(chatId, 'Esa reserva ya no esta disponible. Envia /pedido para ver tu reserva actual.');
    return;
  }

  if (action === 'keep') {
    await trace({
      id_cliente: client.id_cliente,
      id_orden: order.id_orden,
      interpreted_payload: { source: 'buttons', step: 'cancel_kept' },
      outcome: 'success',
      error_message: null,
    });
    await sendMessage(chatId, 'Tu reserva se mantiene sin cambios.');
    return;
  }

  if (!['mod', 'can', 'can2'].includes(action)) {
    await sendMessage(chatId, 'Esa opcion no esta disponible. Envia /pedido para ver tu reserva.');
    return;
  }

  if (!orderIsEditable(order)) {
    const reasonText = 'Tu reserva ya no esta en estado Reservado.';
    await trace({
      id_cliente: client.id_cliente,
      id_orden: order.id_orden,
      interpreted_payload: { source: 'buttons', step: `pedido_${action}` },
      outcome: 'rejected',
      error_message: reasonText,
    });
    await sendMessage(chatId, `${reasonText} No es posible ${action === 'mod' ? 'modificarla' : 'cancelarla'} por Telegram.`);
    return;
  }

  if (action === 'mod') {
    const activeMenu = await getActiveMenu();
    if (!activeMenu) {
      await sendMessage(chatId, 'No hay un menu activo en este momento; no es posible modificar la reserva.');
      return;
    }
    await trace({
      id_cliente: client.id_cliente,
      id_orden: order.id_orden,
      interpreted_payload: { source: 'buttons', step: 'modify_started' },
      outcome: 'pending',
      error_message: null,
    });
    await promptMenu(chatId, client, 'Vamos a modificar tu reserva. Elige de nuevo tu almuerzo.\n\n', {
      mode: 'modify',
      orderId: order.id_orden,
    });
    return;
  }

  if (action === 'can') {
    await sendMessage(
      chatId,
      'Vas a cancelar tu reserva de hoy. Esta accion no se puede deshacer.\n\nConfirma tu decision.',
      cancelKeyboard(order.id_orden),
    );
    return;
  }

  const cancelled = await cancelOrderForClient(order);
  if (!cancelled) {
    await sendMessage(chatId, 'No pude cancelar la reserva; es posible que ya este consumida o cancelada. Envia /pedido para verificar.');
    return;
  }
  await trace({
    id_cliente: client.id_cliente,
    id_orden: order.id_orden,
    interpreted_payload: { source: 'buttons', step: 'cancelled_by_client' },
    outcome: 'success',
    error_message: null,
  });
  await sendMessage(
    chatId,
    `Tu reserva fue cancelada.\n\nOrden: ${order.id_orden}\n\nEnvia /menu si deseas reservar de nuevo.`,
  );
};

// Carga la sesion activa; si no existe, vencio o no es dia habil responde y
// devuelve null.
const loadActiveSession = async (chatId, isCallback, trace) => {
  const source = isCallback ? 'buttons' : 'text';
  const session = await getState(stateKey(chatId));
  if (!session) {
    await trace({
      interpreted_payload: { source, step: 'missing_session' },
      outcome: 'failed',
      error_message: 'No existe una sesion de menu activa',
    });
    await sendMessage(
      chatId,
      'No tengo una seleccion activa para este chat. Envia /menu para reservar o /pedido para consultar tu reserva de hoy.',
    );
    return null;
  }

  const today = todayInTimezone();
  if (!isBusinessDay(today)) {
    await deleteState(stateKey(chatId));
    await trace({
      id_cliente: session.cliente?.id_cliente,
      interpreted_payload: { source, step: session.step, date: today },
      outcome: 'rejected',
      error_message: 'Reserva fuera de lunes a viernes',
    });
    await sendMessage(chatId, notAvailableTodayText());
    return null;
  }

  if (session.date !== today) {
    await deleteState(stateKey(chatId));
    await trace({
      id_cliente: session.cliente?.id_cliente,
      interpreted_payload: { source, step: session.step },
      outcome: 'failed',
      error_message: 'La sesion del menu esta vencida',
    });
    await sendMessage(chatId, 'El menu activo ya vencio. Envia /menu para cargar el menu de hoy.');
    return null;
  }

  return session;
};

// Boton de un menu anterior (sid distinto): se rechaza sin tocar la sesion vigente.
const rejectStaleCallback = async (chatId, session, text, trace) => {
  await trace({
    id_cliente: session.cliente?.id_cliente,
    interpreted_payload: { source: 'buttons', step: session.step, callbackData: text },
    outcome: 'rejected',
    error_message: 'Boton de un menu anterior',
  });
  const stalePrefix = 'Ese boton pertenece a un menu anterior.';
  if (session.step === 'tipo') {
    await sendMessage(chatId, `${stalePrefix} Usa los botones mas recientes.`, lunchTypeKeyboard(session.sid));
    return;
  }
  const prompt = stepPromptText(session);
  await sendMessage(chatId, `${stalePrefix} ${prompt.text}`, prompt.keyboard);
};

const handleTipoStep = async (chatId, session, text, trace) => {
  const [kind, code] = String(text || '').split(':');
  const selectedType = kind === 'tipo' ? TELEGRAM_LUNCH_TYPE_BY_CODE[code] : undefined;
  if (!selectedType) {
    await trace({
      id_cliente: session.cliente?.id_cliente,
      interpreted_payload: { source: 'buttons', step: 'tipo', callbackData: text },
      outcome: 'failed',
      error_message: 'Seleccion de tipo de almuerzo invalida',
    });
    await sendMessage(chatId, 'Usa los botones para escoger el tipo de almuerzo.', lunchTypeKeyboard(session.sid));
    return;
  }
  applyLunchTypeToSession(session, selectedType);
  await setState(stateKey(chatId), session);
  await trace({
    id_cliente: session.cliente?.id_cliente,
    interpreted_payload: {
      source: 'buttons',
      step: session.step,
      tipoAlmuerzo: selectedType.code,
      tipoOrigen: 'cliente_elige',
      precio: selectedType.price,
      opcionesAuto: session.opciones,
      componentesIncluidos: lunchTypeIncludedComponents(selectedType.code),
    },
    outcome: 'pending',
    error_message: null,
  });
  if (session.step === 'confirmar') {
    await reserveAndConfirm(chatId, session, trace);
    return;
  }
  const prompt = stepPromptText(session);
  await sendMessage(chatId, `Tipo: ${selectedType.label}\n${prompt.text}`, prompt.keyboard);
};

const handleComponentStep = async (chatId, session, text, trace) => {
  const currentComponent = session.pendingSteps?.[0];
  const def = COMPONENT_DEFS[currentComponent];
  const options = def ? cleanOptions(menuForSessionType(session)[def.pool]) : [];
  const chosen = def ? optionFromCallback(text, def.kind, options) : '';
  if (!def || !chosen) {
    await trace({
      id_cliente: session.cliente?.id_cliente,
      interpreted_payload: { source: 'buttons', step: currentComponent || 'component', callbackData: text },
      outcome: 'failed',
      error_message: 'Seleccion de componente invalida',
    });
    const prompt = stepPromptText(session);
    await sendMessage(chatId, `Usa los botones para escoger tu ${def ? def.prompt : 'opcion'}.`, prompt.keyboard);
    return;
  }
  session.opciones = { ...session.opciones, [def.key]: chosen };
  session.pendingSteps = session.pendingSteps.slice(1);
  session.step = session.pendingSteps.length ? 'component' : 'confirmar';
  await setState(stateKey(chatId), session);
  await trace({
    id_cliente: session.cliente?.id_cliente,
    interpreted_payload: { source: 'buttons', step: session.step, [def.key]: chosen },
    outcome: 'pending',
    error_message: null,
  });
  const prompt = stepPromptText(session);
  await sendMessage(chatId, `${capitalizeText(def.prompt)}: ${chosen}\n\n${prompt.text}`, prompt.keyboard);
};

const handleConfirmStep = async (chatId, session, text, trace) => {
  const [kind, action] = String(text || '').split(':');
  if (kind !== 'confirmar' || action !== 'ok') {
    const prompt = stepPromptText(session);
    await sendMessage(chatId, 'Toca "Confirmar reserva" para registrar tu pedido.', prompt.keyboard);
    return;
  }
  await reserveAndConfirm(chatId, session, trace);
};

const handleUnknownStep = async (chatId, session, text, trace) => {
  await trace({
    id_cliente: session.cliente?.id_cliente,
    interpreted_payload: { source: 'buttons', step: session.step, callbackData: text },
    outcome: 'failed',
    error_message: 'Paso de sesion no soportado para paquetes oficiales',
  });
  await deleteState(stateKey(chatId));
  await sendMessage(chatId, 'La seleccion anterior ya no esta disponible. Envia /menu para empezar con los paquetes actuales.');
};

const SESSION_STEP_HANDLERS = {
  tipo: handleTipoStep,
  component: handleComponentStep,
  confirmar: handleConfirmStep,
};

const handleAcceptedSession = async (chatId, text, isCallback, traceId = '') => {
  const trace = (patch) => updateOrderTrace(traceId, patch);
  const session = await loadActiveSession(chatId, isCallback, trace);
  if (!session) return;

  if (!isCallback) {
    await processTextSession(chatId, text, session, { trace });
    return;
  }

  if (!callbackMatchesSession(text, session)) {
    await rejectStaleCallback(chatId, session, text, trace);
    return;
  }

  const stepHandler = SESSION_STEP_HANDLERS[session.step] || handleUnknownStep;
  await stepHandler(chatId, session, text, trace);
};

const hasAcceptedSubscription = (subscription) =>
  subscription?.consent_status === 'accepted' && subscription.is_active !== false;

const handleCancelCommand = async ({ chatId, subscription }) => {
  await deleteState(stateKey(chatId));
  if (subscription?.consent_status === 'accepted') {
    await sendMessage(
      chatId,
      'Listo, descarte la seleccion en curso. Envia /menu para empezar otra vez.\n\nSi ya tienes una reserva registrada, sigue activa: usa /pedido para verla, modificarla o cancelarla.',
    );
  }
};

const handleStartCommand = async ({ chatId, subscription, startPayload }) => {
  if (hasAcceptedSubscription(subscription)) {
    const client = await findClientForSubscription(subscription);
    if (!client) {
      await sendMessage(chatId, 'Tu suscripcion esta aceptada, pero el cliente no esta activo. Contacta a un administrador.');
      return;
    }
    await sendMessage(
      chatId,
      'Tu Telegram ya esta vinculado con tu registro de cliente. Recibiras el menu cuando Ecencia Andina lo envie.',
    );
    return;
  }
  if (startPayload) {
    const invitation = await getInvitationByToken(startPayload);
    if (!invitation) {
      await sendMessage(chatId, 'El link de registro no es valido. Pide al administrador que genere uno nuevo.');
      return;
    }
    await setState(consentKey(chatId), { status: 'invited_pending_consent', inviteToken: startPayload });
    await updateInvitationByToken(startPayload, { status: 'opened' });
  }
  await promptConsent(chatId);
};

const handleHelpCommand = ({ chatId }) => sendMessage(chatId, helpText());

const handlePrivacyNoticeCommand = ({ chatId }) =>
  sendMessage(chatId, `${privacyText()}\n\nContacto de privacidad: ${PRIVACY_CONTACT}.`);

const handleMyDataCommand = async ({ chatId, subscription }) => {
  await recordPrivacyAudit({ chatId, subscription, action: 'misdatos', outcome: subscription ? 'informed' : 'no_data' });
  await sendMessage(chatId, myDataText(subscription));
};

const handleDeleteDataCommand = async ({ chatId, subscription }) => {
  await recordPrivacyAudit({ chatId, subscription, action: 'eliminarmisdatos', outcome: subscription ? 'informed' : 'no_data' });
  await sendMessage(chatId, subscription ? deleteDataText() : myDataText(null));
};

const handleRevokeCommand = async ({ chatId, subscription }) => {
  if (!subscription) {
    await sendMessage(chatId, 'No hay un consentimiento activo para este chat.');
    return;
  }
  await sendMessage(
    chatId,
    'Si revocas tu consentimiento dejaremos de enviarte menus y el bot no respondera mas mensajes hasta que un administrador te habilite de nuevo.\n\nConfirma tu decision.',
    revokeKeyboard(),
  );
};

const handleRevokeConfirm = async ({ chatId, subscription }) => {
  if (!subscription) return;
  await rejectConsentForChat(chatId);
  await recordPrivacyAudit({ chatId, subscription, action: 'revocar', outcome: 'revoked' });
  await sendMessage(
    chatId,
    'Tu consentimiento quedo revocado. No te enviaremos mas menus ni mensajes. Para volver a usar el bot contacta a un administrador de Ecencia Andina.',
  );
};

const handleRevokeKeep = ({ chatId }) => sendMessage(chatId, 'Tu consentimiento se mantiene sin cambios.');

const handleConsentReject = async ({ chatId }) => {
  await rejectConsentForChat(chatId);
  await sendMessage(chatId, 'Entendido. No registraremos tu telefono ni te enviaremos menus o recordatorios por Telegram.');
};

const handleConsentAccept = async ({ chatId }) => {
  const consentStep = await getState(consentKey(chatId));
  await upsertSubscriptionByChat(chatId, {
    consent_status: 'pending',
    is_active: true,
    consent_notice_version: CONSENT_NOTICE_VERSION,
    consent_notice_text: privacyText(),
    rejected_at: null,
  });
  await setState(consentKey(chatId), { status: 'accepted_pending_phone', inviteToken: consentStep?.inviteToken || null });
  await sendMessage(chatId, 'Gracias. Ahora comparte tu telefono de Telegram para validarlo con tu registro de cliente.', contactKeyboard());
};

const handleContactShared = async ({ chatId, subscription, contactPhone, contactVerified }) => {
  const consentStep = await getState(consentKey(chatId));
  if (subscription?.consent_status !== 'pending' || consentStep?.status !== 'accepted_pending_phone') return;
  if (!contactVerified) {
    await sendMessage(chatId, 'Comparte tu propio contacto de Telegram para continuar.');
    return;
  }

  const client = await findClientByPhone(contactPhone);
  if (!client) {
    await sendMessage(chatId, 'No encontre un cliente activo con ese telefono. Contacta a un administrador.');
    return;
  }

  const saved = await saveAcceptedSubscription(chatId, client, contactPhone, contactVerified, {
    allowRejected: Boolean(consentStep?.inviteToken),
  });
  if (saved.blocked && saved.reason === 'rejected') return;
  if (saved.blocked && saved.reason === 'chat_taken') {
    await sendMessage(chatId, 'Ese telefono ya esta vinculado a otro chat. Pide a un administrador que lo revise.');
    return;
  }

  if (consentStep?.inviteToken) await updateInvitationByToken(consentStep.inviteToken, { status: 'accepted' });
  await deleteState(consentKey(chatId));
  await sendMessage(chatId, registrationCompleteText(client));
};

// Devuelve true si respondio con la guia de "Compartir telefono" pendiente.
const handlePendingPhoneGuidance = async ({ chatId, subscription, text }) => {
  if (subscription?.consent_status !== 'pending' || !text.trim()) return false;
  const consentStep = await getState(consentKey(chatId));
  if (consentStep?.status !== 'accepted_pending_phone') return false;
  const guidance = looksLikePhoneText(text)
    ? typedPhonePendingText()
    : 'Para completar el registro, usa el boton "Compartir telefono" de Telegram.';
  await sendMessage(chatId, guidance, contactKeyboard());
  return true;
};

const handleMenuCommand = async ({ chatId, subscription }) => {
  if (!hasAcceptedSubscription(subscription)) return;
  const client = await findClientForSubscription(subscription);
  if (!client) {
    await sendMessage(chatId, 'Tu suscripcion esta aceptada, pero el cliente no esta activo. Contacta a un administrador.');
    return;
  }
  // Con reserva vigente no se reinicia la seleccion: se muestra la reserva real.
  const orders = await getTodayOrders(client.id_cliente, todayInTimezone());
  const blocking = findBlockingTodayOrder(orders);
  if (blocking) {
    const detail = await getOrderDetail(blocking.id_orden);
    const header = Number(blocking.id_estado) === ORDER_STATE.CONSUMED
      ? 'Tu almuerzo de hoy ya fue consumido:'
      : 'Ya tienes una reserva registrada para hoy:';
    await sendExistingOrderSummary(chatId, blocking, detail, header);
    return;
  }
  await promptMenu(chatId, client);
};

const handlePedidoCommandGate = async ({ chatId, subscription }) => {
  if (!hasAcceptedSubscription(subscription)) return;
  await handlePedidoCommand(chatId, subscription);
};

// Comandos que se atienden antes del flujo de consentimiento/registro.
const EARLY_COMMAND_HANDLERS = {
  '/cancelar': handleCancelCommand,
  cancelar: handleCancelCommand,
  '/reset': handleCancelCommand,
  reset: handleCancelCommand,
  '/ayuda': handleHelpCommand,
  ayuda: handleHelpCommand,
  '/help': handleHelpCommand,
  '/privacidad': handlePrivacyNoticeCommand,
  '/misdatos': handleMyDataCommand,
  '/eliminarmisdatos': handleDeleteDataCommand,
  '/revocar': handleRevokeCommand,
};

const CALLBACK_COMMAND_HANDLERS = {
  'revocar:confirm': handleRevokeConfirm,
  'revocar:keep': handleRevokeKeep,
  'consent:reject': handleConsentReject,
  'consent:accept': handleConsentAccept,
};

// Comandos que respetan primero el flujo de registro (contacto pendiente).
const LATE_COMMAND_HANDLERS = {
  '/menu': handleMenuCommand,
  '/pedido': handlePedidoCommandGate,
};

const isStartCommand = (command) => command === '/start' || command.startsWith('/start ');

const handleAcceptedInteraction = async (ctx) => {
  const { chatId, text, isCallback, subscription } = ctx;
  if (!hasAcceptedSubscription(subscription)) return;
  if (!isCallback && !text.trim()) return;

  const traceId = await createOrderTrace(ctx, {
    clientId: subscription.id_cliente,
    subscriptionId: subscription.id,
    phoneNormalized: subscription.phone_normalized,
  });

  try {
    if (isCallback && text.startsWith('pedido:')) {
      await handlePedidoCallback(chatId, subscription, text, (patch) => updateOrderTrace(traceId, patch));
    } else {
      await handleAcceptedSession(chatId, text, isCallback, traceId);
    }
  } catch (error) {
    await updateOrderTrace(traceId, {
      id_cliente: subscription.id_cliente,
      subscription_id: subscription.id,
      interpreted_payload: {
        source: isCallback ? 'buttons' : 'text',
        step: 'processing_error',
      },
      outcome: 'failed',
      error_message: error.message || 'Error inesperado al procesar el pedido',
    });
    throw error;
  }
};

const handleTelegramUpdate = async (update) => {
  const parsed = readUpdate(update);
  if (!parsed.chatId) return;
  if (parsed.callbackId) await answerCallback(parsed.callbackId);

  const ctx = {
    ...parsed,
    command: normalizeText(parsed.text),
    startPayload: startPayloadFromText(parsed.text),
    subscription: await getSubscriptionByChat(parsed.chatId),
  };

  if (ctx.subscription?.consent_status === 'rejected' && !ctx.startPayload) return;

  if (isStartCommand(ctx.command)) {
    await handleStartCommand(ctx);
    return;
  }

  const earlyHandler = EARLY_COMMAND_HANDLERS[ctx.command];
  if (earlyHandler) {
    await earlyHandler(ctx);
    return;
  }

  const callbackHandler = CALLBACK_COMMAND_HANDLERS[ctx.text];
  if (callbackHandler) {
    await callbackHandler(ctx);
    return;
  }

  if (ctx.contactPhone) {
    await handleContactShared(ctx);
    return;
  }

  if (await handlePendingPhoneGuidance(ctx)) return;

  const lateHandler = LATE_COMMAND_HANDLERS[ctx.command];
  if (lateHandler) {
    await lateHandler(ctx);
    return;
  }

  await handleAcceptedInteraction(ctx);
};

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
    res.status(200).json({ ok: false });
  }
});

module.exports = router;
module.exports.handleTelegramUpdate = handleTelegramUpdate;
module.exports._private = {
  saveAcceptedSubscription,
  startPayloadFromText,
  parseTextOrder,
  correctionText,
  orderConfirmation,
  orderRegistrationFailureText,
  processTextSession,
  quantityFromText,
  readUpdate,
  looksLikePhoneText,
  registrationCompleteText,
  activeConvenio,
  TELEGRAM_LUNCH_TYPE_BY_ID,
  buildComponentPlan,
  callbackMatchesSession,
  findBlockingTodayOrder,
  formatExistingOrder,
  helpText,
  myDataText,
  withSid,
};
