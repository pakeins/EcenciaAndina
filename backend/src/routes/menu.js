const express = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const { requireInternalWebhookSecret } = require('../middlewares/internalWebhookSecret');
const { getAdminClient } = require('../config/supabase');
const { parseBody, schemas, sendValidationError } = require('../validation/eciencia');
const { cleanupOldMenuImages } = require('../services/menuImageCleanup');
const { DEFAULT_LUNCH_TYPE_ID } = require('../services/lunchTypes');

const router = express.Router();

const DEFAULT_N8N_MENU_WEBHOOK_URL = 'http://localhost:7000/webhook/eciencia-enviar-menu-manual';
const MENU_ASSETS_BUCKET = 'eciencia-menu-assets';
const TIMEZONE = 'America/Bogota';
const DEFAULT_IMAGE_RETENTION_DAYS = 14;
const MAX_MENU_IMAGE_BYTES = 5 * 1024 * 1024;
const LOCAL_WEBHOOK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);
const DATA_IMAGE_PATTERN = /^data:(image\/(?:png|jpe?g|webp));base64,(.+)$/i;

const cleanOptions = (options) => {
  if (!Array.isArray(options)) return [];
  return options.map((option) => String(option || '').trim()).filter(Boolean);
};

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

// Modelo por componentes: un unico menu diario compartido; cada paquete
// toma el subconjunto de componentes que incluye. Sin variantes por tipo.
const MENU_SECTIONS = ['entradas', 'sopas', 'segundos', 'postres', 'bebidas', 'guarniciones'];

const cleanSections = (source = {}) =>
  Object.fromEntries(MENU_SECTIONS.map((section) => [section, cleanOptions(source?.[section])]));

const buildMenuPayload = (body) => cleanSections(body);

function normalizeMenuSections(menu) {
  return cleanSections(menu);
}

// Solo el plato fuerte (segundos) es obligatorio; el resto de componentes
// se ofrecen segun el paquete y se omiten si no hay opciones cargadas.
const hasCompleteMenu = (menu) => Boolean(cleanOptions(menu?.segundos).length);

const normalizeMenuForCompare = (menu) => cleanSections(menu);

const menuPayloadEquals = (left, right) =>
  JSON.stringify(normalizeMenuForCompare(left)) === JSON.stringify(normalizeMenuForCompare(right));

const cleanClientIds = (clientIds) => {
  if (!Array.isArray(clientIds)) return [];
  return clientIds.map((id) => String(id || '').trim()).filter(Boolean);
};

const getN8nMenuWebhookUrl = () => {
  const configuredUrl = process.env.N8N_MENU_WEBHOOK_URL || '';
  const webhookUrl = configuredUrl || (process.env.NODE_ENV === 'production' ? '' : DEFAULT_N8N_MENU_WEBHOOK_URL);

  if (!webhookUrl) {
    const error = new Error('Falta N8N_MENU_WEBHOOK_URL en produccion.');
    error.status = 500;
    throw error;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(webhookUrl);
  } catch {
    const error = new Error('N8N_MENU_WEBHOOK_URL no es una URL valida.');
    error.status = 500;
    throw error;
  }

  if (process.env.NODE_ENV === 'production') {
    if (parsedUrl.protocol !== 'https:') {
      const error = new Error('N8N_MENU_WEBHOOK_URL debe usar HTTPS en produccion.');
      error.status = 500;
      throw error;
    }

    if (LOCAL_WEBHOOK_HOSTS.has(parsedUrl.hostname.toLowerCase())) {
      const error = new Error('N8N_MENU_WEBHOOK_URL no puede apuntar a localhost en produccion.');
      error.status = 500;
      throw error;
    }
  }

  return parsedUrl.toString();
};

const isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));

const mimeToExtension = (mimeType) => {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
};

const hasAllowedImageSignature = (buffer, mimeType) => {
  const isJpeg = mimeType === 'image/jpeg' && buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng =
    mimeType === 'image/png' &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp =
    mimeType === 'image/webp' &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP';

  return isJpeg || isPng || isWebp;
};

