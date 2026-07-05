const express = require('express');
const crypto = require('crypto');
const sharp = require('sharp');
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const { getAdminClient } = require('../config/supabase');
const { parseBody, schemas, sendValidationError } = require('../validation/eciencia');
const { cleanupOldMenuImages } = require('../services/menuImageCleanup');
const { findOrCreateFood } = require('../services/menuCatalog');
const { MENU_CATEGORY_CODE } = require('../constants/domain');

const router = express.Router();

const DEFAULT_N8N_MENU_WEBHOOK_URL = 'http://localhost:7000/webhook/eciencia-enviar-menu-manual';
const MENU_ASSETS_BUCKET = 'eciencia-menu-assets';
const TIMEZONE = 'America/Bogota';
const DEFAULT_IMAGE_RETENTION_DAYS = 14;
const MAX_MENU_IMAGE_BYTES = 5 * 1024 * 1024;
const LOCAL_WEBHOOK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

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

const buildMenuPayload = (body) => ({
  sopas: cleanOptions(body.sopas),
  segundos: cleanOptions(body.segundos),
  guarniciones: cleanOptions(body.guarniciones),
});

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

const makeSquareWithBlurredBackground = async (buffer) => {
  try {
    const image = sharp(buffer);
    const metadata = await image.metadata();
    const width = metadata.width;
    const height = metadata.height;

    if (!width || !height) return buffer;
    if (width === height) return buffer;

    const size = Math.max(width, height);

    // 1. Create a blurred background of size x size
    const background = await sharp(buffer)
      .resize(size, size, { fit: 'cover' })
      .blur(40)
      .toBuffer();

    // 2. Resize foreground to fit within size x size, preserving aspect ratio, with transparent background
    const foreground = await sharp(buffer)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .toBuffer();

    // 3. Composite foreground over blurred background
    return await sharp(background)
      .composite([{ input: foreground, blend: 'over' }])
      .toBuffer();
  } catch (err) {
    console.error('Error al procesar la imagen con sharp:', err);
    return buffer; // fall back to original buffer if sharp fails
  }
};

