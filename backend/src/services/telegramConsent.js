const crypto = require('crypto');
const { getAdminClient } = require('../config/supabase');
const fs = require('fs');
const path = require('path');

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const REQUIRED_TELEGRAM_ENV = [
  'TELEGRAM_BOT_USERNAME',
  'TELEGRAM_PRIVACY_CONTACT',
  'TELEGRAM_CONSENT_VERSION',
  'TELEGRAM_INVITE_TOKEN_SECRET',
];

const requiredEnv = (name) => {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    const error = new Error(`Falta ${name}.`);
    error.status = 500;
    throw error;
  }
  return value;
};

const validateTelegramEnvironment = () => {
  const missing = REQUIRED_TELEGRAM_ENV.filter((name) => !String(process.env[name] || '').trim());
  if (missing.length) throw new Error(`Faltan variables Telegram obligatorias: ${missing.join(', ')}.`);
  if (!String(process.env.TELEGRAM_PRIVACY_POLICY_URL || '').trim() && !String(process.env.PUBLIC_FRONTEND_URL || '').trim()) {
    throw new Error('Falta configurar TELEGRAM_PRIVACY_POLICY_URL o PUBLIC_FRONTEND_URL para generar el enlace de privacidad.');
  }
  if (requiredEnv('TELEGRAM_INVITE_TOKEN_SECRET').length < 32) {
    throw new Error('TELEGRAM_INVITE_TOKEN_SECRET debe tener al menos 32 caracteres.');
  }
};

const getConsentVersion = () => requiredEnv('TELEGRAM_CONSENT_VERSION');

const getBotUsername = () => requiredEnv('TELEGRAM_BOT_USERNAME').replace(/^@/, '');

const getPrivacySettings = () => {
  const customUrl = String(process.env.TELEGRAM_PRIVACY_POLICY_URL || '').trim();
  const frontendUrl = String(process.env.PUBLIC_FRONTEND_URL || '').trim();
  const policyUrl = customUrl || (frontendUrl ? `${frontendUrl}/privacidad` : '');

  return {
    contact: requiredEnv('TELEGRAM_PRIVACY_CONTACT'),
    policyUrl,
    version: getConsentVersion(),
  };
};

const privacyText = () => {
  const { contact, policyUrl, version } = getPrivacySettings();
  return (
    `Aviso de privacidad y consentimiento - Eciencia Andina (${version})\n\n` +
    'Usaremos tu numero de telefono, identificador de Telegram, nombre de cliente y selecciones de menu para vincularte con tu registro, enviarte menus y registrar reservas solicitadas mediante botones.\n\n' +
    'La base legal es tu consentimiento libre, especifico, informado e inequivoco conforme a la Ley Organica de Proteccion de Datos Personales de Ecuador.\n\n' +
    'Puedes solicitar acceso, rectificacion, actualizacion, eliminacion, oposicion, limitacion o revocar el consentimiento con /misdatos, /eliminarmisdatos o /revocar.\n\n' +
    `Politica: ${policyUrl}\nContacto: ${contact}\n\n` +
    'Si aceptas, te pediremos compartir tu propio contacto de Telegram para comprobar que coincide con el cliente invitado.'
  );
};

const hmacHex = (value) =>
  crypto
    .createHmac('sha256', requiredEnv('TELEGRAM_INVITE_TOKEN_SECRET'))
    .update(String(value || ''))
    .digest('hex');

const sha256Hex = (value) => crypto.createHash('sha256').update(String(value || '')).digest('hex');

const invitationUrl = (token) => `https://t.me/${getBotUsername()}?start=${encodeURIComponent(token)}`;

const createInvitation = async (idCliente, createdBy, createClient = getAdminClient) => {
  const adminClient = createClient();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS).toISOString();
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHmac = hmacHex(token);

  const revokeResult = await adminClient
    .from('telegram_invitations')
    .update({ revoked_at: now.toISOString() })
    .eq('id_cliente', idCliente)
    .is('consumed_at', null)
    .is('revoked_at', null);
  if (revokeResult.error) throw revokeResult.error;

  const { data, error } = await adminClient
    .from('telegram_invitations')
    .insert({
      id_cliente: idCliente,
      token_hmac: tokenHmac,
      expires_at: expiresAt,
      created_by: createdBy || null,
    })
    .select('id,expires_at')
    .single();
  if (error) throw error;

  return {
    invitationId: data.id,
    status: 'pending',
    onboarding_url: invitationUrl(token),
    expires_at: data.expires_at,
  };
};

