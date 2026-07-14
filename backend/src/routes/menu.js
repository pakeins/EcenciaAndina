const express = require('express');
const crypto = require('crypto');
const sharp = require('sharp');
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const { getAdminClient } = require('../config/supabase');
const { parseBody, schemas, sendValidationError } = require('../validation/ecencia');
const menuImageCleanup = require('../services/menuImageCleanup');
const { findOrCreateFood } = require('../services/menuCatalog');

const router = express.Router();

const DEFAULT_N8N_MENU_WEBHOOK_URL = 'https://localhost:7000/webhook/ecencia-enviar-menu-manual';
const MENU_ASSETS_BUCKET = 'ecencia-menu-assets';
const TIMEZONE = 'America/Bogota';
const DEFAULT_IMAGE_RETENTION_DAYS = 14;
const MAX_MENU_IMAGE_BYTES = 5 * 1024 * 1024;
const LOCAL_WEBHOOK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

const menuService = require('../services/menuService');
const {
  cleanOptions,
  normalizeText,
  todayInTimezone,
  buildMenuOpciones,
  deriveLegacyMenu,
  cleanClientIds,
  getN8nMenuWebhookUrl,
  isIsoDate,
  mimeToExtension,
  hasAllowedImageSignature,
  makeSquareWithBlurredBackground,
  uploadMenuImage,
  removeUploadedMenuImage,
  getMenuSettings,
  buildActiveMenuPayload,
  saveActiveMenuState,
  menuRowSelect,
  groupMenuRows,
  getCategoryIds,
  hasRequiredCategories,
  ensureAlimento,
  addLegacyFields,
  fetchMenus,
  getMenuByDate,
  saveDailyMenu,
  secureEquals,
  hasCompleteMenu,
  menuPayloadEquals,
  validateMenuImageInput
} = menuService;

const cancelOrdersForMenuCorrection = async (adminClient, today) => {
  const startOfDay = new Date(`${today}T00:00:00-05:00`).toISOString();
  const endOfDay = new Date(`${today}T23:59:59.999-05:00`).toISOString();

  const { data: ordenesParaCancelar } = await adminClient
    .from('ordenes')
    .select('id_orden, id_cliente')
    .eq('id_origen', 1)
    .gte('created_at', startOfDay)
    .lte('created_at', endOfDay)
    .neq('id_estado', 3);

  let cancelledChatIds = [];
  if (ordenesParaCancelar && ordenesParaCancelar.length > 0) {
    const idOrdenes = ordenesParaCancelar.map((o) => o.id_orden);
    const idClientes = [...new Set(ordenesParaCancelar.map((o) => o.id_cliente).filter(Boolean))];

    await adminClient
      .from('ordenes')
      .update({ id_estado: 3, observaciones: 'Cancelado automáticamente por corrección de menú' })
      .in('id_orden', idOrdenes);

    if (idClientes.length > 0) {
      const { data: subs } = await adminClient
        .from('telegram_subscriptions')
        .select('chat_id')
        .in('id_cliente', idClientes)
        .eq('is_active', true);
      if (subs) {
        cancelledChatIds = subs.map((s) => s.chat_id).filter(Boolean);
      }
    }
  }
  return cancelledChatIds;
};
const requireN8nCleanupSecret = (req, res, next) => {
  const expectedSecret = process.env.N8N_MENU_WEBHOOK_SECRET;
  if (!expectedSecret) {
    return res.status(503).json({ error: 'La limpieza programada no esta configurada.' });
  }

  const receivedSecret = req.get('X-Ecencia-Webhook-Secret');
  if (!secureEquals(receivedSecret, expectedSecret)) {
    return res.status(401).json({ error: 'Limpieza programada no autorizada.' });
  }

  next();
};

const runImageCleanup = async (_req, res) => {
  try {
    const adminClient = getAdminClient();
    const result = await menuImageCleanup.cleanupOldMenuImages(adminClient);
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
  res.json({ editAfterSend: !!process.env.ECENCIA_MENU_EDIT_AFTER_SEND });
});

