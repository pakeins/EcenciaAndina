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
  consentVersion: cfg('TELEGRAM_CONSENT_VERSION'),
  menuImageUrl: cfg(
    'N8N_ECIENCIA_MENU_IMAGE_URL',
    'https://lkffhdcavohaxdihvwlb.supabase.co/storage/v1/object/public/eciencia-menu-assets/telegram/eciencia-menu-demo.png'
  ),
  defaultProductName: cfg('N8N_ECIENCIA_PRODUCTO_ALMUERZO_NOMBRE', 'Almuerzo Telegram'),
  origenName: cfg('N8N_ECIENCIA_ORIGEN_NOMBRE', 'Telegram'),
  estadoReservadoName: cfg('N8N_ECIENCIA_ESTADO_RESERVADO_NOMBRE', 'Reservado'),
};
if (!CONFIG.consentVersion) {
  throw new Error('Falta TELEGRAM_CONSENT_VERSION en n8n.');
}

function todayInTimezone(timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
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

async function saveLatestMenu(today, value) {
  await setState('latest-menu:' + today, value);
}

async function saveActiveMenu(value) {
  await setState('latest-menu:active', value);
}

async function getActiveMenu() {
  const activeMenu = await getState('latest-menu:active');
  if (!activeMenu?.menu) return null;
  return {
    date: activeMenu.date || todayInTimezone(CONFIG.timezone),
    menu: compactMenu(activeMenu.menu),
    photoUrl: activeMenu.photoUrl || '',
  };
}

async function saveSession(chatId, session) {
  await setState('session:' + chatId, session);
}

function cleanOptions(options) {
  return Array.isArray(options)
    ? options.map((option) => String(option || '').trim()).filter(Boolean)
    : [];
}

function compactMenu(menu) {
  return {
    entradas: cleanOptions(menu.entradas).slice(0, 8),
    sopas: cleanOptions(menu.sopas).slice(0, 8),
    segundos: cleanOptions(menu.segundos).slice(0, 8),
    guarniciones: cleanOptions(menu.guarniciones).slice(0, 8),
    bebidas: cleanOptions(menu.bebidas).slice(0, 8),
    postres: cleanOptions(menu.postres).slice(0, 8),
  };
}

function menuFromPayload(payload) {
  const source = payload?.menu || payload || {};
  const menu = compactMenu({
    entradas: source.entradas,
    sopas: source.sopas,
    segundos: source.segundos,
    guarniciones: source.guarniciones,
    bebidas: source.bebidas,
    postres: source.postres,
  });
  if (!menu.sopas.length || !menu.segundos.length) return null;
  return menu;
}

function ensureHttpsImageUrl(value, label) {
  const imageUrl = String(value || '').trim();
  if (!imageUrl) return '';
  if (!/^https:\/\//i.test(imageUrl)) {
    throw new Error((label || 'La imagen del menu') + ' debe usar una URL HTTPS publica.');
  }
  return imageUrl;
}

function imageUrlFromPayload(payload) {
  return ensureHttpsImageUrl(payload?.photoUrl || payload?.menuImageUrl || payload?.imageUrl, 'La imagen enviada al webhook');
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

const TIPOS_ALMUERZO = [
  { id: 6, code: 'ejecutivo_completo', label: 'Almuerzo Ejecutivo Completo', shortLabel: 'Ejecutivo Completo', nombreProducto: 'Almuerzo Ejecutivo Completo', requiresEntrada: true, requiresSopa: true, requiresSegundo: true, requiresBebida: true, requiresPostre: true },
  { id: 7, code: 'ejecutivo_sin_sopa', label: 'Almuerzo Ejecutivo Sin Sopa', shortLabel: 'Ejecutivo Sin Sopa', nombreProducto: 'Almuerzo Ejecutivo Sin Sopa', requiresEntrada: true, requiresSopa: false, requiresSegundo: true, requiresBebida: true, requiresPostre: true },
  { id: 8, code: 'ejecutivo_simple', label: 'Almuerzo Ejecutivo Simple', shortLabel: 'Ejecutivo Simple', nombreProducto: 'Almuerzo Ejecutivo Simple', requiresEntrada: false, requiresSopa: false, requiresSegundo: true, requiresBebida: true, requiresPostre: true },
  { id: 9, code: 'almuerzo_dia', label: 'Almuerzo del Dia', shortLabel: 'Almuerzo del Dia', nombreProducto: 'Almuerzo del Dia', requiresEntrada: false, requiresSopa: true, requiresSegundo: true, requiresBebida: true, requiresPostre: false },
  { id: 10, code: 'almuerzo_dia_simple', label: 'Almuerzo del Dia Simple', shortLabel: 'Almuerzo del Dia Simple', nombreProducto: 'Almuerzo del Dia Simple', requiresEntrada: false, requiresSopa: false, requiresSegundo: true, requiresBebida: true, requiresPostre: false },
];

function tipoAlmuerzoKeyboard(sid) {
  return {
    inline_keyboard: TIPOS_ALMUERZO.map((tipo) => [
      {
        text: tipo.label,
        callback_data: 'tipo:' + tipo.code + (sid ? ':' + sid : ''),
      },
    ]),
  };
}

function menuCaption(today) {
  return trimTelegramCaption(
    'Ecencia Andina - Menu del dia ' + today + '\n\n' +
      'Realiza toda la reserva con los botones. Primero elige el tipo de almuerzo.'
  );
}

function trimTelegramCaption(text) {
  const value = String(text || '');
  return value.length <= 1000 ? value : value.slice(0, 997) + '...';
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

async function getAcceptedSubscriptions() {
  return supa('/telegram_subscriptions?' + queryString([
    ['select', 'id,id_cliente,phone_normalized,chat_id,consent_status,is_active,consent_notice_version'],
    ['consent_status', 'eq.accepted'],
    ['is_active', 'eq.true'],
    ['consent_notice_version', 'eq.' + CONFIG.consentVersion],
    ['chat_id', 'not.is.null'],
  ]));
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

const today = todayInTimezone(CONFIG.timezone);
const rawInput = items[0]?.json || {};
const expectedWebhookSecret = cfg('N8N_MENU_WEBHOOK_SECRET');
if (expectedWebhookSecret && (rawInput.headers || rawInput.body)) {
  const headers = rawInput.headers || {};
  const receivedSecret =
    headers['x-eciencia-webhook-secret'] ||
    headers['X-Eciencia-Webhook-Secret'] ||
    headers['X-ECIENCIA-WEBHOOK-SECRET'];
  if (receivedSecret !== expectedWebhookSecret) {
    throw new Error('Webhook manual no autorizado.');
  }
}
const payload = rawInput.body || rawInput || {};
const payloadMenu = menuFromPayload(payload);
const activeMenu = payloadMenu ? null : await getActiveMenu();
const menu = payloadMenu || activeMenu?.menu || await getMenuFromSupabase();
const photoUrl = ensureHttpsImageUrl(imageUrlFromPayload(payload) || activeMenu?.photoUrl || CONFIG.menuImageUrl);
const targetClientIds = new Set(cleanOptions(payload.clientIds));
const product = await getProduct();
const estadoReservadoId = await getLookupId('estados_orden', 'id_estado', 'nombre_estado', CONFIG.estadoReservadoName);
const origenTelegramId = await getLookupId('origenes_pedido', 'id_origen', 'nombre_origen', CONFIG.origenName);
const clients = await getClients();
const subscriptions = await getAcceptedSubscriptions();
const output = [];

const subscriptionByClient = new Map();
const subscriptionByPhone = new Map();
for (const subscription of subscriptions) {
  if (subscription.id_cliente) subscriptionByClient.set(subscription.id_cliente, subscription);
  if (subscription.phone_normalized) subscriptionByPhone.set(subscription.phone_normalized, subscription);
}

await saveLatestMenu(today, {
  date: today,
  menu,
  photoUrl,
  source: payload?.source || 'n8n',
});
await saveActiveMenu({
  date: today,
  menu,
  photoUrl,
  source: payload?.source || 'n8n',
});

for (const client of clients) {
  if (targetClientIds.size && !targetClientIds.has(String(client.id_cliente))) continue;

  const subscription =
    subscriptionByClient.get(client.id_cliente) ||
    phoneCandidates(client.telefono).map((phone) => subscriptionByPhone.get(phone)).find(Boolean);

  if (!subscription?.chat_id) continue;

  const chatId = String(subscription.chat_id);
  const convenio = activeConvenio(client, today);
  const sid = String(Date.now()) + Math.floor(Math.random() * 1000);
  const session = {
    sid,
    step: 'tipo',
    date: today,
    menuDate: activeMenu?.date || today,
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
  await saveSession(chatId, session);

  output.push({
    json: {
      chatId,
      subscriptionId: subscription.id,
      photoUrl,
      caption: menuCaption(today),
      inlineKeyboard: tipoAlmuerzoKeyboard(sid),
    },
  });
}

return output;
