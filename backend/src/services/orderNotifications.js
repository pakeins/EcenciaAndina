const { sendMessage: sendTelegramMessage } = require('./telegramMicroservice');

const ORDER_STATE = {
  RESERVED: 1,
  CONSUMED: 2,
  CANCELLED: 3,
};

const NOTIFICATION_STATUS = {
  SENT: 'sent',
  SKIPPED_NO_SUBSCRIPTION: 'skipped_no_subscription',
  FAILED: 'failed',
};

const MAX_ERROR_LENGTH = 1000;

const truncate = (value, maxLength = MAX_ERROR_LENGTH) => {
  const text = String(value || '');
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 3)}...`;
};

const notificationKindForState = (state) => {
  const nextState = Number(state);
  if (nextState === ORDER_STATE.CONSUMED) return 'order_consumed';
  if (nextState === ORDER_STATE.CANCELLED) return 'order_cancelled';
  return '';
};

const buildOrderStatusMessage = ({ idOrden, nextState, reason }) => {
  const suffix = `\n\nOrden: ${idOrden}`;

  if (Number(nextState) === ORDER_STATE.CONSUMED) {
    return `Tu pedido fue marcado como consumido.${suffix}\nGracias por preferir Ecencia Andina.`;
  }

  if (reason === 'service_closed') {
    return (
      'Se termino el horario de servicio de almuerzos. ' +
      `Tu reserva fue cancelada automaticamente.${suffix}`
    );
  }

  return `Tu pedido fue cancelado.${suffix}`;
};

const findAcceptedTelegramSubscription = async (adminClient, idCliente) => {
  if (!idCliente) return null;

  let query = adminClient
    .from('telegram_subscriptions')
    .select('id,id_cliente,chat_id,consent_status,is_active')
    .eq('id_cliente', idCliente)
    .eq('consent_status', 'accepted')
    .eq('is_active', true);

  if (typeof query.not === 'function') query = query.not('chat_id', 'is', null);
  if (typeof query.limit === 'function') query = query.limit(1);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data?.chat_id) return null;
  return data;
};

const auditOrderNotification = async (adminClient, payload) => {
  try {
    const { error } = await adminClient.from('orden_notificacion_auditoria').insert([payload]);
    if (error) throw error;
  } catch (error) {
    console.warn('No se pudo registrar auditoria de notificacion de pedido:', error.message);
  }
};

const notifyOrderStatusChange = async (adminClient, params, options = {}) => {
  const kind = notificationKindForState(params.nextState);
  if (!kind) return null;

  const baseAudit = {
    id_orden: params.idOrden,
    id_cliente: params.idCliente || null,
    notification_kind: kind,
    channel: 'telegram',
    status: NOTIFICATION_STATUS.FAILED,
    reason: params.reason || null,
    created_by: params.createdBy || null,
  };

  let subscription = null;
  try {
    subscription = await findAcceptedTelegramSubscription(adminClient, params.idCliente);
  } catch (error) {
    const result = {
      status: NOTIFICATION_STATUS.FAILED,
      channel: 'telegram',
      error: truncate(error.message),
    };
    await auditOrderNotification(adminClient, {
      ...baseAudit,
      status: result.status,
      error_message: result.error,
    });
    return result;
  }

  if (!subscription) {
    const result = {
      status: NOTIFICATION_STATUS.SKIPPED_NO_SUBSCRIPTION,
      channel: 'telegram',
    };
    await auditOrderNotification(adminClient, {
      ...baseAudit,
      status: result.status,
    });
    return result;
  }

  const text = buildOrderStatusMessage(params);
  try {
    const response = await sendTelegramMessage(subscription.chat_id, text, undefined, {
      fetchImpl: options.fetchImpl,
      token: options.token,
      apiBase: options.apiBase,
    });

    const result = {
      status: NOTIFICATION_STATUS.SENT,
      channel: 'telegram',
      subscriptionId: subscription.id,
      telegramMessageId: response?.result?.message_id || null,
    };

    await auditOrderNotification(adminClient, {
      ...baseAudit,
      status: result.status,
      subscription_id: subscription.id,
      chat_id: String(subscription.chat_id),
      telegram_message_id: result.telegramMessageId,
    });
    return result;
  } catch (error) {
    const result = {
      status: NOTIFICATION_STATUS.FAILED,
      channel: 'telegram',
      subscriptionId: subscription.id,
      error: truncate(error.message),
    };
    await auditOrderNotification(adminClient, {
      ...baseAudit,
      status: result.status,
      subscription_id: subscription.id,
      chat_id: String(subscription.chat_id),
      error_message: result.error,
    });
    return result;
  }
};

module.exports = {
  NOTIFICATION_STATUS,
  ORDER_STATE,
  auditOrderNotification,
  buildOrderStatusMessage,
  findAcceptedTelegramSubscription,
  notifyOrderStatusChange,
};
