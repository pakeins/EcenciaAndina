const express = require('express');
const { getAdminClient } = require('../config/supabase');
const { normalizePhone } = require('../validation/eciencia');

const router = express.Router();

const CONSENT_NOTICE_VERSION = 'EC-LOPDP-2026-06';
const TIMEZONE = process.env.N8N_ECIENCIA_TIMEZONE || 'America/Bogota';
const DEFAULT_PRODUCT_NAME = process.env.N8N_ECIENCIA_PRODUCTO_ALMUERZO_NOMBRE || 'Almuerzo';
const ORIGEN_NOMBRE = process.env.N8N_ECIENCIA_ORIGEN_NOMBRE || 'Telegram';
const ESTADO_RESERVADO_NOMBRE = process.env.N8N_ECIENCIA_ESTADO_RESERVADO_NOMBRE || 'Reservado';

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

const optionsKeyboard = (kind, options) =>
  inlineKeyboard(options.map((option, index) => ({ text: option, callbackData: `${kind}:${index}` })));

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

const menuCaption = (today) =>
  'Ecencia Andina - Menu del dia ' +
  today +
  '\n\nToca una sopa para comenzar. Luego elegiras el plato fuerte y la guarnicion.\n\nTambien puedes responder con /cancelar para reiniciar.';

const telegramRequest = async (method, body) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('Falta TELEGRAM_BOT_TOKEN.');

  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.description || `Telegram respondio ${response.status}`);
  }
  return data;
};

const sendMessage = async (chatId, text, replyMarkup = undefined) => {
  const body = {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  };
  if (replyMarkup) body.reply_markup = replyMarkup;
  return telegramRequest('sendMessage', body);
};

const answerCallback = async (callbackId) => {
  if (!callbackId) return;
  try {
    await telegramRequest('answerCallbackQuery', { callback_query_id: callbackId });
  } catch (error) {
    console.warn('No se pudo responder callback Telegram:', error.message);
  }
};