const parseMenuImageInput = (image, options = {}) => {
  if (!image) {
    if (options.required) {
      const error = new Error('La imagen del menu es obligatoria para enviar por Telegram.');
      error.status = 400;
      throw error;
    }
    return null;
  }

  const imageText = String(image);
  if (/^https:\/\//i.test(imageText)) return { kind: 'url', publicUrl: imageText };
  if (/^http:\/\//i.test(imageText)) {
    const error = new Error('La URL publica de imagen del menu debe usar HTTPS.');
    error.status = 400;
    throw error;
  }

  const match = DATA_IMAGE_PATTERN.exec(imageText);
  if (!match) {
    const error = new Error('La imagen del menu debe ser JPG, PNG, WebP o una URL publica HTTPS.');
    error.status = 400;
    throw error;
  }

  const [, rawMimeType, base64Data] = match;
  const mimeType = rawMimeType.toLowerCase() === 'image/jpg' ? 'image/jpeg' : rawMimeType.toLowerCase();
  const buffer = Buffer.from(base64Data, 'base64');
  if (buffer.length > MAX_MENU_IMAGE_BYTES || !hasAllowedImageSignature(buffer, mimeType)) {
    const error = new Error('La imagen del menu debe ser JPG, PNG o WebP valida y pesar maximo 5 MB.');
    error.status = 400;
    throw error;
  }
  const fileName = `telegram/menu-dashboard-${Date.now()}.${mimeToExtension(mimeType.toLowerCase())}`;
  return { kind: 'buffer', mimeType, buffer, fileName };
};

const validateMenuImageInput = (image, options = {}) => {
  parseMenuImageInput(image, options);
  return true;
};

const uploadMenuImage = async (image, options = {}) => {
  const parsed = parseMenuImageInput(image, options);
  if (!parsed) return null;
  if (parsed.kind === 'url') return parsed.publicUrl;

  const adminClient = getAdminClient();

  const { error } = await adminClient.storage.from(MENU_ASSETS_BUCKET).upload(parsed.fileName, parsed.buffer, {
    contentType: parsed.mimeType,
    upsert: false,
  });

  if (error) {
    throw new Error(`No se pudo subir la imagen del menu: ${error.message}`);
  }

  const { data } = adminClient.storage.from(MENU_ASSETS_BUCKET).getPublicUrl(parsed.fileName);
  return data.publicUrl;
};

const getMenuSettings = async (adminClient) => {
  const { data, error } = await adminClient
    .from('menu_settings')
    .select('active_date,image_retention_days')
    .eq('id', 1)
    .maybeSingle();

  if (error) throw error;
  return data || { active_date: null, image_retention_days: DEFAULT_IMAGE_RETENTION_DAYS };
};

const getMenuDelivery = async (adminClient, fecha) => {
  const { data, error } = await adminClient
    .from('menu_envios')
    .select('fecha,menu_payload,image_url,first_sent_at,last_sent_at,send_count')
    .eq('fecha', fecha)
    .maybeSingle();

  if (error) throw error;
  return data || null;
};

const fetchMenuDeliveries = async (adminClient) => {
  const { data, error } = await adminClient
    .from('menu_envios')
    .select('fecha,first_sent_at,last_sent_at,send_count');

  if (error) throw error;
  return new Map((data || []).map((row) => [String(row.fecha), row]));
};

const markMenuSent = async (adminClient, fecha, menu, imageUrl, userId) => {
  const existing = await getMenuDelivery(adminClient, fecha);
  const payload = {
    fecha,
    menu_payload: normalizeMenuForCompare(menu),
    image_url: imageUrl || null,
    last_sent_at: new Date().toISOString(),
    send_count: Number(existing?.send_count || 0) + 1,
    updated_by: userId,
    ...(existing ? {} : { first_sent_at: new Date().toISOString(), created_by: userId }),
  };

  const query = existing
    ? adminClient.from('menu_envios').update(payload).eq('fecha', fecha)
    : adminClient.from('menu_envios').insert([payload]);

  const { error } = await query;
  if (error) throw error;
};

const saveActiveMenuState = async (adminClient, fecha, menu, photoUrl, userId) => {
  const { error: settingsError } = await adminClient
    .from('menu_settings')
    .upsert(
      {
        id: 1,
        active_date: fecha,
        updated_by: userId,
      },
      { onConflict: 'id' },
    );

  if (settingsError) throw settingsError;

  const { error: stateError } = await adminClient
    .from('telegram_bot_state')
    .upsert(
      {
        key: 'latest-menu:active',
        value: {
          date: fecha,
          menu,
          photoUrl,
          updatedAt: new Date().toISOString(),
        },
      },
      { onConflict: 'key' },
    );

  if (stateError) throw stateError;
};

const expireActiveMenu = async (adminClient, userId = null) => {
  const settings = await getMenuSettings(adminClient);

  const { error: settingsError } = await adminClient
    .from('menu_settings')
    .update({
      active_date: null,
      updated_by: userId,
    })
    .eq('id', 1);

  if (settingsError) throw settingsError;

  const { error: stateError } = await adminClient
    .from('telegram_bot_state')
    .delete()
    .eq('key', 'latest-menu:active');

  if (stateError) throw stateError;

  return { previousActiveDate: settings.active_date || null };
};

const menuRowSelect = `
  fecha,
  id_tipo_almuerzo,
  imagen_url,
  tipos_almuerzo(
    codigo,
    nombre
  ),
  alimentos(
    nombre_alimento,
    id_categoria_menu,
    categorias_menu(nombre_categoria)
  )
`;

const createMenuGroup = (row, activeDate) => ({
  fecha: row.fecha,
  estado: row.fecha === activeDate ? 'activo' : 'inactivo',
  imagen_url: row.imagen_url || null,
  entradas: [],
  sopas: [],
  segundos: [],
  postres: [],
  bebidas: [],
  guarniciones: [],
  opciones: 0,
});

const foodFromMenuRow = (row) => {
  const food = Array.isArray(row.alimentos) ? row.alimentos[0] : row.alimentos;
  const name = String(food?.nombre_alimento || '').trim();
  if (!name) return null;

  return {
    name,
    category: normalizeText(food?.categorias_menu?.nombre_categoria || ''),
    typeCode: row.tipos_almuerzo?.codigo || null,
  };
};

const addFoodToMenuGroup = (menu, food) => {
  const { category } = food;
  if (category.includes('entrada')) menu.entradas.push(food.name);
  else if (category.includes('sopa')) menu.sopas.push(food.name);
  else if (category.includes('segundo') || category.includes('plato')) menu.segundos.push(food.name);
  else if (category.includes('postre')) menu.postres.push(food.name);
  else if (category.includes('bebida')) menu.bebidas.push(food.name);
  else if (category.includes('guarn')) menu.guarniciones.push(food.name);
  else return;
  menu.opciones += 1;
};

const withDeliveryInfo = (menu, deliveries) => {
  const delivery = deliveries.get(String(menu.fecha));
  return {
    ...menu,
    enviado: Boolean(delivery),
    sent_at: delivery?.last_sent_at || null,
    send_count: Number(delivery?.send_count || 0),
  };
};

const groupMenuRows = (rows, activeDate, deliveries = new Map()) => {
  const grouped = new Map();

  for (const row of rows || []) {
    if (!grouped.has(row.fecha)) {
      grouped.set(row.fecha, createMenuGroup(row, activeDate));
    }

    const menu = grouped.get(row.fecha);
    if (!menu.imagen_url && row.imagen_url) menu.imagen_url = row.imagen_url;

    const food = foodFromMenuRow(row);
    if (food) addFoodToMenuGroup(menu, food);
  }

  return [...grouped.values()]
    .map((menu) => withDeliveryInfo(menu, deliveries))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
};

const getCategoryIds = async (adminClient) => {
  const { data, error } = await adminClient
    .from('categorias_menu')
    .select('id_categoria_menu,nombre_categoria');

  if (error) throw error;

  const categories = {};
  for (const row of data || []) {
    const name = normalizeText(row.nombre_categoria);
    if (name.includes('entrada')) categories.entradas = row.id_categoria_menu;
    if (name.includes('sopa')) categories.sopas = row.id_categoria_menu;
    if (name.includes('segundo') || name.includes('plato')) categories.segundos = row.id_categoria_menu;
    if (name.includes('postre')) categories.postres = row.id_categoria_menu;
    if (name.includes('bebida')) categories.bebidas = row.id_categoria_menu;
    if (name.includes('guarn')) categories.guarniciones = row.id_categoria_menu;
  }

  if (!categories.segundos) {
    const error = new Error('Falta la categoria de menu de platos fuertes (Segundos).');
    error.status = 500;
    throw error;
  }

  return categories;
};

const ensureAlimento = async (adminClient, idCategoria, nombre, userId) => {
  const { data: existing, error: selectError } = await adminClient
    .from('alimentos')
    .select('id_alimento,nombre_alimento')
    .eq('id_categoria_menu', idCategoria)
    .ilike('nombre_alimento', nombre)
    .limit(1)
    .maybeSingle();

  if (selectError) throw selectError;
  if (existing) return existing.id_alimento;

  const { data, error } = await adminClient
    .from('alimentos')
    .insert({
      id_categoria_menu: idCategoria,
      nombre_alimento: nombre,
      created_by: userId,
    })
    .select('id_alimento')
    .single();

  if (error) throw error;
  return data.id_alimento;
};

const fetchMenus = async (adminClient, fecha = null) => {
  let query = adminClient
    .from('menu_diario')
    .select(menuRowSelect)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: true });

  if (fecha) query = query.eq('fecha', fecha);

  const { data, error } = await query;
  if (error) throw error;

  const settings = await getMenuSettings(adminClient);
  const deliveries = await fetchMenuDeliveries(adminClient);
  return groupMenuRows(data || [], settings.active_date, deliveries);
};

