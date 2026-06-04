function cfg(name, fallback = '') {
  const vars = typeof $vars === 'undefined' ? {} : $vars;
  const env = typeof process === 'undefined' ? {} : process.env;
  return env[name] || vars[name] || fallback;
}

const SUPABASE_URL = cfg('SUPABASE_URL').replace(/\/$/, '');
const SUPABASE_KEY = cfg('SUPABASE_SERVICE_ROLE_KEY') || cfg('SUPABASE_KEY');
if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en n8n.');
}

const CONFIG = {
  timezone: cfg('N8N_ECIENCIA_TIMEZONE', 'America/Bogota'),
  menuImageUrl: cfg(
    'N8N_ECIENCIA_MENU_IMAGE_URL',
    'https://lkffhdcavohaxdihvwlb.supabase.co/storage/v1/object/public/eciencia-menu-assets/telegram/eciencia-menu-demo.png'
  ),
  defaultProductName: cfg('N8N_ECIENCIA_PRODUCTO_ALMUERZO_NOMBRE', 'Almuerzo Telegram'),
  origenName: cfg('N8N_ECIENCIA_ORIGEN_NOMBRE', 'Telegram'),
  estadoReservadoName: cfg('N8N_ECIENCIA_ESTADO_RESERVADO_NOMBRE', 'Reservado'),
};

const CONSENT_NOTICE_VERSION = 'EC-LOPDP-2026-05';

function todayInTimezone(timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function tomorrowFromDate(date) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/[^\d]/g, '').replace(/^00/, '');
  if (!digits) return '';
  if (digits.startsWith('0') && digits.length >= 9) return '593' + digits.slice(1);
  return digits;
}

function phoneCandidates(value) {
  const normalized = normalizePhone(value);
  const out = new Set([normalized]);
  if (normalized.startsWith('593')) out.add('0' + normalized.slice(3));
  return [...out].filter(Boolean);
}

function queryString(entries) {
  return entries
    .filter((entry) => entry[1] !== undefined && entry[1] !== null)
    .map(([key, value]) => encodeURIComponent(key) + '=' + encodeURIComponent(String(value)))
    .join('&');
}

async function supa(path, options = {}) {
  try {
    return await helpers.httpRequest({
      method: options.method || 'GET',
      url: SUPABASE_URL + '/rest/v1' + path,
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      body: options.body,
      json: true,
    });
  } catch (error) {
    throw new Error((options.method || 'GET') + ' ' + path + ' fallo: ' + (error.message || error));
  }
}

async function getState(key) {
  const rows = await supa('/telegram_bot_state?' + queryString([
    ['select', 'value'],
    ['key', 'eq.' + key],
    ['limit', '1'],
  ]));
  return rows[0]?.value || null;
}

async function setState(key, value) {
  await supa('/telegram_bot_state?on_conflict=key', {
    method: 'POST',
    body: {
      key,
      value: {
        ...(value || {}),
        updatedAt: new Date().toISOString(),
      },
    },
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
  });
}

async function deleteState(key) {
  await supa('/telegram_bot_state?' + queryString([['key', 'eq.' + key]]), {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });
}

async function getLatestMenu(today) {
  return getState('latest-menu:' + today);
}

async function getActiveMenu(today) {
  const activeMenu = await getState('latest-menu:active');
  if (activeMenu?.menu) {
    return {
      date: activeMenu.date || today,
      menu: compactMenu(activeMenu.menu),
      photoUrl: activeMenu.photoUrl || '',
    };
  }

  const todayMenu = await getLatestMenu(today);
  if (todayMenu?.menu) {
    return {
      date: todayMenu.date || today,
      menu: compactMenu(todayMenu.menu),
      photoUrl: todayMenu.photoUrl || '',
    };
  }

  return {
    date: today,
    menu: await getMenuFromSupabase(),
    photoUrl: '',
  };
}

async function getSession(chatId) {
  return getState('session:' + chatId);
}

async function saveSession(chatId, session) {
  await setState('session:' + chatId, session);
}

async function clearSession(chatId) {
  await deleteState('session:' + chatId);
}