const getInvitationByToken = async (token, createClient = getAdminClient) => {
  try {
    fs.appendFileSync(path.join(__dirname, '../../logs/invitation.log'), 'Received token: ' + token + '\n');
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(String(token || ''))) {
      fs.appendFileSync(path.join(__dirname, '../../logs/invitation.log'), 'Regex failed\n');
      return null;
    }
    const hmac = hmacHex(token);
    fs.appendFileSync(path.join(__dirname, '../../logs/invitation.log'), 'HMAC: ' + hmac + '\n');
    const { data, error } = await createClient()
      .from('telegram_invitations')
      .select('*, clientes(id_cliente,nombre,apellido,telefono,esta_activo)')
      .eq('token_hmac', hmac)
      .maybeSingle();
    if (error) {
      fs.appendFileSync(path.join(__dirname, '../../logs/invitation.log'), 'Error: ' + JSON.stringify(error) + '\n');
      throw error;
    }
    fs.appendFileSync(path.join(__dirname, '../../logs/invitation.log'), 'Found: ' + (data ? 'yes' : 'no') + '\n');
    return data || null;
  } catch (err) {
    fs.appendFileSync(path.join(__dirname, '../../logs/invitation.log'), 'Exception: ' + err.message + '\n');
    throw err;
  }
};

const invitationAvailability = (invitation, chatId) => {
  if (!invitation) return { valid: false, reason: 'invalid' };
  if (invitation.revoked_at) return { valid: false, reason: 'revoked' };
  if (invitation.consumed_at) return { valid: false, reason: 'consumed' };
  if (new Date(invitation.expires_at).getTime() <= Date.now()) return { valid: false, reason: 'expired' };
  if (invitation.claimed_chat_id && String(invitation.claimed_chat_id) !== String(chatId)) {
    return { valid: false, reason: 'claimed' };
  }
  if (invitation.clientes?.esta_activo === false) return { valid: false, reason: 'inactive_client' };
  return { valid: true };
};

const claimInvitation = async (
  invitation,
  { chatId, telegramUserId },
  createClient = getAdminClient,
) => {
  const availability = invitationAvailability(invitation, chatId);
  if (!availability.valid) return availability;
  if (invitation.claimed_chat_id) return { valid: true, invitation };

  const { data, error } = await createClient()
    .from('telegram_invitations')
    .update({
      claimed_at: new Date().toISOString(),
      claimed_chat_id: String(chatId),
      claimed_telegram_user_id: telegramUserId ? String(telegramUserId) : null,
    })
    .eq('id', invitation.id)
    .is('claimed_chat_id', null)
    .select('*, clientes(id_cliente,nombre,apellido,telefono,esta_activo)')
    .maybeSingle();
  if (error) throw error;
  if (data) return { valid: true, invitation: data };

  const { data: current, error: currentError } = await createClient()
    .from('telegram_invitations')
    .select('*, clientes(id_cliente,nombre,apellido,telefono,esta_activo)')
    .eq('id', invitation.id)
    .maybeSingle();
  if (currentError) throw currentError;
  const currentAvailability = invitationAvailability(current, chatId);
  return currentAvailability.valid
    ? { valid: true, invitation: current }
    : currentAvailability;
};

const consumeInvitation = async (invitationId, createClient = getAdminClient) => {
  if (!invitationId) return;
  const { error } = await createClient()
    .from('telegram_invitations')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', invitationId)
    .is('consumed_at', null);
  if (error) throw error;
};

const recordConsentEvent = async (
  {
    idCliente,
    subscriptionId,
    invitationId,
    eventType,
    method,
    telegramUserId,
    chatId,
    phone,
    evidence = {},
    includeNotice = true,
  },
  createClient = getAdminClient,
) => {
  const notice = includeNotice ? privacyText() : '';
  const { error } = await createClient().from('telegram_consent_events').insert({
    id_cliente: idCliente || null,
    subscription_id: subscriptionId || null,
    invitation_id: invitationId || null,
    event_type: eventType,
    consent_version: includeNotice ? getConsentVersion() : null,
    notice_sha256: includeNotice ? sha256Hex(notice) : null,
    notice_text: includeNotice ? notice : null,
    method,
    telegram_user_id_hmac: telegramUserId ? hmacHex(telegramUserId) : null,
    chat_id_hmac: chatId ? hmacHex(chatId) : null,
    phone_hmac: phone ? hmacHex(phone) : null,
    evidence,
  });
  if (error) throw error;
};

const hasCurrentConsent = (subscription) =>
  Boolean(
    subscription &&
      subscription.consent_status === 'accepted' &&
      subscription.is_active !== false &&
      subscription.consent_notice_version === getConsentVersion(),
  );

module.exports = {
  INVITATION_TTL_MS,
  REQUIRED_TELEGRAM_ENV,
  claimInvitation,
  consumeInvitation,
  createInvitation,
  getBotUsername,
  getConsentVersion,
  getInvitationByToken,
  getPrivacySettings,
  hasCurrentConsent,
  hmacHex,
  invitationAvailability,
  privacyText,
  recordConsentEvent,
  sha256Hex,
  validateTelegramEnvironment,
};
