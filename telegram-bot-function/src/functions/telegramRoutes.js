const { getSubscriptionByChat, getClientById, beginConsent, acceptConsent, rejectConsent, validateAndSaveContact, handleStartInvitation, requestPolicyReconsent, handlePrivacyCommand } = require('../handlers/telegramPrivacyHandler');
const { handleAcceptedSession, promptMenu, handlePedidoCallback, findActiveTodayOrder, getOrderDetail } = require('../handlers/telegramOrderHandler');
const { createOrderTrace, updateOrderTrace } = require('../services/telegramOrderTrace');
const { hasCurrentConsent } = require('../services/telegramConsent');
const { answerCallback, deleteMessage, removeInlineKeyboard, sendMessage } = require('../services/telegramApi');
const { todayInTimezone, isBusinessDay } = require('../utils/telegramHelpers');
const { contactKeyboard, pedidoKeyboard } = require('../ui/telegramKeyboards');
const telegramState = require('../services/telegramState');
const { buildPedidoMessage, buildOrderSummaryMessage } = require('../ui/telegramKeyboards');

const activeProcessing = new Set();

const normalizeText = (value) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const readUpdate = (update) => {
  if (update.callback_query) {
    return {
      chatId: String(update.callback_query.message.chat.id),
      messageId: update.callback_query.message.message_id,
      text: update.callback_query.data,
      telegramUserId: update.callback_query.from.id,
      telegramUsername: update.callback_query.from.username,
      isCallback: true,
      callbackId: update.callback_query.id,
    };
  }
  if (update.message) {
    return {
      chatId: String(update.message.chat.id),
      messageId: update.message.message_id,
      text: update.message.text || '',
      contactPhone: update.message.contact?.phone_number,
      telegramUserId: update.message.from.id,
      telegramUsername: update.message.from.username,
      isCallback: false,
    };
  }
  return {};
};