async function setConsentStep(chatId, status) {
  await setState('consent:' + chatId, { status });
}

async function getConsentStep(chatId) {
  return getState('consent:' + chatId);
}

async function clearConsentStep(chatId) {
  await deleteState('consent:' + chatId);
}

function cleanOptions(options) {
  return Array.isArray(options)
    ? options.map((option) => String(option || '').trim()).filter(Boolean)
    : [];
}

function compactMenu(menu) {
  return {
    sopas: cleanOptions(menu.sopas).slice(0, 8),
    segundos: cleanOptions(menu.segundos).slice(0, 8),
    guarniciones: cleanOptions(menu.guarniciones).slice(0, 8),
  };
}

function buttonRows(buttons) {
  return {
    inline_keyboard: buttons.map((button) => [
      {
        text: button.text,
        callback_data: button.callbackData,
      },
    ]),
  };
}

function optionsKeyboard(kind, options) {
  return buttonRows(
    options.map((option, index) => ({
      text: option,
      callbackData: kind + ':' + index,
    }))
  );
}

function consentKeyboard() {
  return buttonRows([
    { text: 'Acepto', callbackData: 'consent:accept' },
    { text: 'No acepto', callbackData: 'consent:reject' },
  ]);
}

function contactKeyboard() {
  return {
    keyboard: [[{ text: 'Compartir telefono', request_contact: true }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  };
}

function privacyText() {
  return (
    'Aviso de privacidad y consentimiento - Ecencia Andina\n\n' +
    'Responsable: Ecencia Andina. Usaremos tu numero telefonico, chatId de Telegram, nombre registrado como cliente y tus selecciones de menu.\n\n' +
    'Finalidades: vincular tu Telegram con tu ficha de cliente, enviarte el menu, registrar reservas, confirmar pedidos y atender novedades del pedido.\n\n' +
    'Base legal: tu consentimiento libre, especifico, informado e inequivoco conforme a la Ley Organica de Proteccion de Datos Personales de Ecuador.\n\n' +
    'Conservacion: mientras tu suscripcion este activa y durante los plazos necesarios para soporte, auditoria interna y obligaciones aplicables.\n\n' +
    'Derechos: puedes solicitar acceso, rectificacion, actualizacion, eliminacion, oposicion, limitacion o revocar este consentimiento contactando al administrador de Ecencia Andina.\n\n' +
    'Si no aceptas, no vincularemos tu telefono ni recibiras menus o reservas por este bot.'
  );
}

function menuCaption(today) {
  return trimTelegramCaption(
    'Ecencia Andina - Menu del dia ' + today + '\n\n' +
      'Toca una sopa para comenzar. Luego elegiras el plato fuerte y la guarnicion.\n\n' +
      'Tambien puedes responder con texto: sopa 1, segundo 1, guarnicion 1.'
  );
}

function trimTelegramCaption(text) {
  const value = String(text || '');
  return value.length <= 1000 ? value : value.slice(0, 997) + '...';
}

function askSegundo(session) {
  return 'Perfecto. Sopa: ' + session.sopa + '\n\nAhora toca tu plato fuerte.';
}

function askGuarnicion(session) {
  return 'Listo. Plato fuerte: ' + session.segundo + '\n\nPor ultimo toca tu guarnicion.';
}

function optionFromCallback(data, kind, options) {
  const match = String(data || '').match(new RegExp('^' + kind + ':(\\d+)$'));
  if (!match) return '';
  const index = Number(match[1]);
  return Number.isInteger(index) && index >= 0 && index < options.length ? options[index] : '';
}

function optionFromText(text, label, options) {
  const normalized = normalizeText(text);
  const labelMatch = normalized.match(new RegExp(label + '\\s*[:#-]?\\s*(\\d+)', 'i'));
  if (labelMatch) {
    const index = Number(labelMatch[1]) - 1;
    if (Number.isInteger(index) && options[index]) return options[index];
  }

  return cleanOptions(options).find((option) => normalized.includes(normalizeText(option))) || '';
}

function quantityFromText(text) {
  const normalized = normalizeText(text);
  const match = normalized.match(/(?:cantidad|almuerzos?|pedidos?)\s*[:#-]?\s*(\d{1,2})/) || normalized.match(/\b(\d{1,2})\s*(?:almuerzos?|pedidos?)\b/);
  if (!match) return 1;
  const quantity = Number(match[1]);
  return Number.isInteger(quantity) && quantity > 0 && quantity <= 20 ? quantity : 1;
}

function parseTextOrder(text, menu) {
  const normalized = normalizeText(text);
  const looksLikeOrder = /(sopa|segundo|plato|guarnicion|almuerzo|pedido|\d)/.test(normalized);
  const parsed = {
    looksLikeOrder,
    quantity: quantityFromText(text),
    sopa: optionFromText(text, 'sopa', menu.sopas),
    segundo: optionFromText(text, '(?:segundo|plato)', menu.segundos),
    guarnicion: optionFromText(text, 'guarnicion', menu.guarniciones),
  };

  parsed.missing = [];
  if (!parsed.sopa) parsed.missing.push('sopa');
  if (!parsed.segundo) parsed.missing.push('plato fuerte');
  if (!parsed.guarnicion) parsed.missing.push('guarnicion');
  parsed.valid = !parsed.missing.length;
  return parsed;
}

function correctionText(parsed) {
  return (
    'No pude interpretar tu pedido completo.\n\n' +
    'Falta: ' + parsed.missing.join(', ') + '.\n' +
    'Responde con este formato: sopa 1, segundo 1, guarnicion 1.'
  );
}

let activeCallbackId = '';

function response(chatId, text, inlineKeyboard = undefined, replyMarkup = undefined) {
  const callbackId = activeCallbackId || '';
  return [
    {
      json: {
        chatId,
        text,
        callbackId,
        ...(inlineKeyboard ? { inlineKeyboard } : {}),
        ...(replyMarkup ? { replyMarkup } : {}),
      },
    },
  ];
}

async function createTrace(update) {
  try {
    const rows = await supa('/telegram_order_traces', {
      method: 'POST',
      body: {
        chat_id: update.chatId || null,
        update_id: update.updateId || null,
        phone_normalized: update.contactPhone ? normalizePhone(update.contactPhone) : null,
        original_message: {
          text: update.text || '',
          isCallback: update.isCallback,
          hasContact: Boolean(update.contactPhone),
          receivedAt: new Date().toISOString(),
        },
        outcome: 'received',
      },
      headers: { Prefer: 'return=representation' },
    });
    const trace = Array.isArray(rows) ? rows[0] : rows;
    return trace?.id || '';
  } catch (error) {
    return '';
  }
}

async function finishTrace(traceId, patch) {
  if (!traceId) return;
  try {
    await supa('/telegram_order_traces?' + queryString([['id', 'eq.' + traceId]]), {
      method: 'PATCH',
      body: patch,
      headers: { Prefer: 'return=minimal' },
    });
  } catch (error) {
    // La trazabilidad no debe bloquear la respuesta al cliente.
  }
}

async function promptConsent(chatId) {
  return response(chatId, privacyText(), consentKeyboard());
}

function rejectedResponse(chatId) {
  return response(
    chatId,
    'No enviaremos menus a este chat porque el consentimiento esta rechazado. Para cambiarlo, pide a un administrador que lo vuelva a poner en pending en la base de datos.'
  );
}

function readUpdate(input) {
  const update = input.json || input;
  if (update.callback_query) {
    return {
      updateId: Number(update.update_id || 0) || null,
      chatId: String(update.callback_query.message?.chat?.id || update.callback_query.from?.id || ''),
      text: String(update.callback_query.data || ''),
      isCallback: true,
      callbackId: String(update.callback_query.id || ''),
      contactPhone: '',
      contactVerified: false,
    };
  }

  const message = update.message || update.edited_message || update.body?.message || update;
  const contact = message.contact || null;
  const fromId = String(message.from?.id || '');
  const chatId = String(message.chat?.id || '');
  const contactUserId = contact?.user_id ? String(contact.user_id) : '';
  const contactVerified = Boolean(contact?.phone_number) && (!contactUserId || contactUserId === fromId || contactUserId === chatId);

  return {
    updateId: Number(update.update_id || message.update_id || 0) || null,
    chatId,
    text: String(message.text || '').trim(),
    isCallback: false,
    callbackId: '',
    contactPhone: contact?.phone_number || '',
    contactVerified,
  };
}

async function getSubscriptionByChat(chatId) {
  const rows = await supa('/telegram_subscriptions?' + queryString([
    ['select', '*'],
    ['chat_id', 'eq.' + String(chatId)],
    ['limit', '1'],
  ]));
  return rows[0] || null;
}

async function getSubscriptionByPhone(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  const rows = await supa('/telegram_subscriptions?' + queryString([
    ['select', '*'],
    ['phone_normalized', 'eq.' + normalized],
    ['limit', '1'],
  ]));
  return rows[0] || null;
}

async function upsertSubscriptionByChat(chatId, patch) {
  const rows = await supa('/telegram_subscriptions?on_conflict=chat_id', {
    method: 'POST',
    body: {
      chat_id: String(chatId),
      ...patch,
    },
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function createSubscription(body) {
  const rows = await supa('/telegram_subscriptions', {
    method: 'POST',
    body,
    headers: { Prefer: 'return=representation' },
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function patchSubscriptionById(id, body) {
  const rows = await supa('/telegram_subscriptions?' + queryString([['id', 'eq.' + id]]), {
    method: 'PATCH',
    body,
    headers: { Prefer: 'return=representation' },
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function deleteSubscriptionById(id) {
  await supa('/telegram_subscriptions?' + queryString([['id', 'eq.' + id]]), {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });
}

async function saveAcceptedSubscription(chatId, client, phone, contactVerified) {
  const phoneNormalized = normalizePhone(phone || client.telefono);
  const byChat = await getSubscriptionByChat(chatId);
  const byPhone = await getSubscriptionByPhone(phoneNormalized);

  if (byChat?.consent_status === 'rejected' || byPhone?.consent_status === 'rejected') {
    return { blocked: true, reason: 'rejected' };
  }

  if (byPhone?.chat_id && String(byPhone.chat_id) !== String(chatId) && !contactVerified) {
    return { blocked: true, reason: 'chat_taken' };
  }

  if (byPhone && byChat && byPhone.id !== byChat.id) {
    await deleteSubscriptionById(byChat.id);
  }

  const body = {
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

  const target = byPhone || byChat;
  const subscription = target ? await patchSubscriptionById(target.id, body) : await createSubscription(body);
  await clearConsentStep(chatId);
  return { subscription };
}

async function getMenuFromSupabase() {
  if (cfg('N8N_ECIENCIA_MENU_JSON')) {
    const parsed = JSON.parse(cfg('N8N_ECIENCIA_MENU_JSON'));
    return compactMenu({
      sopas: (parsed.sopas || []).map(String).filter(Boolean),
      segundos: (parsed.segundos || []).map(String).filter(Boolean),
      guarniciones: (parsed.guarniciones || []).map(String).filter(Boolean),
    });
  }

  const rows = await supa('/alimentos?' + queryString([
    ['select', 'id_alimento,nombre_alimento,categorias_menu(nombre_categoria)'],
    ['order', 'id_alimento.asc'],
  ]));
  const grouped = { sopas: [], segundos: [], guarniciones: [] };

  for (const row of rows) {
    const category = normalizeText(row.categorias_menu?.nombre_categoria || '');
    const name = row.nombre_alimento;
    if (!name) continue;
    if (category.includes('sopa')) grouped.sopas.push(name);
    else if (category.includes('segundo') || category.includes('plato')) grouped.segundos.push(name);
    else if (category.includes('guarn')) grouped.guarniciones.push(name);
  }

  const menu = compactMenu(grouped);
  if (!menu.sopas.length || !menu.segundos.length || !menu.guarniciones.length) {
    throw new Error('El menu debe tener sopas, segundos y guarniciones en Supabase.');
  }
  return menu;
}

async function getProduct() {
  const rows = await supa('/productos?' + queryString([
    ['select', 'id_producto,nombre_producto,precio_unitario,esta_activo'],
    ['order', 'id_producto.asc'],
  ]));
  const active = rows.filter((row) => row.esta_activo !== false);
  const exact = active.find((row) => normalizeText(row.nombre_producto) === normalizeText(CONFIG.defaultProductName));
  const lunch = active.find((row) => normalizeText(row.nombre_producto).includes('almuerzo'));
  const product = exact || lunch || active[0];
  if (!product) throw new Error('No hay producto activo para registrar la reserva.');
  return {
    id_producto: product.id_producto,
    nombre_producto: product.nombre_producto,
    precio_unitario: Number(product.precio_unitario || 0),
  };
}

async function getLookupId(table, idField, nameField, value) {
  const rows = await supa('/' + table + '?' + queryString([
    ['select', idField + ',' + nameField],
    [nameField, 'ilike.' + value],
    ['limit', '1'],
  ]));
  if (rows[0]?.[idField]) return rows[0][idField];
  throw new Error('No encontre ' + value + ' en ' + table + '.');
}

async function getClients() {
  return supa('/clientes?' + queryString([
    [
      'select',
      'id_cliente,cedula,nombre,apellido,telefono,esta_activo,clientes_convenios(id_convenio,convenios(id_convenio,nombre_empresa,esta_activo,fecha_caducidad))',
    ],
    ['esta_activo', 'eq.true'],
  ]));
}

async function getClientById(id) {
  const rows = await supa('/clientes?' + queryString([
    [
      'select',
      'id_cliente,cedula,nombre,apellido,telefono,esta_activo,clientes_convenios(id_convenio,convenios(id_convenio,nombre_empresa,esta_activo,fecha_caducidad))',
    ],
    ['id_cliente', 'eq.' + id],
    ['esta_activo', 'eq.true'],
    ['limit', '1'],
  ]));
  return rows[0] || null;
}

async function findClientByPhone(phone) {
  const clients = await getClients();
  const candidates = phoneCandidates(phone);
  return clients.find((client) => phoneCandidates(client.telefono).some((p) => candidates.includes(p))) || null;
}

async function findClientForSubscription(subscription) {
  if (!subscription) return null;
  if (subscription.id_cliente) {
    const client = await getClientById(subscription.id_cliente);
    if (client) return client;
  }
  if (subscription.phone_normalized) return findClientByPhone(subscription.phone_normalized);
  return null;
}

function activeConvenio(client, today) {
  const links = client.clientes_convenios || [];
  for (const link of links) {
    const convenio = Array.isArray(link.convenios) ? link.convenios[0] : link.convenios;
    if (convenio?.esta_activo !== false && (!convenio?.fecha_caducidad || convenio.fecha_caducidad >= today)) {
      return {
        id_convenio: convenio.id_convenio || link.id_convenio,
        nombre_empresa: convenio.nombre_empresa || 'Convenio',
      };
    }
  }
  return { id_convenio: null, nombre_empresa: 'Cliente directo' };
}

async function startSessionForClient(chatId, client) {
  const today = todayInTimezone(CONFIG.timezone);
  const activeMenu = await getActiveMenu(today);
  const menu = activeMenu.menu;
  const product = await getProduct();
  const estadoReservadoId = await getLookupId('estados_orden', 'id_estado', 'nombre_estado', CONFIG.estadoReservadoName);
  const origenTelegramId = await getLookupId('origenes_pedido', 'id_origen', 'nombre_origen', CONFIG.origenName);
  const convenio = activeConvenio(client, today);
  const session = {
    step: 'sopa',
    date: today,
    menuDate: activeMenu.date,
    menu,
    quantity: 1,
    cliente: {
      id_cliente: client.id_cliente,
      nombre: client.nombre,
      apellido: client.apellido,
      telefono: client.telefono,
    },
    convenio,
    product,
    estadoReservadoId,
    origenTelegramId,
    createdAt: new Date().toISOString(),
  };
  await saveSession(chatId, session);
  return session;
}

async function findTodayOrder(clientId, today) {
  const tomorrow = tomorrowFromDate(today);
  const rows = await supa('/ordenes?' + queryString([
    ['select', 'id_orden,created_at'],
    ['id_cliente', 'eq.' + clientId],
    ['canal_origen', 'eq.Telegram'],
    ['created_at', 'gte.' + today + 'T00:00:00Z'],
    ['created_at', 'lt.' + tomorrow + 'T00:00:00Z'],
    ['limit', '1'],
  ]));
  return rows[0] || null;
}

async function insertOrder(session, chatId) {
  const today = todayInTimezone(CONFIG.timezone);
  const existing = await findTodayOrder(session.cliente.id_cliente, today);
  if (existing?.id_orden) {
    return { id_orden: existing.id_orden, duplicate: true };
  }

  const orderRows = await supa('/ordenes', {
    method: 'POST',
    body: {
      id_cliente: session.cliente.id_cliente,
      id_estado: session.estadoReservadoId,
      id_origen: session.origenTelegramId,
      canal_origen: 'Telegram',
      metodo_pago: session.convenio.id_convenio ? 'Convenio Empresa' : 'Pendiente',
      observaciones:
        'Reserva via Telegram ' +
        today +
        '. Convenio: ' +
        session.convenio.nombre_empresa +
        '. Chat: ' +
        chatId,
    },
    headers: { Prefer: 'return=representation' },
  });
  const order = Array.isArray(orderRows) ? orderRows[0] : orderRows;
  if (!order?.id_orden) throw new Error('Supabase no devolvio id_orden.');

  await supa('/detalle_orden', {
    method: 'POST',
    body: {
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
    },
    headers: { Prefer: 'return=minimal' },
  });

  return order;
}

let activeChatId = '';
let activeTraceId = '';

async function main() {
const update = readUpdate(items[0]);
const chatId = update.chatId;
const text = update.text;
const contactPhone = update.contactPhone;
const command = normalizeText(text);
if (!chatId) return [];
activeChatId = chatId;
activeCallbackId = update.callbackId || '';
activeTraceId = await createTrace(update);

if (['/cancelar', 'cancelar', '/reset', 'reset'].includes(command)) {
  await clearSession(chatId);
  return response(chatId, 'Listo, cancele la seleccion actual. Envia /menu para empezar otra vez.');
}

if (command === '/start') {
  const subscription = await getSubscriptionByChat(chatId);
  if (subscription?.consent_status === 'rejected') return rejectedResponse(chatId);
  if (subscription?.consent_status === 'accepted' && subscription.is_active !== false) {
    const client = await findClientForSubscription(subscription);
    if (!client) {
      return response(chatId, 'Tu suscripcion esta aceptada, pero el cliente no esta activo. Contacta a un administrador.');
    }
    const session = await startSessionForClient(chatId, client);
    return response(chatId, menuCaption(session.date), optionsKeyboard('sopa', session.menu.sopas));
  }
  return promptConsent(chatId);
}

if (text === 'consent:reject') {
  await clearSession(chatId);
  await clearConsentStep(chatId);
  await upsertSubscriptionByChat(chatId, {
    consent_status: 'rejected',
    is_active: false,
    consent_notice_version: CONSENT_NOTICE_VERSION,
    consent_notice_text: privacyText(),
    rejected_at: new Date().toISOString(),
  });
  return response(chatId, 'Entendido. No registraremos tu telefono ni te enviaremos menus o recordatorios por Telegram.');
}

if (text === 'consent:accept') {
  const subscription = await getSubscriptionByChat(chatId);
  if (subscription?.consent_status === 'rejected') return rejectedResponse(chatId);
  await upsertSubscriptionByChat(chatId, {
    consent_status: 'pending',
    is_active: true,
    consent_notice_version: CONSENT_NOTICE_VERSION,
    consent_notice_text: privacyText(),
    rejected_at: null,
  });
  await setConsentStep(chatId, 'accepted_pending_phone');
  return response(
    chatId,
    'Gracias. Ahora comparte tu telefono de Telegram para validarlo con tu registro de cliente.',
    undefined,
    contactKeyboard()
  );
}

if (contactPhone || (!update.isCallback && normalizePhone(text).length >= 8)) {
  const consentStep = await getConsentStep(chatId);
  const subscription = await getSubscriptionByChat(chatId);
  if (subscription?.consent_status === 'rejected') return rejectedResponse(chatId);
  if (consentStep?.status !== 'accepted_pending_phone') return promptConsent(chatId);

  if (contactPhone && !update.contactVerified) {
    return response(chatId, 'Comparte tu propio contacto de Telegram para continuar.');
  }

  const phone = contactPhone || text;
  const client = await findClientByPhone(phone);
  if (!client) {
    return response(chatId, 'No encontre un cliente activo con ese telefono. Contacta a un administrador.');
  }

  const saved = await saveAcceptedSubscription(chatId, client, phone, update.contactVerified);
  if (saved.blocked && saved.reason === 'rejected') return rejectedResponse(chatId);
  if (saved.blocked && saved.reason === 'chat_taken') {
    return response(chatId, 'Ese telefono ya esta vinculado a otro chat. Pide a un administrador que lo revise.');
  }

  const session = await startSessionForClient(chatId, client);
  return response(
    chatId,
    'Listo ' + (client.nombre || '') + ', tu Telegram quedo vinculado.\n\n' + menuCaption(session.date),
    optionsKeyboard('sopa', session.menu.sopas)
  );
}

if (command === '/menu') {
  const subscription = await getSubscriptionByChat(chatId);
  if (subscription?.consent_status === 'rejected') return rejectedResponse(chatId);
  if (subscription?.consent_status !== 'accepted' || subscription.is_active === false) return promptConsent(chatId);

  const client = await findClientForSubscription(subscription);
  if (!client) {
    return response(chatId, 'Tu suscripcion esta aceptada, pero el cliente no esta activo. Contacta a un administrador.');
  }
  const session = await startSessionForClient(chatId, client);
  return response(chatId, menuCaption(session.date), optionsKeyboard('sopa', session.menu.sopas));
}

if (String(text || '').startsWith('link:')) {
  const subscription = await getSubscriptionByChat(chatId);
  if (subscription?.consent_status === 'rejected') return rejectedResponse(chatId);
  if (subscription?.consent_status !== 'accepted') return promptConsent(chatId);
  return response(chatId, 'Tu chat ya esta vinculado. Envia /menu para ver el menu disponible.');
}

let session = await getSession(chatId);
if (!session) {
  const subscription = await getSubscriptionByChat(chatId);
  if (subscription?.consent_status === 'rejected') return rejectedResponse(chatId);
  if (subscription?.consent_status !== 'accepted') return promptConsent(chatId);
  return response(chatId, 'No tengo un menu activo para este chat. Envia /menu para cargar el menu de hoy.');
}

const today = todayInTimezone(CONFIG.timezone);
if (session.date !== today) {
  await clearSession(chatId);
  return response(chatId, 'El menu activo ya vencio. Envia /menu para cargar el menu de hoy.');
}

if (!update.isCallback && text) {
  const parsed = parseTextOrder(text, session.menu);
  if (parsed.valid) {
    session.sopa = parsed.sopa;
    session.segundo = parsed.segundo;
    session.guarnicion = parsed.guarnicion;
    session.quantity = parsed.quantity;
    const order = await insertOrder(session, chatId);
    await clearSession(chatId);
    await finishTrace(activeTraceId, {
      id_cliente: session.cliente.id_cliente,
      id_orden: order.id_orden,
      interpreted_payload: {
        quantity: session.quantity,
        sopa: session.sopa,
        segundo: session.segundo,
        guarnicion: session.guarnicion,
        source: 'text',
      },
      outcome: order.duplicate ? 'rejected' : 'success',
      error_message: order.duplicate ? 'Reserva duplicada para el dia' : null,
    });
    return response(
      chatId,
      (order.duplicate ? 'Ya tenias una reserva registrada para hoy.\n\n' : 'Tu almuerzo quedo reservado.\n\n') +
        'Cantidad: ' + session.quantity + '\n' +
        'Sopa: ' + session.sopa + '\n' +
        'Plato fuerte: ' + session.segundo + '\n' +
        'Guarnicion: ' + session.guarnicion + '\n' +
        'Estado: Reservado\n' +
        'Orden: ' + order.id_orden
    );
  }

  if (parsed.looksLikeOrder) {
    const retryKind = session.step === 'segundo' ? 'segundo' : session.step === 'guarnicion' ? 'guarnicion' : 'sopa';
    const retryOptions = retryKind === 'segundo' ? session.menu.segundos : retryKind === 'guarnicion' ? session.menu.guarniciones : session.menu.sopas;
    await finishTrace(activeTraceId, {
      interpreted_payload: parsed,
      outcome: 'failed',
      error_message: 'Formato incompleto o invalido',
    });
    return response(chatId, correctionText(parsed), optionsKeyboard(retryKind, retryOptions));
  }
}

if (session.step === 'sopa') {
  const sopa = update.isCallback ? optionFromCallback(text, 'sopa', session.menu.sopas) : '';
  if (!sopa) {
    return response(chatId, 'Usa los botones para escoger tu sopa.', optionsKeyboard('sopa', session.menu.sopas));
  }
  session.sopa = sopa;
  session.step = 'segundo';
  await saveSession(chatId, session);
  return response(chatId, askSegundo(session), optionsKeyboard('segundo', session.menu.segundos));
}

if (session.step === 'segundo') {
  const segundo = update.isCallback ? optionFromCallback(text, 'segundo', session.menu.segundos) : '';
  if (!segundo) {
    return response(chatId, 'Usa los botones para escoger tu plato fuerte.', optionsKeyboard('segundo', session.menu.segundos));
  }
  session.segundo = segundo;
  session.step = 'guarnicion';
  await saveSession(chatId, session);
  return response(chatId, askGuarnicion(session), optionsKeyboard('guarnicion', session.menu.guarniciones));
}

if (session.step === 'guarnicion') {
  const guarnicion = update.isCallback ? optionFromCallback(text, 'guarnicion', session.menu.guarniciones) : '';
  if (!guarnicion) {
    return response(chatId, 'Usa los botones para escoger tu guarnicion.', optionsKeyboard('guarnicion', session.menu.guarniciones));
  }
  session.guarnicion = guarnicion;
  const order = await insertOrder(session, chatId);
  await clearSession(chatId);
  await finishTrace(activeTraceId, {
    id_cliente: session.cliente.id_cliente,
    id_orden: order.id_orden,
    interpreted_payload: {
      quantity: Number(session.quantity || 1),
      sopa: session.sopa,
      segundo: session.segundo,
      guarnicion: session.guarnicion,
      source: 'buttons',
    },
    outcome: order.duplicate ? 'rejected' : 'success',
    error_message: order.duplicate ? 'Reserva duplicada para el dia' : null,
  });
  return response(
    chatId,
    (order.duplicate ? 'Ya tenias una reserva registrada para hoy.\n\n' : 'Tu almuerzo quedo reservado.\n\n') +
      'Cantidad: ' + Number(session.quantity || 1) + '\n' +
      'Sopa: ' + session.sopa + '\n' +
      'Plato fuerte: ' + session.segundo + '\n' +
      'Guarnicion: ' + session.guarnicion + '\n' +
      'Estado: Reservado\n' +
      'Orden: ' + order.id_orden
  );
}

await finishTrace(activeTraceId, {
  outcome: 'failed',
  error_message: 'Flujo no pudo continuar',
});
return response(chatId, 'No pude continuar. Envia /cancelar y luego /menu.');
}

try {
  return await main();
} catch (error) {
  const message = error?.message || 'Error inesperado al procesar el pedido.';
  await finishTrace(activeTraceId, {
    outcome: 'failed',
    error_message: message,
  });
  if (!activeChatId) throw error;
  return response(
    activeChatId,
    'No pude registrar tu pedido en este momento.\n\n' +
      'Corrige la informacion o envia /menu para intentarlo otra vez. Si el problema continua, contacta a un administrador.'
  );
}