router.get('/', async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const categories = await getCategoryIds(adminClient);
    const menus = await fetchMenus(adminClient, null, categories);
    res.json({ menus, categories });
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
    const opciones = buildMenuOpciones(payload);
    adminClient = getAdminClient();
    const categories = await getCategoryIds(adminClient);

    if (!hasRequiredCategories(opciones, categories)) {
      return res.status(400).json({
        error: 'Debe haber al menos una sopa y un segundo configurados.',
      });
    }

    const { data: envioExistente } = await adminClient
      .from('menu_envios')
      .select('fecha,last_sent_at')
      .eq('fecha', fecha)
      .maybeSingle();

    if (envioExistente && !process.env.ECENCIA_MENU_EDIT_AFTER_SEND) {
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
    const dailyMenu = await saveDailyMenu(adminClient, opciones, photoUrl, req.user.id, fecha);
    menuSaved = true;

    if (settings.active_date === fecha) {
      await saveActiveMenuState(adminClient, fecha, opciones, categories, photoUrl, req.user.id);
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

    const categories = await getCategoryIds(adminClient);
    if (!hasRequiredCategories(menu.opciones, categories)) {
      return res.status(400).json({ error: 'El menu debe tener al menos sopa y segundo para activarse.' });
    }

    await saveActiveMenuState(
      adminClient,
      fecha,
      menu.opciones,
      categories,
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
    adminClient = getAdminClient();
    const categories = await getCategoryIds(adminClient);
    const opciones = buildMenuOpciones(payload);

    if (!hasRequiredCategories(opciones, categories)) {
      return res.status(400).json({
        error: 'Debe haber al menos una sopa y un segundo configurados.',
      });
    }

    const today = todayInTimezone();
    const { data: envioHoy } = await adminClient
      .from('menu_envios')
      .select('fecha,last_sent_at,menu_payload,send_count')
      .eq('fecha', today)
      .maybeSingle();

    let isMenuDifferent = true;
    if (envioHoy) {
      isMenuDifferent = !menuPayloadEquals(payload, envioHoy.menu_payload);

      if (isMenuDifferent && !payload.force && !process.env.ECENCIA_MENU_EDIT_AFTER_SEND) {
        return res.status(409).json({
          error: 'Ya se envio un menu diferente hoy. ¿Deseas reenviarlo y cancelar los pedidos de Telegram actuales?',
          code: 'ALREADY_SENT_CONFIRM_REQUIRED',
          sentAt: envioHoy.last_sent_at,
        });
      }
      isResend = true;
    }

    imageUpload = await uploadMenuImage(payload.image);
    const photoUrl = imageUpload.publicUrl;
    const dailyMenu = await saveDailyMenu(adminClient, opciones, photoUrl, req.user.id);
    menuSaved = true;
    await saveActiveMenuState(adminClient, dailyMenu.fecha, opciones, categories, photoUrl, req.user.id);
    const cleanup = await menuImageCleanup.cleanupOldMenuImages(adminClient);
    const webhookUrl = getN8nMenuWebhookUrl();
    const clientIds = cleanClientIds(payload.clientIds);

    const legacyMenu = deriveLegacyMenu(opciones, categories);
    const menuPayload = {
      opciones,
      entradas: legacyMenu.entradas,
      sopas: legacyMenu.sopas,
      segundos: legacyMenu.segundos,
      postres: legacyMenu.postres,
      bebidas: legacyMenu.bebidas,
      guarniciones: legacyMenu.guarniciones,
    };

    let cancelledChatIds = [];
    if (isResend && isMenuDifferent) {
      cancelledChatIds = await cancelOrdersForMenuCorrection(adminClient, today);
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.N8N_MENU_WEBHOOK_SECRET
          ? { 'X-Ecencia-Webhook-Secret': process.env.N8N_MENU_WEBHOOK_SECRET }
          : {}),
      },
      body: JSON.stringify({
        source: 'dashboard',
        requestedBy: {
          id: req.user.id,
          email: req.user.email,
          rol: req.user.rol,
        },
        menu: menuPayload,
        photoUrl,
        clientIds,
        isCorrection: isResend,
        cancelledChatIds,
      }),
    });

    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(`n8n respondio ${response.status}: ${responseText}`);
    }

    // Registrar o actualizar el envío en menu_envios
    const { error: upsertError } = await adminClient
      .from('menu_envios')
      .upsert({
        fecha: today,
        last_sent_at: new Date().toISOString(),
        send_count: isResend ? (envioHoy.send_count || 1) + 1 : 1,
        image_url: photoUrl,
        menu_payload: menuPayload,
      }, { onConflict: 'fecha' });

    if (upsertError) {
      console.error('Error al registrar envio en menu_envios:', upsertError);
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


module.exports = router;
module.exports._private = { ...menuService };
