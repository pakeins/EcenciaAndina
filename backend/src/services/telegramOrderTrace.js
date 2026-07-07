const { getAdminClient } = require('../config/supabase');

const MAX_ERROR_LENGTH = 1000;
const MAX_JSON_LENGTH = 16000;
const ALLOWED_OUTCOMES = new Set(['received', 'pending', 'success', 'failed', 'rejected']);

const truncate = (value, maxLength) => {
  const text = String(value || '');
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 3)}...`;
};

const boundedJson = (value) => {
  const source = value && typeof value === 'object' ? value : {};
  const serialized = JSON.stringify(source);
  if (serialized.length <= MAX_JSON_LENGTH) return source;

  return {
    truncated: true,
    summary: truncate(serialized, MAX_JSON_LENGTH),
  };
};

const buildOriginalMessage = (update) => ({
  type: update.isCallback ? 'callback' : update.contactPhone ? 'contact' : 'text',
  callbackAction: update.isCallback ? truncate(String(update.text || '').split(':')[0], 32) : null,
  messageId: update.messageId || null,
  hasContact: Boolean(update.contactPhone),
  contactVerified: Boolean(update.contactVerified),
  receivedAt: new Date().toISOString(),
});
const IMPORTANT_ACTIONS = new Set(['pedir', 'confirmar', 'cancelar', 'estado', 'menu']);

const createOrderTrace = async (update, context = {}, createClient = getAdminClient) => {
  try {
    // Evitar llenar la base de datos con clics intermedios
    if (update.isCallback) {
      const action = String(update.text || '').split(':')[0];
      if (!IMPORTANT_ACTIONS.has(action)) {
        return ''; // Se ignora silenciosamente
      }
    }

    const { data, error } = await createClient()
      .from('telegram_order_traces')
      .insert({
        chat_id: update.chatId || null,
        update_id: update.updateId || null,
        id_cliente: context.clientId || null,
        subscription_id: context.subscriptionId || null,
        original_message: buildOriginalMessage(update),
        outcome: 'received',
      })
      .select('id')
      .single();

    if (error) throw error;
    return data?.id || '';
  } catch (error) {
    console.warn('No se pudo iniciar la trazabilidad Telegram:', error.message);
    return '';
  }
};

const updateOrderTrace = async (traceId, patch, createClient = getAdminClient) => {
  if (!traceId) return false;

  const payload = {
    ...(patch.id_cliente ? { id_cliente: patch.id_cliente } : {}),
    ...(patch.id_orden ? { id_orden: patch.id_orden } : {}),
    ...(patch.subscription_id ? { subscription_id: patch.subscription_id } : {}),
    ...(patch.interpreted_payload
      ? { interpreted_payload: boundedJson(patch.interpreted_payload) }
      : {}),
    ...(ALLOWED_OUTCOMES.has(patch.outcome) ? { outcome: patch.outcome } : {}),
    error_message: patch.error_message ? truncate(patch.error_message, MAX_ERROR_LENGTH) : null,
  };

  try {
    const { error } = await createClient()
      .from('telegram_order_traces')
      .update(payload)
      .eq('id', traceId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.warn('No se pudo actualizar la trazabilidad Telegram:', error.message);
    return false;
  }
};

module.exports = {
  createOrderTrace,
  updateOrderTrace,
  _private: {
    boundedJson,
    buildOriginalMessage,
    truncate,
  },
};