const readUpdate = (update) => {
  if (update.callback_query) {
    return {
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
    .upsert({ key, value: { ...(value || {}), updatedAt: new Date().toISOString() } }, { onConflict: 'key' });
  if (error) throw error;
};

const deleteState = async (key) => {
  const { error } = await getAdminClient().from('telegram_bot_state').delete().eq('key', key);
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

const phoneCandidates = (phone) => {
  const normalized = normalizePhone(phone);
  const out = new Set([normalized]);
  if (normalized.startsWith('593')) out.add(`0${normalized.slice(3)}`);
  return [...out].filter(Boolean);
};

const getClients = async () => {
  const { data, error } = await getAdminClient()
    .from('clientes')
    .select(
      'id_cliente,cedula,nombre,apellido,telefono,esta_activo,clientes_convenios(id_convenio,convenios(id_convenio,nombre_empresa,esta_activo,fecha_caducidad))',
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
      'id_cliente,cedula,nombre,apellido,telefono,esta_activo,clientes_convenios(id_convenio,convenios(id_convenio,nombre_empresa,esta_activo,fecha_caducidad))',
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

const saveAcceptedSubscription = async (chatId, client, phone, contactVerified) => {
  const phoneNormalized = normalizePhone(phone);
  const [byChat, byPhone] = await Promise.all([getSubscriptionByChat(chatId), getSubscriptionByPhone(phoneNormalized)]);

  if (byChat?.consent_status === 'rejected' || byPhone?.consent_status === 'rejected') {
    return { blocked: true, reason: 'rejected' };
  }
  if (byPhone?.chat_id && String(byPhone.chat_id) !== String(chatId) && !contactVerified) {
    return { blocked: true, reason: 'chat_taken' };
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
      };
    }
  }
  return { id_convenio: null, nombre_empresa: 'Cliente directo' };
};

const getLookupId = async (table, idField, nameField, value) => {
  const { data, error } = await getAdminClient().from(table).select(`${idField},${nameField}`).ilike(nameField, value).limit(1);
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
  if (!state?.menu?.sopas?.length || !state?.menu?.segundos?.length || !state?.menu?.guarniciones?.length) return null;
  return state;
};

const startSessionForClient = async (chatId, client) => {
  const activeMenu = await getActiveMenu();
  if (!activeMenu) return null;

  const today = todayInTimezone();
  const session = {
    step: 'sopa',
    date: today,
    menuDate: activeMenu.date || today,
    menu: activeMenu.menu,
    quantity: 1,
    cliente: {
      id_cliente: client.id_cliente,
      nombre: client.nombre,
      apellido: client.apellido,
      telefono: client.telefono,
    },
    convenio: activeConvenio(client, today),
    product: await getProduct(),
    estadoReservadoId: await getLookupId('estados_orden', 'id_estado', 'nombre_estado', ESTADO_RESERVADO_NOMBRE),
    origenTelegramId: await getLookupId('origenes_pedido', 'id_origen', 'nombre_origen', ORIGEN_NOMBRE),
    createdAt: new Date().toISOString(),
  };
  await setState(stateKey(chatId), session);
  return session;
};

const findTodayOrder = async (clientId, today) => {
  const { data, error } = await getAdminClient()
    .from('ordenes')
    .select('id_orden,created_at')
    .eq('id_cliente', clientId)
    .eq('canal_origen', 'Telegram')
    .gte('created_at', `${today}T00:00:00Z`)
    .lt('created_at', `${tomorrowFromDate(today)}T00:00:00Z`)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
};

const insertOrder = async (session, chatId) => {
  const today = todayInTimezone();
  const existing = await findTodayOrder(session.cliente.id_cliente, today);
  if (existing?.id_orden) return { id_orden: existing.id_orden, duplicate: true };

  const adminClient = getAdminClient();
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

  const { error: detailError } = await adminClient.from('detalle_orden').insert({
    id_orden: order.id_orden,
    id_producto: session.product.id_producto,
    cantidad: Number(session.quantity || 1),
    precio_aplicado: Number(session.product.precio_unitario || 0),
    opciones: {
      sopa: session.sopa,
      segundo: session.segundo,
      guarnicion: session.guarnicion,
      cantidad: Number(session.quantity || 1),
      menuDate: session.menuDate || session.date,
      canal: 'Telegram',
    },
  });
  if (detailError) throw detailError;

  return order;
};

const optionFromCallback = (text, kind, options) => {
  const [receivedKind, rawIndex] = String(text || '').split(':');
  const index = Number(rawIndex);
  if (receivedKind !== kind || !Number.isInteger(index) || index < 0 || index >= options.length) return '';
  return options[index];
};

const orderConfirmation = (session, order) =>
  (order.duplicate ? 'Ya tenias una reserva registrada para hoy.\n\n' : 'Tu almuerzo quedo reservado.\n\n') +
  `Cantidad: ${Number(session.quantity || 1)}\n` +
  `Sopa: ${session.sopa}\n` +
  `Plato fuerte: ${session.segundo}\n` +
  `Guarnicion: ${session.guarnicion}\n` +
  'Estado: Reservado\n' +
  `Orden: ${order.id_orden}`;

const promptConsent = async (chatId) => {
  await upsertSubscriptionByChat(chatId, {
    consent_status: 'pending',
    is_active: true,
    consent_notice_version: CONSENT_NOTICE_VERSION,
    consent_notice_text: privacyText(),
  });
  await sendMessage(chatId, privacyText(), consentKeyboard());
};

const promptMenu = async (chatId, client, prefix = '') => {
  const session = await startSessionForClient(chatId, client);
  if (!session) {
    await sendMessage(chatId, `${prefix}Tu Telegram quedo vinculado. Aun no hay un menu activo; recibiras el siguiente envio disponible.`);
    return;
  }
  await sendMessage(chatId, `${prefix}${menuCaption(session.date)}`, optionsKeyboard('sopa', session.menu.sopas));
};

const handleAcceptedSession = async (chatId, text, isCallback) => {
  let session = await getState(stateKey(chatId));
  if (!session) {
    await sendMessage(chatId, 'No tengo un menu activo para este chat. Envia /menu cuando el menu este disponible.');
    return;
  }

  const today = todayInTimezone();
  if (session.date !== today) {
    await deleteState(stateKey(chatId));
    await sendMessage(chatId, 'El menu activo ya vencio. Envia /menu para cargar el menu de hoy.');
    return;
  }

  if (session.step === 'sopa') {
    const sopa = isCallback ? optionFromCallback(text, 'sopa', session.menu.sopas) : '';
    if (!sopa) {
      await sendMessage(chatId, 'Usa los botones para escoger tu sopa.', optionsKeyboard('sopa', session.menu.sopas));
      return;
    }
    session = { ...session, sopa, step: 'segundo' };
    await setState(stateKey(chatId), session);
    await sendMessage(chatId, `Sopa: ${sopa}\nAhora elige tu plato fuerte.`, optionsKeyboard('segundo', session.menu.segundos));
    return;
  }

  if (session.step === 'segundo') {
    const segundo = isCallback ? optionFromCallback(text, 'segundo', session.menu.segundos) : '';
    if (!segundo) {
      await sendMessage(chatId, 'Usa los botones para escoger tu plato fuerte.', optionsKeyboard('segundo', session.menu.segundos));
      return;
    }
    session = { ...session, segundo, step: 'guarnicion' };
    await setState(stateKey(chatId), session);
    await sendMessage(chatId, `Plato fuerte: ${segundo}\nAhora elige tu guarnicion.`, optionsKeyboard('guarnicion', session.menu.guarniciones));
    return;
  }

  if (session.step === 'guarnicion') {
    const guarnicion = isCallback ? optionFromCallback(text, 'guarnicion', session.menu.guarniciones) : '';
    if (!guarnicion) {
      await sendMessage(chatId, 'Usa los botones para escoger tu guarnicion.', optionsKeyboard('guarnicion', session.menu.guarniciones));
      return;
    }
    session = { ...session, guarnicion };
    const order = await insertOrder(session, chatId);
    await deleteState(stateKey(chatId));
    await sendMessage(chatId, orderConfirmation(session, order));
  }
};

const handleTelegramUpdate = async (update) => {
  const parsed = readUpdate(update);
  const { chatId, text, callbackId, isCallback, contactPhone, contactVerified } = parsed;
  if (!chatId) return;
  if (callbackId) await answerCallback(callbackId);

  const command = normalizeText(text);
  const subscription = await getSubscriptionByChat(chatId);

  if (subscription?.consent_status === 'rejected') return;

  if (['/cancelar', 'cancelar', '/reset', 'reset'].includes(command)) {
    await deleteState(stateKey(chatId));
    if (subscription?.consent_status === 'accepted') await sendMessage(chatId, 'Listo, cancele la seleccion actual. Envia /menu para empezar otra vez.');
    return;
  }

  if (command === '/start') {
    if (subscription?.consent_status === 'accepted' && subscription.is_active !== false) {
      const client = await findClientForSubscription(subscription);
      if (!client) {
        await sendMessage(chatId, 'Tu suscripcion esta aceptada, pero el cliente no esta activo. Contacta a un administrador.');
        return;
      }
      await promptMenu(chatId, client);
      return;
    }
    await promptConsent(chatId);
    return;
  }

  if (text === 'consent:reject') {
    await deleteState(stateKey(chatId));
    await deleteState(consentKey(chatId));
    await upsertSubscriptionByChat(chatId, {
      consent_status: 'rejected',
      is_active: false,
      consent_notice_version: CONSENT_NOTICE_VERSION,
      consent_notice_text: privacyText(),
      rejected_at: new Date().toISOString(),
    });
    await sendMessage(chatId, 'Entendido. No registraremos tu telefono ni te enviaremos menus o recordatorios por Telegram.');
    return;
  }

  if (text === 'consent:accept') {
    await upsertSubscriptionByChat(chatId, {
      consent_status: 'pending',
      is_active: true,
      consent_notice_version: CONSENT_NOTICE_VERSION,
      consent_notice_text: privacyText(),
      rejected_at: null,
    });
    await setState(consentKey(chatId), { status: 'accepted_pending_phone' });
    await sendMessage(chatId, 'Gracias. Ahora comparte tu telefono de Telegram para validarlo con tu registro de cliente.', contactKeyboard());
    return;
  }

  if (contactPhone) {
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

    const saved = await saveAcceptedSubscription(chatId, client, contactPhone, contactVerified);
    if (saved.blocked && saved.reason === 'rejected') return;
    if (saved.blocked && saved.reason === 'chat_taken') {
      await sendMessage(chatId, 'Ese telefono ya esta vinculado a otro chat. Pide a un administrador que lo revise.');
      return;
    }

    await deleteState(consentKey(chatId));
    await promptMenu(chatId, client, `Listo ${client.nombre || ''}, tu Telegram quedo vinculado.\n\n`);
    return;
  }

  if (command === '/menu') {
    if (subscription?.consent_status !== 'accepted' || subscription.is_active === false) return;
    const client = await findClientForSubscription(subscription);
    if (!client) {
      await sendMessage(chatId, 'Tu suscripcion esta aceptada, pero el cliente no esta activo. Contacta a un administrador.');
      return;
    }
    await promptMenu(chatId, client);
    return;
  }

  if (subscription?.consent_status !== 'accepted' || subscription.is_active === false) return;
  if (isCallback) await handleAcceptedSession(chatId, text, isCallback);
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