const getMenuByDate = async (adminClient, fecha) => {
  const menus = await fetchMenus(adminClient, fecha);
  return menus[0] || null;
};

const collectMenuRows = async (adminClient, categoryIds, menu, imageUrl, userId, fecha) => {
  const rows = [];
  const pushRows = async (sections, idTipoAlmuerzo) => {
    for (const [key, options] of Object.entries(normalizeMenuSections(sections))) {
      if (!options.length) continue;
      if (!categoryIds[key]) continue;
      for (const option of options) {
        const idAlimento = await ensureAlimento(adminClient, categoryIds[key], option, userId);
        rows.push({
          fecha,
          id_alimento: idAlimento,
          id_tipo_almuerzo: idTipoAlmuerzo,
          imagen_url: imageUrl,
          created_by: userId,
        });
      }
    }
  };

  await pushRows(menu, DEFAULT_LUNCH_TYPE_ID);

  return rows;
};

const saveDailyMenu = async (adminClient, menu, imageUrl, userId, fecha = todayInTimezone()) => {
  const categoryIds = await getCategoryIds(adminClient);
  const rows = await collectMenuRows(adminClient, categoryIds, menu, imageUrl, userId, fecha);

  const { error: deleteError } = await adminClient.from('menu_diario').delete().eq('fecha', fecha);
  if (deleteError) throw deleteError;

  if (!rows.length) return { fecha, count: 0 };

  const { error: insertError } = await adminClient.from('menu_diario').insert(rows);
  if (insertError) throw insertError;

  return { fecha, count: rows.length };
};

