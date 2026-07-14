const express = require('express');
const crypto = require('crypto');
const { getAdminClient } = require('../config/supabase');

const router = express.Router();

const TIMEZONE = 'America/Bogota';

// ─── Helpers ────────────────────────────────────────────────────────────────

const secureEquals = (left, right) => {
  const l = Buffer.from(String(left || ''));
  const r = Buffer.from(String(right || ''));
  return l.length === r.length && crypto.timingSafeEqual(l, r);
};

/**
 * Middleware: verifica el secreto interno entre n8n y el backend.
 * Usa la misma variable N8N_MENU_WEBHOOK_SECRET que el resto del sistema.
 */
const requireWebhookSecret = (req, res, next) => {
  const expectedSecret = process.env.N8N_MENU_WEBHOOK_SECRET;
  if (!expectedSecret) {
    return res.status(503).json({ error: 'El endpoint de broadcast no está configurado (falta N8N_MENU_WEBHOOK_SECRET).' });
  }
  // Accept both header variants: the n8n workflow uses "X-Eciencia-Webhook-Secret"
  // while the backend/dashboard uses "X-Ecencia-Webhook-Secret"
  const provided = req.get('X-Ecencia-Webhook-Secret') || req.get('X-Eciencia-Webhook-Secret');
  if (!secureEquals(provided, expectedSecret)) {
    console.error('[broadcast-sessions] 401 Unauthorized. Received secret does not match.');
    return res.status(401).json({ error: 'Acceso no autorizado al endpoint de broadcast.' });
  }
  next();
};

/**
 * Construye el caption HTML del menú para Telegram.
 */
const buildMenuCaption = (menu = {}) => {
  const lines = ['🍽️ <b>Menú del Día</b>'];

  const addSection = (emoji, label, items) => {
    if (Array.isArray(items) && items.length > 0) {
      lines.push(`\n${emoji} <b>${label}:</b>`);
      items.forEach((item) => lines.push(`• ${item}`));
    }
  };

  addSection('🥗', 'Entradas', menu.entradas);
  addSection('🍲', 'Sopas', menu.sopas);
  addSection('🍛', 'Segundos', menu.segundos);
  addSection('🥦', 'Guarniciones', menu.guarniciones);
  addSection('🧃', 'Bebidas', menu.bebidas);
  addSection('🍮', 'Postres', menu.postres);

  lines.push('\n¡Que disfrutes tu almuerzo! 😊');
  return lines.join('\n');
};

/**
 * Construye el teclado inline de Telegram para hacer el pedido.
 */
const buildInlineKeyboard = () => ({
  inline_keyboard: [
    [{ text: '📋 Hacer mi pedido', callback_data: 'hacer_pedido' }],
  ],
});

// ─── Endpoint principal ──────────────────────────────────────────────────────

/**
 * POST /api/telegram/broadcast-sessions
 *
 * Recibe el payload de envío de menú desde n8n y devuelve la lista de sesiones
 * (una por suscriptor activo) que n8n usará para enviar la foto del menú.
 *
 * Body esperado (viene del webhook del dashboard via n8n):
 * {
 *   menu: { sopas, segundos, entradas, guarniciones, bebidas, postres },
 *   photoUrl: string,
 *   clientIds: string[],          // opcional: filtrar sólo estos clientes
 *   cancelledChatIds: string[],   // opcional: chats a los que avisar cancelación
 * }
 *
 * Respuesta: array de objetos con forma:
 * { chatId, photoUrl, caption, inlineKeyboard, subscriptionId }
 */
router.post('/broadcast-sessions', requireWebhookSecret, async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const { menu = {}, photoUrl, clientIds = [], cancelledChatIds = [] } = req.body || {};

    // 1. Consultar suscripciones activas con consentimiento aceptado
    let query = adminClient
      .from('telegram_subscriptions')
      .select('id, chat_id, id_cliente')
      .eq('is_active', true)
      .eq('consent_status', 'accepted')
      .not('chat_id', 'is', null);

    // Si el dashboard envió una lista específica de clientes, filtrar por ellos
    if (Array.isArray(clientIds) && clientIds.length > 0) {
      query = query.in('id_cliente', clientIds);
    }

    const { data: subscriptions, error } = await query;
    if (error) throw error;

    const caption = buildMenuCaption(menu);
    const inlineKeyboard = buildInlineKeyboard();

    // 2. Armar las sesiones de envío (una por suscriptor)
    const sessions = (subscriptions || []).map((sub) => ({
      chatId: sub.chat_id,
      photoUrl: photoUrl || null,
      caption,
      inlineKeyboard,
      subscriptionId: sub.id,
      isCancellation: false,
    }));

    // 3. Si hay chats de pedidos cancelados, agregar sesiones de aviso de cancelación
    const cancelledSet = new Set(
      (cancelledChatIds || []).map((id) => String(id)).filter(Boolean),
    );
    if (cancelledSet.size > 0) {
      const cancelledSubs = (subscriptions || []).filter((sub) =>
        cancelledSet.has(String(sub.chat_id)),
      );
      for (const sub of cancelledSubs) {
        sessions.push({
          chatId: sub.chat_id,
          photoUrl: null,
          caption:
            '⚠️ <b>Tu pedido fue cancelado</b>\n\nSe realizó una corrección al menú de hoy. Tu pedido anterior fue cancelado automáticamente.\n\nPuedes hacer un nuevo pedido con el menú actualizado.',
          inlineKeyboard: buildInlineKeyboard(),
          subscriptionId: sub.id,
          isCancellation: true,
        });
      }
    }

    // Registrar en los logs cuántas sesiones se prepararon
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    console.log(
      `[Telegram Broadcast] ${today}: ${sessions.length} sesiones preparadas` +
        ` (${subscriptions?.length ?? 0} suscriptores, ${cancelledSet.size} cancelaciones).`,
    );

    return res.json(sessions);
  } catch (error) {
    console.error('[Telegram Broadcast] Error preparando sesiones:', error);
    return res.status(500).json({
      error: error.message || 'No se pudieron preparar las sesiones de broadcast.',
    });
  }
});

module.exports = router;
