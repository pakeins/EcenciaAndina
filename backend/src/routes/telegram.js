/* eslint-disable no-unused-vars */
const express = require('express');
const crypto = require('node:crypto');
const { getAdminClient } = require('../config/supabase');
const { normalizePhone } = require('../validation/ecencia');
const { createOrderTrace, updateOrderTrace } = require('../services/telegramOrderTrace');

const {
  handleTelegramUpdate,
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
  getPrivacySettings,
  privacyText,
  telegramRequest,
  activeProcessing,
  getClientById,
  findActiveTodayOrder,
  getOrderDetail,
  getEstadoName,
  buildOrderSummaryMessage,
  pedidoKeyboard,
  todayInTimezone,
  buildPedidoMessage,
  promptMenu,
  setState,
  stateKey,
  menuCaption,
  tipoAlmuerzoKeyboard,
  getActiveMenu,
  getProduct,
  getLookupId,
  ESTADO_RESERVADO_NOMBRE,
} = require('../services/telegramService');

const router = express.Router();

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
    console.error('Payload causante:', JSON.stringify(req.body)); // NOSONAR
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
    const receivedSecret = req.headers['x-ecencia-webhook-secret'] || req.headers['X-Ecencia-Webhook-Secret'];
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
    
    const photoUrl = payload.image || payload.photoUrl || activeMenuState?.photoUrl || process.env.N8N_ECENCIA_MENU_IMAGE_URL || 'https://lkffhdcavohaxdihvwlb.supabase.co/storage/v1/object/public/ecencia-menu-assets/telegram/ecencia-menu-demo.png';
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
      const sid = String(Date.now()) + crypto.randomInt(0, 1000);
      
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
        inlineKeyboard: tipoAlmuerzoKeyboard(sid, convenio.tipos_almuerzo_permitidos),
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