const runImageCleanup = async (_req, res) => {
  try {
    const adminClient = getAdminClient();
    const result = await cleanupOldMenuImages(adminClient);
    res.json({ mensaje: 'Limpieza de imagenes ejecutada.', ...result });
  } catch (error) {
    console.error('Error limpiando imagenes de menu:', error);
    res.status(500).json({ error: error.message || 'No se pudieron limpiar las imagenes antiguas.' });
  }
};

router.post('/system/limpiar-imagenes', requireInternalWebhookSecret, runImageCleanup);

router.post('/system/expirar-activo', requireInternalWebhookSecret, async (_req, res) => {
  try {
    const result = await expireActiveMenu(getAdminClient());
    res.json({ mensaje: 'Menu activo expirado correctamente.', ...result });
  } catch (error) {
    console.error('Error expirando menu activo:', error);
    res.status(500).json({ error: error.message || 'No se pudo expirar el menu activo.' });
  }
});

router.use(authMiddleware);
router.use(roleMiddleware(['administrador', 'caja']));

router.get('/', async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const menus = await fetchMenus(adminClient);
    res.json({ menus });
  } catch (error) {
    console.error('Error listando menus:', error);
    res.status(500).json({ error: error.message || 'No se pudieron listar los menus.' });
  }
});

router.get('/activo', async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const settings = await getMenuSettings(adminClient);
    if (!settings.active_date) {
      return res.status(404).json({ error: 'No existe un menu activo.' });
    }

    const menu = await getMenuByDate(adminClient, settings.active_date);
    if (!menu) return res.status(404).json({ error: 'El menu activo no tiene opciones registradas.' });
    res.json(menu);
  } catch (error) {
    console.error('Error consultando menu activo:', error);
    res.status(500).json({ error: error.message || 'No se pudo consultar el menu activo.' });
  }
});