const uploadMenuImage = async (image) => {
  if (!image) return { publicUrl: null, path: null };
  if (/^https:\/\//i.test(image)) return { publicUrl: image, path: null };
  if (/^http:\/\//i.test(image)) {
    const error = new Error('La URL publica de imagen del menu debe usar HTTPS.');
    error.status = 400;
    throw error;
  }

  const match = String(image).match(/^data:(image\/(?:png|jpe?g|webp));base64,(.+)$/i);
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
  const adminClient = getAdminClient();

  const processedBuffer = await makeSquareWithBlurredBackground(buffer);

  const { error } = await adminClient.storage.from(MENU_ASSETS_BUCKET).upload(fileName, processedBuffer, {
    contentType: mimeType,
    upsert: false,
  });

  if (error) {
    throw new Error(`No se pudo subir la imagen del menu: ${error.message}`);
  }

  const { data } = adminClient.storage.from(MENU_ASSETS_BUCKET).getPublicUrl(fileName);
  return { publicUrl: data.publicUrl, path: fileName };
};

const removeUploadedMenuImage = async (adminClient, imageUpload) => {
  if (!imageUpload?.path) return;
  const { error } = await adminClient.storage.from(MENU_ASSETS_BUCKET).remove([imageUpload.path]);
  if (error) console.error('No se pudo retirar la imagen huerfana del menu:', error);
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

const menuRowSelect = `
  fecha,
  imagen_url,
  alimentos(
    nombre_alimento,
    id_categoria_menu,
    categorias_menu(nombre_categoria)
  )
`;

const groupMenuRows = (rows, activeDate, envioMap = new Map()) => {
  const grouped = new Map();

  for (const row of rows || []) {
    if (!grouped.has(row.fecha)) {
      const envio = envioMap.get(row.fecha);
      grouped.set(row.fecha, {
        fecha: row.fecha,
        estado: row.fecha === activeDate ? 'activo' : 'inactivo',
        imagen_url: row.imagen_url || null,
        sopas: [],
        segundos: [],
        guarniciones: [],
        opciones: 0,
        enviado: !!envio,
        send_count: envio?.sendCount || 0,
      });
    }

    const menu = grouped.get(row.fecha);
    if (!menu.imagen_url && row.imagen_url) menu.imagen_url = row.imagen_url;

    const food = Array.isArray(row.alimentos) ? row.alimentos[0] : row.alimentos;
    const name = String(food?.nombre_alimento || '').trim();
    if (!name) continue;

    const category = normalizeText(food?.categorias_menu?.nombre_categoria || '');
    if (category.includes('sopa')) menu.sopas.push(name);
    else if (category.includes('segundo') || category.includes('plato')) menu.segundos.push(name);
    else if (category.includes('guarn')) menu.guarniciones.push(name);
    menu.opciones += 1;
  }

  return [...grouped.values()].sort((a, b) => b.fecha.localeCompare(a.fecha));
};

const getCategoryIds = async (adminClient) => {
  const { data, error } = await adminClient
    .from('categorias_menu')
    .select('id_categoria_menu,codigo');

  if (error) throw error;

  const categories = {};
  for (const row of data || []) {
    if (Object.values(MENU_CATEGORY_CODE).includes(row.codigo)) {
      categories[row.codigo] = row.id_categoria_menu;
    }
  }

  if (!categories.sopas || !categories.segundos || !categories.guarniciones) {
    const error = new Error('Faltan categorias de menu: Sopa, Segundo y Guarnicion.');
    error.status = 500;
    throw error;
  }

  return categories;
};

const ensureAlimento = async (adminClient, idCategoria, nombre, userId) => {
  const food = await findOrCreateFood(adminClient, {
    categoryId: idCategoria,
    name: nombre,
    userId,
  });
  return food.id;
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

  const { data: envios } = await adminClient
    .from('menu_envios')
    .select('fecha,last_sent_at,send_count,menu_payload');
  const envioMap = new Map();
  for (const e of envios || []) {
    envioMap.set(e.fecha, { sentAt: e.last_sent_at, sendCount: e.send_count, menuPayload: e.menu_payload });
  }

  return groupMenuRows(data || [], settings.active_date, envioMap);
};

const getMenuByDate = async (adminClient, fecha) => {
  const menus = await fetchMenus(adminClient, fecha);
  return menus[0] || null;
};

const saveDailyMenu = async (adminClient, menu, imageUrl, userId, fecha = todayInTimezone()) => {
  const categoryIds = await getCategoryIds(adminClient);
  const alimentosIds = [];

  for (const [key, options] of Object.entries(menu)) {
    for (const option of options) {
      alimentosIds.push(await ensureAlimento(adminClient, categoryIds[key], option, userId));
    }
  }

  const { data, error } = await adminClient.rpc('replace_daily_menu', {
    p_fecha: fecha,
    p_alimentos_ids: alimentosIds,
    p_imagen_url: imageUrl,
    p_user_id: userId,
  });
  if (error) throw error;

  return { fecha, count: Number(data ?? alimentosIds.length) };
};

const secureEquals = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const requireN8nCleanupSecret = (req, res, next) => {
  const expectedSecret = process.env.N8N_MENU_WEBHOOK_SECRET;
  if (!expectedSecret) {
    return res.status(503).json({ error: 'La limpieza programada no esta configurada.' });
  }

  const receivedSecret = req.get('X-Eciencia-Webhook-Secret');
  if (!secureEquals(receivedSecret, expectedSecret)) {
    return res.status(401).json({ error: 'Limpieza programada no autorizada.' });
  }

  next();
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

router.post('/system/limpiar-imagenes', requireN8nCleanupSecret, runImageCleanup);

router.post('/system/expirar-activo', requireN8nCleanupSecret, async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const settings = await getMenuSettings(adminClient);
    const previousActiveDate = settings.active_date;

    await adminClient.from('menu_settings').update({ active_date: null }).eq('id', 1);
    await adminClient.from('telegram_bot_state').delete().eq('key', 'latest-menu:active');

    res.json({ previousActiveDate });
  } catch (error) {
    console.error('Error expirando menu activo:', error);
    res.status(500).json({ error: error.message || 'No se pudo expirar el menu activo.' });
  }
});

router.use(authMiddleware);
router.use(roleMiddleware(['administrador', 'caja']));

router.get('/config', (req, res) => {
  res.json({ editAfterSend: !!process.env.ECIENCIA_MENU_EDIT_AFTER_SEND });
});

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

router.put('/:fecha', async (req, res) => {
  let adminClient;
  let imageUpload;
  let menuSaved = false;
  try {
    const fecha = req.params.fecha;
    if (!isIsoDate(fecha)) return res.status(400).json({ error: 'La fecha del menu debe tener formato YYYY-MM-DD.' });

    const payload = parseBody(schemas.menuDashboard, req.body || {});
    const menu = buildMenuPayload(payload);
    if (!menu.sopas.length || !menu.segundos.length || !menu.guarniciones.length) {
      return res.status(400).json({
        error: 'Debe haber al menos una sopa, un segundo y una guarnicion configurados.',
      });
    }

    adminClient = getAdminClient();
    const { data: envioExistente } = await adminClient
      .from('menu_envios')
      .select('fecha,last_sent_at')
      .eq('fecha', fecha)
      .maybeSingle();

    if (envioExistente && !process.env.ECIENCIA_MENU_EDIT_AFTER_SEND) {
      return res.status(409).json({
        error: 'Este menu ya fue enviado. No se permite editar el menu despues del envio.',
        sentAt: envioExistente.last_sent_at,
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
    imageUpload = payload.image
      ? await uploadMenuImage(payload.image)
      : { publicUrl: current?.imagen_url || null, path: null };
    const photoUrl = imageUpload.publicUrl;
    const dailyMenu = await saveDailyMenu(adminClient, menu, photoUrl, req.user.id, fecha);
    menuSaved = true;

    if (settings.active_date === fecha) {
      await saveActiveMenuState(adminClient, fecha, menu, photoUrl, req.user.id);
    }

    res.json({ mensaje: 'Menu actualizado correctamente.', dailyMenu, photoUrl });
  } catch (error) {
    if (!menuSaved && adminClient && imageUpload?.path) {
      await removeUploadedMenuImage(adminClient, imageUpload);
    }
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
    if (!menu.sopas.length || !menu.segundos.length || !menu.guarniciones.length) {
      return res.status(400).json({ error: 'El menu debe tener sopa, segundo y guarnicion para activarse.' });
    }

    await saveActiveMenuState(
      adminClient,
      fecha,
      {
        sopas: menu.sopas,
        segundos: menu.segundos,
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
  let adminClient;
  let imageUpload;
  let menuSaved = false;
  let isResend = false;
  try {
    const payload = parseBody(schemas.menuDashboard, req.body || {});
    const menu = buildMenuPayload(payload);
    if (!menu.sopas.length || !menu.segundos.length || !menu.guarniciones.length) {
      return res.status(400).json({
        error: 'Debe haber al menos una sopa, un segundo y una guarnicion configurados.',
      });
    }

    adminClient = getAdminClient();

    const today = todayInTimezone();
    const { data: envioHoy } = await adminClient
      .from('menu_envios')
      .select('fecha,last_sent_at,menu_payload')
      .eq('fecha', today)
      .maybeSingle();

    if (envioHoy) {
      if (!process.env.ECIENCIA_MENU_EDIT_AFTER_SEND) {
        return res.status(409).json({
          error: 'Ya se envio un menu hoy con contenido diferente. No se permite reenvio.',
          sentAt: envioHoy.last_sent_at,
        });
      }
      isResend = true;
    }

    imageUpload = await uploadMenuImage(payload.image);
    const photoUrl = imageUpload.publicUrl;
    const dailyMenu = await saveDailyMenu(adminClient, menu, photoUrl, req.user.id);
    menuSaved = true;
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
      throw new Error(`n8n respondio ${response.status}: ${responseText}`);
    }

    res.status(202).json({
      mensaje: 'Flujo de Telegram disparado correctamente.',
      webhookStatus: response.status,
      dailyMenu,
      photoUrl,
      cleanup,
      reenvio: isResend,
    });
  } catch (error) {
    if (!menuSaved && adminClient && imageUpload?.path) {
      await removeUploadedMenuImage(adminClient, imageUpload);
    }
    console.error('Error disparando flujo de menu en n8n:', error);
    if (sendValidationError(res, error)) return;
    res.status(error.status || 500).json({
      error: error.message || 'No se pudo disparar el flujo de Telegram.',
    });
  }
});

const hasCompleteMenu = (payload) => {
  const sopas = cleanOptions(payload?.sopas);
  const segundos = cleanOptions(payload?.segundos);
  const guarniciones = cleanOptions(payload?.guarniciones);
  return sopas.length > 0 && segundos.length > 0 && guarniciones.length > 0;
};

const menuPayloadEquals = (a, b) => {
  const keys = ['sopas', 'segundos', 'guarniciones'];
  return keys.every((key) => {
    const left = cleanOptions(a?.[key]);
    const right = cleanOptions(b?.[key]);
    return left.length === right.length && left.every((v, i) => v === right[i]);
  });
};

const validateMenuImageInput = (image, opts = {}) => {
  if (opts.required && (image === null || image === undefined)) {
    throw new Error('La imagen del menu es obligatoria');
  }
  if (typeof image === 'string') {
    if (/^http:\/\//i.test(image)) {
      throw new Error('La URL publica de imagen del menu debe usar HTTPS');
    }
    if (/^data:image\//.test(image)) {
      const match = image.match(/^data:image\/(?:png|jpe?g|webp);base64,(.+)$/i);
      if (!match) {
        throw new Error('La imagen del menu debe ser JPG, PNG o WebP valida');
      }
      const buffer = Buffer.from(match[1], 'base64');
      const mimeType = match[0].toLowerCase().includes('png')
        ? 'image/png'
        : match[0].toLowerCase().includes('webp')
          ? 'image/webp'
          : 'image/jpeg';
      if (!hasAllowedImageSignature(buffer, mimeType)) {
        throw new Error('La imagen del menu debe ser JPG, PNG o WebP valida');
      }
    }
  }
  return true;
};

module.exports = router;
module.exports._private = {
  groupMenuRows,
  removeUploadedMenuImage,
  saveDailyMenu,
  makeSquareWithBlurredBackground,
  hasCompleteMenu,
  menuPayloadEquals,
  validateMenuImageInput,
};