const parseStartToken = (text) => {
  const t = String(text || '').trim();
  if (!t.startsWith('/start')) return null;
  const parts = t.split(' ');
  return { isStart: true, token: parts[1] || null };
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
    if (subscription?.id_cliente) {
      const client = await getClientById(subscription.id_cliente);
      if (client && client.esta_activo === false) {
        await sendMessage(
          parsed.chatId, 
          '🚫 <b>Cuenta Desactivada</b>\n\nTu cuenta en Ecencia Andina se encuentra desactivada. No puedes iniciar el registro ni realizar reservas. Si crees que es un error, por favor contacta a la administración.',
          null,
          'HTML'
        );
        return;
      }
    }

    if (hasCurrentConsent(subscription)) {
      await sendMessage(
        parsed.chatId, 
        '✅ <b>¡Ya estas suscrito!</b>\n\nRecibiras el menu cuando Ecencia Andina lo envie.\nUsa /menu para reservar o /ayuda para ver comandos.',
        null,
        'HTML'
      );
      return;
    }
    if (subscription?.consent_status === 'pending' && subscription.id_cliente) {
      await beginConsent({
        idCliente: subscription.id_cliente,
        chatId: parsed.chatId,
        telegramUserId: parsed.telegramUserId,
        telegramUsername: parsed.telegramUsername,
      });
      return;
    }
    if (['rejected', 'revoked'].includes(subscription?.consent_status)) {
      await sendMessage(
        parsed.chatId, 
        '🚫 <b>Suscripcion Bloqueada</b>\n\nActualmente no cuentas con una suscripcion. Por favor, acercate a Ecencia Andina para poderte ayudar.',
        null,
        'HTML'
      );
      return;
    }
    // Sin suscripcion previa: iniciar el flujo de consentimiento directamente
    await beginConsent({
      idCliente: subscription?.id_cliente || null,
      chatId: parsed.chatId,
      telegramUserId: parsed.telegramUserId,
      telegramUsername: parsed.telegramUsername,
    });
    return;
  }

  const consentState = await telegramState.getState(telegramState.consentKey(parsed.chatId));
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

  if (['rejected', 'revoked'].includes(subscription?.consent_status)) {
    if (['/menu', '/pedido', '/cancelar'].includes(command)) {
      await sendMessage(
        parsed.chatId,
        '🚫 <b>Suscripcion Bloqueada</b>\n\nTu acceso ha sido revocado. Por favor, acercate a Ecencia Andina si deseas reactivar tu suscripcion.',
        null,
        'HTML'
      );
    }
    return;
  }
  if (subscription?.consent_status === 'pending') {
    if (consentState?.status === 'accepted_pending_phone') {
      // El usuario aun no ha compartido su telefono — re-solicitar el boton de contacto
      if (!parsed.isCallback) await deleteMessage(parsed.chatId, parsed.messageId);
      await sendMessage(
        parsed.chatId,
        '📲 <b>¡Casi listo!</b>\n\nAun necesitamos verificar tu usuario. Por favor, presiona el boton <b>"Compartir mi telefono"</b> que aparece en el teclado inferior.\n\n<i>(Si no ves el boton en la parte inferior, busca en la barra inferior el icono de un cuadrado para compartir tu numero).</i>',
        contactKeyboard(),
        'HTML'
      );
      return;
    }
    if (!parsed.isCallback) await deleteMessage(parsed.chatId, parsed.messageId);
    await sendMessage(parsed.chatId, 'Completa el consentimiento usando los botones visibles.');
    return;
  }

  if (command === '/cancelar' || parsed.text === 'confirm:cancel') {
    await telegramState.deleteState(telegramState.stateKey(parsed.chatId));
    if (parsed.isCallback && parsed.messageId) {
      await removeInlineKeyboard(parsed.chatId, parsed.messageId);
    }
    if (hasCurrentConsent(subscription)) {
      await sendMessage(parsed.chatId, 'La seleccion fue cancelada. Usa /menu para comenzar de nuevo.');
    }
    return;
  }

  if (command === '/pedido') {
    if (!hasCurrentConsent(subscription)) {
      await sendMessage(parsed.chatId, '⚠️ Tu cuenta no está activa o no has aceptado los términos de privacidad. Por favor completa el registro con tu enlace de invitación o contacta al administrador.');
      return;
    }
    const today = todayInTimezone();
    const todayOrder = await findActiveTodayOrder(subscription.id_cliente);
    if (!todayOrder) {
      await sendMessage(parsed.chatId, 'No tienes una reserva registrada hoy. Usa /menu para reservar.');
      return;
    }
    const detail = await getOrderDetail(todayOrder.id_orden);
    await sendMessage(parsed.chatId, buildPedidoMessage(todayOrder, detail), pedidoKeyboard(todayOrder.id_orden), 'HTML');
    return;
  }

  if (command === '/menu') {
    if (!hasCurrentConsent(subscription)) {
      await sendMessage(parsed.chatId, '⚠️ Tu cuenta no está activa o no has aceptado los términos de privacidad. Por favor completa el registro con tu enlace de invitación o contacta al administrador.');
      return;
    }
    if (!isBusinessDay()) {
      await sendMessage(parsed.chatId, 'El servicio de reservas esta disponible de lunes a viernes. Vuelve el proximo dia habil.');
      return;
    }
    const client = await getClientById(subscription.id_cliente);
    if (!client?.esta_activo) {
      await sendMessage(parsed.chatId, 'El cliente vinculado no esta activo. Contacta al administrador.');
      return;
    }
    // Si ya tiene reserva activa hoy, mostrarla en lugar de iniciar nueva
    const todayOrder = await findActiveTodayOrder(subscription.id_cliente);
    if (todayOrder && todayOrder.id_estado === 1) {
      await telegramState.deleteState(telegramState.stateKey(parsed.chatId));
      const detail = await getOrderDetail(todayOrder.id_orden);
      todayOrder._estadoNombre = 'Reservado'; // O se puede obtener dinámicamente
      await sendMessage(parsed.chatId, buildOrderSummaryMessage(todayOrder, detail), pedidoKeyboard(todayOrder.id_orden), 'HTML');
      return;
    }
    await promptMenu(parsed.chatId, client);
    return;
  }

  if (!hasCurrentConsent(subscription)) return;

  // Callbacks de gestion de pedido (pedido:can, pedido:mod, etc.)
  if (parsed.isCallback && String(parsed.text).startsWith('pedido:')) {
    await handlePedidoCallback(parsed, subscription);
    return;
  }

  const traceId = await createOrderTrace(parsed, {
    clientId: subscription.id_cliente,
    subscriptionId: subscription.id,
  });
  if (activeProcessing.has(parsed.chatId)) {
    console.warn(`[Telegram] Ignorando callback concurrente (race condition) para chat ${parsed.chatId}`); // NOSONAR
    return;
  }
  activeProcessing.add(parsed.chatId);
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
  } finally {
    activeProcessing.delete(parsed.chatId);
  }
};

module.exports.handleTelegramUpdate = handleTelegramUpdate;
module.exports._private = {
  parseStartToken,
  readUpdate,
};