// ECIENCIA_MENU_EDIT_AFTER_SEND=true permite editar y reenviar con cambios un
// menu ya enviado (modo pruebas); por defecto queda bloqueado como siempre.
const menuEditAfterSendEnabled = () =>
  String(process.env.ECIENCIA_MENU_EDIT_AFTER_SEND ?? '').toLowerCase() === 'true';

router.get('/config', (_req, res) => {
  res.json({ editAfterSend: menuEditAfterSendEnabled() });
});

router.put('/:fecha', async (req, res) => {
  try {
    const fecha = req.params.fecha;
    if (!isIsoDate(fecha)) return res.status(400).json({ error: 'La fecha del menu debe tener formato YYYY-MM-DD.' });

    const payload = parseBody(schemas.menuDashboard, req.body || {});
    const menu = buildMenuPayload(payload);
    if (!hasCompleteMenu(menu)) {
      return res.status(400).json({
        error: 'Debe haber al menos una sopa y un plato fuerte configurados.',
      });
    }

    const adminClient = getAdminClient();
    const delivery = await getMenuDelivery(adminClient, fecha);
    if (delivery && !menuEditAfterSendEnabled()) {
      return res.status(409).json({
        error: 'Este menu ya fue enviado y no se puede editar. Puede volver a enviarlo sin modificarlo.',
        sentAt: delivery.last_sent_at,
      });
    }

    const settings = await getMenuSettings(adminClient);
    if (settings.active_date === fecha && !payload.confirmarEdicion) {
      return res.status(409).json({
        requireConfirmation: true,
        error: 'Este menu esta activo. Confirma la edicion para actualizarlo.',
      });
    }

    const current = await getMenuByDate(adminClient, fecha);
    const photoUrl = payload.image ? await uploadMenuImage(payload.image) : current?.imagen_url || null;
    const dailyMenu = await saveDailyMenu(adminClient, menu, photoUrl, req.user.id, fecha);

    if (settings.active_date === fecha) {
      await saveActiveMenuState(adminClient, fecha, menu, photoUrl, req.user.id);
    }

    res.json({ mensaje: 'Menu actualizado correctamente.', dailyMenu, photoUrl });
  } catch (error) {
    console.error('Error actualizando menu:', error);
    if (sendValidationError(res, error)) return;
    res.status(error.status || 500).json({ error: error.message || 'No se pudo actualizar el menu.' });
  }
});

router.post('/:fecha/activar', async (req, res) => {
  try {
    const fecha = req.params.fecha;
    if (!isIsoDate(fecha)) return res.status(400).json({ error: 'La fecha del menu debe tener formato YYYY-MM-DD.' });

    const adminClient = getAdminClient();
    const menu = await getMenuByDate(adminClient, fecha);
    if (!menu) return res.status(404).json({ error: 'No existe un menu registrado para esa fecha.' });
    if (!hasCompleteMenu(menu)) {
      return res.status(400).json({ error: 'El menu debe tener sopa y plato fuerte para activarse.' });
    }

    await saveActiveMenuState(
      adminClient,
      fecha,
      {
        entradas: menu.entradas,
        sopas: menu.sopas,
        segundos: menu.segundos,
        postres: menu.postres,
        bebidas: menu.bebidas,
        guarniciones: menu.guarniciones,
      },
      menu.imagen_url,
      req.user.id,
    );

    res.json({ mensaje: 'Menu activado correctamente.', fecha });
  } catch (error) {
    console.error('Error activando menu:', error);
    res.status(500).json({ error: error.message || 'No se pudo activar el menu.' });
  }
});

