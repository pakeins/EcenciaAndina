const supabase = require('../config/supabase');
const { getConsentVersion, privacyText } = require('./telegramConsent');
const { normalizePhone } = require('../validation/ecencia');

const stateKey = (chatId) => `session:${chatId}`;

const consentKey = (chatId) => `consent:${chatId}`;

const getState = async (key) => {
  const { data, error } = await supabase.getAdminClient()
    .from('telegram_bot_state')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  if (error) throw error;
  return data?.value || null;
};

const setState = async (key, value) => {
  const { error } = await supabase.getAdminClient()
    .from('telegram_bot_state')
    .upsert(
      { key, value: { ...(value || {}), updatedAt: new Date().toISOString() } },
      { onConflict: 'key' },
    );
  if (error) throw error;
};

const deleteState = async (key) => {
  const { error } = await supabase.getAdminClient().from('telegram_bot_state').delete().eq('key', key);
  if (error) throw error;
};

const deleteChatStates = async (chatId) => {
  await Promise.all([deleteState(stateKey(chatId)), deleteState(consentKey(chatId))]);
};

const getSubscriptionByChat = async (chatId) => {
  const { data, error } = await supabase.getAdminClient()
    .from('telegram_subscriptions')
    .select('*')
    .eq('chat_id', String(chatId))
    .maybeSingle();
  if (error) throw error;
  return data || null;
};

const getSubscriptionByClient = async (idCliente) => {
  if (!idCliente) return null;
  const { data, error } = await supabase.getAdminClient()
    .from('telegram_subscriptions')
    .select('*')
    .eq('id_cliente', idCliente)
    .maybeSingle();
  if (error) throw error;
  return data || null;
};

const getSubscriptionByPhone = async (phone) => {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  const { data, error } = await supabase.getAdminClient()
    .from('telegram_subscriptions')
    .select('*')
    .eq('phone_normalized', normalized)
    .maybeSingle();
  if (error) throw error;
  return data || null;
};

const getClientById = async (id) => {
  const { data, error } = await supabase.getAdminClient()
    .from('clientes')
    .select(
      'id_cliente,cedula,nombre,apellido,telefono,esta_activo,clientes_convenios(id_convenio,convenios(id_convenio,nombre_empresa,esta_activo,fecha_caducidad,tipos_almuerzo_permitidos))',
    )
    .eq('id_cliente', id)
    .maybeSingle();
  if (error) throw error;
  return data || null;
};

const ensurePendingSubscription = async (
  { idCliente, chatId, telegramUserId, telegramUsername },
) => {
  const [byClient, byChat] = await Promise.all([
    getSubscriptionByClient(idCliente),
    getSubscriptionByChat(chatId),
  ]);

  if (byClient && byChat && byClient.id !== byChat.id) {
    const error = new Error('El chat o cliente ya esta vinculado a otra suscripcion.');
    error.status = 409;
    throw error;
  }
  if (byChat?.id_cliente && byChat.id_cliente !== idCliente) {
    const error = new Error('Este chat ya pertenece a otro cliente.');
    error.status = 409;
    throw error;
  }
  if (byClient?.chat_id && String(byClient.chat_id) !== String(chatId)) {
    const error = new Error('El cliente ya esta vinculado a otro chat.');
    error.status = 409;
    throw error;
  }

  const payload = {
    id_cliente: idCliente,
    chat_id: String(chatId),
    telegram_user_id: telegramUserId ? String(telegramUserId) : null,
    telegram_username: telegramUsername || null,
    consent_status: 'pending',
    is_active: false,
    consent_notice_version: getConsentVersion(),
    consent_notice_text: privacyText(),
    consent_method: null,
    accepted_at: null,
    rejected_at: null,
    revoked_at: null,
    deletion_requested_at: null,
  };

  const existing = byClient || byChat;
  if (existing) {
    const { data, error } = await supabase.getAdminClient()
      .from('telegram_subscriptions')
      .update(payload)
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase.getAdminClient()
      .from('telegram_subscriptions')
      .insert(payload)
      .select()
      .single();
  if (error) throw error;
  return data;
};

module.exports = { stateKey, consentKey, getState, setState, deleteState, deleteChatStates, getSubscriptionByChat, getSubscriptionByClient, getSubscriptionByPhone, getClientById, ensurePendingSubscription };