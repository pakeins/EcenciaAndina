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

const tomorrowFromDate = (date) => {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
};

const inlineKeyboard = (rows) => ({ inline_keyboard: rows });

const optionsKeyboard = (kind, options) =>
  inlineKeyboard(
    options.map((option, index) => [
      { text: String(option), callback_data: `${kind}:${index}` },
    ]),
  );

const consentKeyboard = () =>
  inlineKeyboard([
    [{ text: 'Acepto', callback_data: 'consent:accept' }],
    [{ text: 'No acepto', callback_data: 'consent:reject' }],
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

const confirmationKeyboard = () =>
  inlineKeyboard([
    [{ text: 'Confirmar reserva', callback_data: 'confirm:yes' }],
    [{ text: 'Cambiar seleccion', callback_data: 'confirm:edit' }],
    [{ text: 'Cancelar', callback_data: 'confirm:cancel' }],
  ]);

const menuCaption = (today) =>
  `Eciencia Andina - Menu del dia ${today}\n\n` +
  'Realiza toda la reserva con los botones. Primero elige una sopa.';

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
      'id_cliente,cedula,nombre,apellido,telefono,esta_activo,clientes_convenios(id_convenio,convenios(id_convenio,nombre_empresa,esta_activo,fecha_caducidad))',
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
    promptMessageIds: [sent?.message_id].filter(Boolean),
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
  return { id_convenio: null, nombre_empresa: 'Cliente frecuente' };
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
    quantity: null,
    cliente: {
      id_cliente: client.id_cliente,
      nombre: client.nombre,
      apellido: client.apellido,
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

const insertOrder = async (session) => {
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
      observaciones: `Reserva via Telegram ${today}. Convenio: ${session.convenio.nombre_empresa}.`,
    })
    .select()
    .single();
  if (orderError) throw orderError;

  const { error: detailError } = await adminClient.from('detalle_orden').insert({
    id_orden: order.id_orden,
    id_producto: session.product.id_producto,
    cantidad: Number(session.quantity),
    precio_aplicado: Number(session.product.precio_unitario || 0),
    opciones: {
      sopa: session.sopa,
      segundo: session.segundo,
      guarnicion: session.guarnicion,
      cantidad: Number(session.quantity),
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
  const [receivedKind, rawIndex] = String(text || '').split(':');
  const index = Number(rawIndex);
  if (receivedKind !== kind || !Number.isInteger(index) || index < 0 || index >= options.length) return '';
  return options[index];
};

const orderSummary = (session) =>
  `Cantidad: ${Number(session.quantity)}\n` +
  `Sopa: ${session.sopa}\n` +
  `Plato fuerte: ${session.segundo}\n` +
  `Guarnicion: ${session.guarnicion}`;

const orderConfirmation = (session, order) =>
  (order.duplicate ? 'Ya tenias una reserva registrada para hoy.\n\n' : 'Tu almuerzo quedo reservado.\n\n') +
  `${orderSummary(session)}\n` +
  'Estado: Reservado\n' +
  `Orden: ${order.id_orden}`;

const promptMenu = async (chatId, client) => {
  const session = await startSessionForClient(chatId, client);
  if (!session) {
    await sendMessage(chatId, 'Aun no hay un menu activo. Recibiras el siguiente envio disponible.');
    return;
  }
  await sendMessage(chatId, menuCaption(session.date), optionsKeyboard('sopa', session.menu.sopas));
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
    await trace({
      ...tracePatch(session, session.step),
      outcome: 'failed',
      error_message: 'La sesion del menu esta vencida',
    });
    await sendMessage(chatId, 'El menu activo ya vencio. Usa /menu para cargar el menu de hoy.');
    return;
  }

  if (!isCallback) {
    await deleteMessage(chatId, messageId);
    await trace({
      ...tracePatch(session, session.step, { inputType: parsed.contactPhone ? 'contact' : 'text' }),
      outcome: 'rejected',
      error_message: 'Entrada libre bloqueada; se requieren botones',
    });
    if (!session.invalidInputNoticeSent) {
      await setState(stateKey(chatId), { ...session, invalidInputNoticeSent: true });
      await sendMessage(chatId, 'Por seguridad, esta reserva solo acepta botones. Continua con la opcion visible.');
    }
    return;
  }

  await removeInlineKeyboard(chatId, messageId);

  if (session.step === 'sopa') {
    const sopa = optionFromCallback(text, 'sopa', session.menu.sopas);
    if (!sopa) return sendMessage(chatId, 'Elige una sopa con los botones.', optionsKeyboard('sopa', session.menu.sopas));
    session = { ...session, sopa, step: 'segundo' };
    await setState(stateKey(chatId), session);
    await trace({ ...tracePatch(session, 'segundo'), outcome: 'pending', error_message: null });
    await sendMessage(chatId, `Sopa: ${sopa}\nAhora elige el plato fuerte.`, optionsKeyboard('segundo', session.menu.segundos));
    return;
  }

  if (session.step === 'segundo') {
    const segundo = optionFromCallback(text, 'segundo', session.menu.segundos);
    if (!segundo) return sendMessage(chatId, 'Elige el plato fuerte con los botones.', optionsKeyboard('segundo', session.menu.segundos));
    session = { ...session, segundo, step: 'guarnicion' };
    await setState(stateKey(chatId), session);
    await trace({ ...tracePatch(session, 'guarnicion'), outcome: 'pending', error_message: null });
    await sendMessage(chatId, `Plato fuerte: ${segundo}\nAhora elige la guarnicion.`, optionsKeyboard('guarnicion', session.menu.guarniciones));
    return;
  }

  if (session.step === 'guarnicion') {
    const guarnicion = optionFromCallback(text, 'guarnicion', session.menu.guarniciones);
    if (!guarnicion) return sendMessage(chatId, 'Elige la guarnicion con los botones.', optionsKeyboard('guarnicion', session.menu.guarniciones));
    session = { ...session, guarnicion, step: 'quantity' };
    await setState(stateKey(chatId), session);
    await trace({ ...tracePatch(session, 'quantity'), outcome: 'pending', error_message: null });
    await sendMessage(chatId, `Guarnicion: ${guarnicion}\nSelecciona la cantidad.`, quantityKeyboard());
    return;
  }

  if (session.step === 'quantity') {
    const [kind, rawQuantity] = String(text || '').split(':');
    const quantity = Number(rawQuantity);
    if (kind !== 'quantity' || !QUANTITIES.includes(quantity)) {
      return sendMessage(chatId, 'Selecciona una cantidad con los botones.', quantityKeyboard());
    }
    session = { ...session, quantity, step: 'confirm' };
    await setState(stateKey(chatId), session);
    await trace({ ...tracePatch(session, 'confirm'), outcome: 'pending', error_message: null });
    await sendMessage(chatId, `Revisa tu reserva:\n\n${orderSummary(session)}`, confirmationKeyboard());
    return;
  }

  if (session.step === 'confirm') {
    if (text === 'confirm:cancel') {
      await deleteState(stateKey(chatId));
      await trace({ ...tracePatch(session, 'cancelled'), outcome: 'rejected', error_message: 'Cancelado por el cliente' });
      await sendMessage(chatId, 'La reserva fue cancelada. Usa /menu para comenzar de nuevo.');
      return;
    }
    if (text === 'confirm:edit') {
      session = { ...session, step: 'sopa', sopa: null, segundo: null, guarnicion: null, quantity: null };
      await setState(stateKey(chatId), session);
      await trace({ ...tracePatch(session, 'sopa'), outcome: 'pending', error_message: null });
      await sendMessage(chatId, 'Selecciona nuevamente la sopa.', optionsKeyboard('sopa', session.menu.sopas));
      return;
    }
    if (text !== 'confirm:yes') {
      await sendMessage(chatId, `Revisa tu reserva:\n\n${orderSummary(session)}`, confirmationKeyboard());
      return;
    }

    let order;
    try {
      order = await insertOrder(session);
    } catch (error) {
      await trace({
        ...tracePatch(session, 'registration_error'),
        outcome: 'failed',
        error_message: error.message || 'No se pudo registrar el pedido',
      });
      await sendMessage(chatId, 'No pude registrar la reserva. Tus selecciones siguen disponibles.', confirmationKeyboard());
      return;
    }

    await deleteState(stateKey(chatId));
    await trace({
      ...tracePatch(session, 'completed'),
      id_orden: order.id_orden,
      outcome: order.duplicate ? 'rejected' : 'success',
      error_message: order.duplicate ? 'Reserva duplicada para el dia' : null,
    });
    await sendMessage(chatId, orderConfirmation(session, order));
  }
};

const invitationFailureText = (reason) => {
  if (reason === 'claimed') return 'Este enlace ya fue abierto desde otro chat. Solicita una nueva invitacion al administrador.';
  if (reason === 'inactive_client') return 'El cliente de esta invitacion no esta activo.';
  return 'La invitacion no es valida, ya fue usada o expiro. Solicita una nueva al administrador.';
};

const acceptConsent = async (parsed, subscription, consentState) => {
  if (!consentState || consentState.status !== 'awaiting_decision') return;
  await removeInlineKeyboard(parsed.chatId, parsed.messageId);
  const sent = await sendMessage(
    parsed.chatId,
    'Ahora comparte tu propio telefono con el boton. No escribas el numero manualmente.',
    contactKeyboard(),
  );
  await setState(consentKey(parsed.chatId), {
    ...consentState,
    status: 'accepted_pending_phone',
    promptMessageIds: [...(consentState.promptMessageIds || []), sent?.message_id].filter(Boolean),
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
    'Registramos que no aceptas. Esta suscripcion queda bloqueada hasta que un administrador la reactive.',
    removeKeyboard(),
  );
};

const validateAndSaveContact = async (parsed, subscription, consentState) => {
  if (!subscription || consentState?.status !== 'accepted_pending_phone') return false;
  await deleteMessage(parsed.chatId, parsed.messageId);
  if (!parsed.contactVerified) {
    await sendMessage(parsed.chatId, 'Debes compartir tu propio contacto usando el boton de Telegram.', contactKeyboard());
    return true;
  }

  const client = await getClientById(consentState.idCliente);
  if (!client?.esta_activo) {
    await sendMessage(parsed.chatId, 'El cliente invitado no esta activo. Contacta al administrador.', removeKeyboard());
    return true;
  }
  const contactPhone = normalizePhone(parsed.contactPhone);
  const clientPhone = normalizePhone(client.telefono);
  if (!contactPhone || !clientPhone || contactPhone !== clientPhone) {
    await sendMessage(
      parsed.chatId,
      'El telefono compartido no coincide con el cliente invitado. Pide al administrador que revise el registro.',
      contactKeyboard(),
    );
    return true;
  }

  const phoneOwner = await getSubscriptionByPhone(contactPhone);
  if (phoneOwner && phoneOwner.id !== subscription.id) {
    await sendMessage(parsed.chatId, 'Ese telefono ya esta vinculado a otra suscripcion.', removeKeyboard());
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
    `Consentimiento registrado para ${client.nombre} ${client.apellido}. Usa /menu cuando quieras reservar.`,
    removeKeyboard(),
  );
  return true;
};

const handlePrivacyCommand = async (command, parsed, subscription) => {
  if (command === '/privacidad') {
    const settings = getPrivacySettings();
    await sendMessage(
      parsed.chatId,
      `${privacyText()}\n\nComandos: /misdatos, /eliminarmisdatos, /revocar y /ayuda.\n${settings.policyUrl}`,
    );
    return true;
  }

  if (command === '/ayuda') {
    await sendMessage(
      parsed.chatId,
      'Usa /menu para reservar mediante botones.\n' +
      'Privacidad: /privacidad, /misdatos, /eliminarmisdatos y /revocar.\n' +
      `Contacto: ${getPrivacySettings().contact}`,
    );
    return true;
  }

  if (command === '/misdatos') {
    if (!subscription) {
      await sendMessage(parsed.chatId, 'Este chat no tiene una suscripcion Telegram vinculada.');
      return true;
    }
    const client = subscription.id_cliente ? await getClientById(subscription.id_cliente) : null;
    const { count, error } = await getAdminClient()
      .from('ordenes')
      .select('id_orden', { count: 'exact', head: true })
      .eq('id_cliente', subscription.id_cliente);
    if (error) throw error;
    const maskedPhone = subscription.phone_normalized
      ? `***${String(subscription.phone_normalized).slice(-4)}`
      : 'No almacenado';
    await sendMessage(
      parsed.chatId,
      'Datos Telegram vinculados:\n' +
      `Cliente: ${client ? `${client.nombre} ${client.apellido}` : 'No disponible'}\n` +
      `Telefono: ${maskedPhone}\n` +
      `Estado: ${subscription.consent_status}\n` +
      `Version aceptada: ${subscription.consent_notice_version || 'Ninguna'}\n` +
      `Pedidos asociados: ${count || 0}`,
    );
    return true;
  }

  if (command === '/revocar') {
    if (!subscription) {
      await sendMessage(parsed.chatId, 'No existe una suscripcion vinculada para revocar.');
      return true;
    }
    await recordConsentEvent({
      idCliente: subscription.id_cliente,
      subscriptionId: subscription.id,
      eventType: 'revoked',
      method: 'telegram_command',
      telegramUserId: parsed.telegramUserId,
      chatId: parsed.chatId,
      phone: subscription.phone_normalized,
      includeNotice: false,
    });
    await getAdminClient()
      .from('telegram_subscriptions')
      .update({
        consent_status: 'revoked',
        is_active: false,
        revoked_at: new Date().toISOString(),
      })
      .eq('id', subscription.id);
    await deleteChatStates(parsed.chatId);
    await sendMessage(
      parsed.chatId,
      'El consentimiento fue revocado. No recibiras menus hasta que un administrador reactive la suscripcion.',
      removeKeyboard(),
    );
    return true;
  }

  if (command === '/eliminarmisdatos') {
    if (!subscription) {
      await sendMessage(parsed.chatId, 'Este chat no tiene datos Telegram vinculados.');
      return true;
    }
    const { count, error: countError } = await getAdminClient()
      .from('ordenes')
      .select('id_orden', { count: 'exact', head: true })
      .eq('id_cliente', subscription.id_cliente);
    if (countError) throw countError;

    const { data: privacyRequest, error: requestError } = await getAdminClient()
      .from('telegram_privacy_requests')
      .insert({
        id_cliente: subscription.id_cliente,
        subscription_id: subscription.id,
        request_type: 'deletion',
        status: 'pending',
        source: 'telegram',
        retained_order_count: count || 0,
        details: { order_review_required: Number(count || 0) > 0 },
      })
      .select('id')
      .single();
    if (requestError) throw requestError;

    await recordConsentEvent({
      idCliente: subscription.id_cliente,
      subscriptionId: subscription.id,
      eventType: 'privacy_deletion_requested',
      method: 'telegram_command',
      telegramUserId: parsed.telegramUserId,
      chatId: parsed.chatId,
      phone: subscription.phone_normalized,
      evidence: { request_id: privacyRequest.id, retained_order_count: count || 0 },
      includeNotice: false,
    });

    await deleteChatStates(parsed.chatId);
    await getAdminClient().from('telegram_order_traces').delete().eq('subscription_id', subscription.id);
    await getAdminClient().from('telegram_order_traces').delete().eq('chat_id', String(parsed.chatId));
    const { error: updateError } = await getAdminClient()
      .from('telegram_subscriptions')
      .update({
        chat_id: null,
        phone_normalized: null,
        telegram_user_id: null,
        telegram_username: null,
        consent_status: 'revoked',
        is_active: false,
        revoked_at: new Date().toISOString(),
        deletion_requested_at: new Date().toISOString(),
      })
      .eq('id', subscription.id);
    if (updateError) throw updateError;

    await sendMessage(
      parsed.chatId,
      'Eliminamos los identificadores Telegram, sesiones y trazas personales. ' +
      `La solicitud ${privacyRequest.id} queda pendiente de revision administrativa para los pedidos que deban conservarse.`,
      removeKeyboard(),
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
  if (!client?.id_cliente) {
    await sendMessage(parsed.chatId, invitationFailureText('invalid'));
    return;
  }

  await deleteMessage(parsed.chatId, parsed.messageId);
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
      await sendMessage(parsed.chatId, 'Tu suscripcion esta activa. Usa /menu para reservar o /ayuda para ver comandos.');
      return;
    }
    if (subscription?.consent_status === 'pending' && subscription.id_cliente) {
      await beginConsent({
        idCliente: subscription.id_cliente,
        chatId: parsed.chatId,
        telegramUserId: parsed.telegramUserId,
        telegramUsername: parsed.telegramUsername,
        cleanupMessageIds: [parsed.messageId],
      });
      return;
    }
    if (['rejected', 'revoked'].includes(subscription?.consent_status)) {
      await sendMessage(parsed.chatId, 'La suscripcion esta bloqueada. Un administrador debe reactivarla desde Clientes.');
      return;
    }
    await sendMessage(parsed.chatId, 'Abre el enlace privado entregado por el administrador para activar Telegram.');
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

  if (['rejected', 'revoked'].includes(subscription?.consent_status)) return;
  if (subscription?.consent_status === 'pending') {
    if (!parsed.isCallback) await deleteMessage(parsed.chatId, parsed.messageId);
    await sendMessage(parsed.chatId, 'Completa el consentimiento usando los botones visibles.');
    return;
  }

  if (command === '/cancelar' || parsed.text === 'confirm:cancel') {
    await deleteState(stateKey(parsed.chatId));
    if (hasCurrentConsent(subscription)) {
      await sendMessage(parsed.chatId, 'La seleccion fue cancelada. Usa /menu para comenzar de nuevo.');
    }
    return;
  }

  if (command === '/menu') {
    if (!hasCurrentConsent(subscription)) return;
    const client = await getClientById(subscription.id_cliente);
    if (!client?.esta_activo) {
      await sendMessage(parsed.chatId, 'El cliente vinculado no esta activo. Contacta al administrador.');
      return;
    }
    await promptMenu(parsed.chatId, client);
    return;
  }

  if (!hasCurrentConsent(subscription)) return;

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
    res.status(200).json({ ok: false });
  }
});

module.exports = router;
module.exports.handleTelegramUpdate = handleTelegramUpdate;
module.exports._private = {
  beginConsent,
  handleAcceptedSession,
  invitationFailureText,
  orderConfirmation,
  parseStartToken,
  readUpdate,
};