router.post('/limpiar-imagenes', runImageCleanup);

router.post('/enviar', async (req, res) => {
  try {
    const payload = parseBody(schemas.menuDashboard, req.body || {});
    const menu = buildMenuPayload(payload);
    if (!hasCompleteMenu(menu)) {
      return res.status(400).json({
        error: 'Debe haber al menos una sopa y un plato fuerte configurados.',
      });
    }

    const adminClient = getAdminClient();
    const fecha = todayInTimezone();
    const delivery = await getMenuDelivery(adminClient, fecha);

    if (delivery && payload.image) validateMenuImageInput(payload.image);

    const menuChanged = Boolean(delivery) && !menuPayloadEquals(delivery.menu_payload, menu);
    if (menuChanged && !menuEditAfterSendEnabled()) {
      return res.status(409).json({
        error: 'El menu de hoy ya fue enviado y no se puede modificar. Puede volver a enviar el menu registrado.',
        sentAt: delivery.last_sent_at,
      });
    }

    const photoUrl = delivery?.image_url || await uploadMenuImage(payload.image, { required: true });
    let dailyMenu;
    if (delivery && !menuChanged) {
      const currentMenu = await getMenuByDate(adminClient, fecha);
      dailyMenu = { fecha, count: currentMenu?.opciones || 0 };
    } else {
      // Primer envio del dia, o reenvio con cambios en modo pruebas: se
      // persisten las opciones nuevas antes de disparar el flujo.
      dailyMenu = await saveDailyMenu(adminClient, menu, photoUrl, req.user.id, fecha);
    }

    await saveActiveMenuState(adminClient, dailyMenu.fecha, menu, photoUrl, req.user.id);
    const cleanup = await cleanupOldMenuImages(adminClient);
    const webhookUrl = getN8nMenuWebhookUrl();
    const clientIds = cleanClientIds(payload.clientIds);

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.N8N_MENU_WEBHOOK_SECRET
          ? { 'X-Eciencia-Webhook-Secret': process.env.N8N_MENU_WEBHOOK_SECRET }
          : {}),
      },
      body: JSON.stringify({
        source: 'dashboard',
        requestedBy: {
          id: req.user.id,
          email: req.user.email,
          rol: req.user.rol,
        },
        menu,
        photoUrl,
        clientIds,
      }),
    });

    const responseText = await response.text();
    if (!response.ok) {
      const webhookNotRegistered =
        response.status === 404 || /not registered|no est[aá] registrad/i.test(responseText);
      if (webhookNotRegistered) {
        const friendly = new Error(
          'El flujo de n8n para enviar el menu no esta activo o el webhook no esta registrado. ' +
            'Activa el workflow en n8n y verifica la variable N8N_MENU_WEBHOOK_URL.',
        );
        friendly.status = 502;
        throw friendly;
      }
      throw new Error(`n8n respondio ${response.status}: ${responseText}`);
    }

    await markMenuSent(adminClient, dailyMenu.fecha, menu, photoUrl, req.user.id);

    res.status(202).json({
      mensaje: 'Flujo de Telegram disparado correctamente.',
      webhookStatus: response.status,
      dailyMenu,
      photoUrl,
      cleanup,
      reenvio: Boolean(delivery),
    });
  } catch (error) {
    console.error('Error disparando flujo de menu en n8n:', error);
    if (sendValidationError(res, error)) return;
    res.status(error.status || 500).json({
      error: error.message || 'No se pudo disparar el flujo de Telegram.',
    });
  }
});

module.exports = router;
module.exports._private = {
  buildMenuPayload,
  expireActiveMenu,
  groupMenuRows,
  hasCompleteMenu,
  menuPayloadEquals,
  normalizeMenuForCompare,
  validateMenuImageInput,
};
