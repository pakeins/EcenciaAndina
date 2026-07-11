const crypto = require('node:crypto');
const { normalizePhone } = require('../validation/ecencia');
const { sendMessage: sendTelegramMessage } = require('./telegramMicroservice');
const { MAIL_STATUSES, buildInvitationEmail, sendOutlookMail } = require('./outlookMail');

const INVITATION_STATUSES = {
  generated: 'generated',
  manualRequired: 'manual_required',
  sent: 'sent',
  failed: 'failed',
  opened: 'opened',
  accepted: 'accepted',
  rejected: 'rejected',
  noPhone: 'no_phone',
  missingBotUsername: 'missing_bot_username',
  rejectedManualRequired: 'rejected_manual_required',
};

const cleanBotUsername = (value = process.env.TELEGRAM_BOT_USERNAME || '') =>
  String(value || '').trim().replace(/^@/, '');

const createInvitationToken = () => crypto.randomBytes(18).toString('base64url');

const buildInvitationLink = (token, botUsername = cleanBotUsername()) => {
  const cleanUsername = cleanBotUsername(botUsername);
  if (!cleanUsername || !token) return null;
  return `https://t.me/${cleanUsername}?start=${token}`;
};

const buildConvenioInvitationMessage = ({ nombre, convenioNombre, inviteLink }) => {
  const firstName = String(nombre || '').trim() || 'colaborador';
  const company = String(convenioNombre || '').trim() || 'tu convenio';
  const linkText = inviteLink || 'Solicita tu link de registro al administrador del convenio.';

  return [
    `Hola ${firstName}, bienvenido/a a ECencia Andina.`,
    `Ya haces parte del convenio ${company}.`,
    'Para recibir el menu diario y reservar almuerzos desde Telegram, registrate en el bot:',
    linkText,
  ].join('\n\n');
};

const resolveInvitationStatus = ({ phoneNormalized, inviteLink, subscriptionStatus }) => {
  if (subscriptionStatus === 'rejected') return INVITATION_STATUSES.rejectedManualRequired;
  if (inviteLink) return INVITATION_STATUSES.manualRequired;
  if (!phoneNormalized) return INVITATION_STATUSES.noPhone;
  return INVITATION_STATUSES.missingBotUsername;
};

const getSubscriptionByPhone = async (adminClient, phoneNormalized) => {
  if (!phoneNormalized) return null;
  const { data, error } = await adminClient
    .from('telegram_subscriptions')
    .select('id,id_cliente,phone_normalized,chat_id,consent_status,is_active')
    .eq('phone_normalized', phoneNormalized)
    .maybeSingle();
  if (error) throw error;
  return data || null;
};

const ensurePendingSubscription = async (adminClient, client, phoneNormalized) => {
  if (!phoneNormalized) return { status: 'no_phone', subscription: null };

  const existing = await getSubscriptionByPhone(adminClient, phoneNormalized);
  if (existing?.consent_status === 'rejected') return { status: 'rejected', subscription: existing };
  if (existing?.consent_status === 'accepted') return { status: 'accepted', subscription: existing };

  const payload = {
    id_cliente: client.id_cliente,
    phone_normalized: phoneNormalized,
    consent_status: 'pending',
    is_active: true,
  };

  if (existing?.id) {
    const { data, error } = await adminClient
      .from('telegram_subscriptions')
      .update(payload)
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;
    return { status: 'pending', subscription: data };
  }

  const { data, error } = await adminClient
    .from('telegram_subscriptions')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return { status: 'pending', subscription: data };
};

const updateInvitationStatusById = async (adminClient, id, patch) => {
  if (!id) return null;
  const { data, error } = await adminClient
    .from('telegram_convenio_invitaciones')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

const createInvitationAudit = async (adminClient, payload) => {
  const { data, error } = await adminClient
    .from('telegram_convenio_invitaciones')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
};

const resolveMailFailureStatus = (error) => {
  if (error?.code === 'MAIL_NOT_CONFIGURED') return MAIL_STATUSES.notConfigured;
  if (error?.code === 'MAIL_MISSING_RECIPIENT') return MAIL_STATUSES.missingRecipient;
  return MAIL_STATUSES.failed;
};

const updateInvitationEmailById = async (adminClient, id, patch) =>
  updateInvitationStatusById(adminClient, id, {
    email_status: patch.emailStatus,
    email_error_message: patch.emailErrorMessage || null,
    email_sent_at: patch.emailSentAt || null,
    email_provider_request_id: patch.emailProviderRequestId || null,
  });

const sendInvitationEmail = async (adminClient, audit, { client, inviteLink, invitationMessage }, options = {}) => {
  const emailTo = String(client.email || '').trim().toLowerCase();
  if (!emailTo) {
    await updateInvitationEmailById(adminClient, audit.id, {
      emailStatus: MAIL_STATUSES.missingRecipient,
      emailErrorMessage: 'El cliente no tiene correo para enviar la invitacion.',
    });
    return {
      emailTo: null,
      emailStatus: MAIL_STATUSES.missingRecipient,
      emailErrorMessage: 'El cliente no tiene correo para enviar la invitacion.',
      emailProviderRequestId: null,
      emailSentAt: null,
    };
  }

  if (!inviteLink) {
    const emailErrorMessage = 'No se genero link de Telegram. Verifica TELEGRAM_BOT_USERNAME.';
    await updateInvitationEmailById(adminClient, audit.id, {
      emailStatus: MAIL_STATUSES.failed,
      emailErrorMessage,
    });
    return {
      emailTo,
      emailStatus: MAIL_STATUSES.failed,
      emailErrorMessage,
      emailProviderRequestId: null,
      emailSentAt: null,
    };
  }

  try {
    const message = buildInvitationEmail({
      nombre: client.nombre,
      inviteLink,
      invitationMessage,
      env: options.mailOptions?.env || process.env,
    });
    const response = await sendOutlookMail({ to: emailTo, ...message }, options.mailOptions || {});
    const emailSentAt = new Date().toISOString();
    await updateInvitationEmailById(adminClient, audit.id, {
      emailStatus: MAIL_STATUSES.sent,
      emailSentAt,
      emailProviderRequestId: response.providerRequestId,
    });
    return {
      emailTo,
      emailStatus: MAIL_STATUSES.sent,
      emailErrorMessage: null,
      emailProviderRequestId: response.providerRequestId,
      emailSentAt,
    };
  } catch (error) {
    const emailStatus = resolveMailFailureStatus(error);
    const emailErrorMessage = error.message || 'No se pudo enviar el correo de invitacion.';
    await updateInvitationEmailById(adminClient, audit.id, {
      emailStatus,
      emailErrorMessage,
    });
    return {
      emailTo,
      emailStatus,
      emailErrorMessage,
      emailProviderRequestId: null,
      emailSentAt: null,
    };
  }
};

const generateConvenioInvitation = async (
  adminClient,
  { convenio, client, createdBy, sendDirect = true, sendEmail = true },
  options = {},
) => {
  const phoneNormalized = normalizePhone(client.telefono);
  const token = createInvitationToken();
  const inviteLink = buildInvitationLink(token, options.botUsername);
  const invitationMessage = buildConvenioInvitationMessage({
    nombre: client.nombre,
    convenioNombre: convenio.nombre_empresa,
    inviteLink,
  });

  const pendingResult = await ensurePendingSubscription(adminClient, client, phoneNormalized);
  let telegramStatus = resolveInvitationStatus({
    phoneNormalized,
    inviteLink,
    subscriptionStatus: pendingResult.status,
  });
  let telegramMessageId = null;
  let errorMessage = null;

  const audit = await createInvitationAudit(adminClient, {
    id_convenio: convenio.id_convenio,
    id_cliente: client.id_cliente,
    subscription_id: pendingResult.subscription?.id || null,
    phone_normalized: phoneNormalized || null,
    token,
    invite_link: inviteLink,
    invitation_message: invitationMessage,
    status: telegramStatus,
    email_to: client.email || null,
    email_status: MAIL_STATUSES.notAttempted,
    created_by: createdBy || null,
  });

  let emailResult = {
    emailTo: client.email || null,
    emailStatus: MAIL_STATUSES.notAttempted,
    emailErrorMessage: null,
    emailProviderRequestId: null,
    emailSentAt: null,
  };

  if (sendEmail) {
    emailResult = await sendInvitationEmail(
      adminClient,
      audit,
      { client, inviteLink, invitationMessage },
      options,
    );
  }

  const canSendDirect =
    sendDirect &&
    pendingResult.subscription?.consent_status === 'accepted' &&
    pendingResult.subscription?.is_active !== false &&
    pendingResult.subscription?.chat_id;

  if (canSendDirect) {
    try {
      const response = await sendTelegramMessage(
        pendingResult.subscription.chat_id,
        invitationMessage,
        undefined,
        options.telegramOptions || {},
      );
      telegramStatus = INVITATION_STATUSES.sent;
      telegramMessageId = response?.result?.message_id || null;
      await updateInvitationStatusById(adminClient, audit.id, {
        status: telegramStatus,
        telegram_message_id: telegramMessageId,
        error_message: null,
      });
    } catch (error) {
      telegramStatus = INVITATION_STATUSES.failed;
      errorMessage = error.message || 'No se pudo enviar la invitacion por Telegram.';
      await updateInvitationStatusById(adminClient, audit.id, {
        status: telegramStatus,
        error_message: errorMessage,
      });
    }
  }

  return {
    id: audit.id,
    token,
    inviteLink,
    invitationMessage,
    telegramStatus,
    telegramMessageId,
    errorMessage,
    emailTo: emailResult.emailTo,
    emailStatus: emailResult.emailStatus,
    emailErrorMessage: emailResult.emailErrorMessage,
    emailProviderRequestId: emailResult.emailProviderRequestId,
    emailSentAt: emailResult.emailSentAt,
    subscriptionStatus: pendingResult.status,
  };
};

module.exports = {
  INVITATION_STATUSES,
  buildConvenioInvitationMessage,
  buildInvitationLink,
  cleanBotUsername,
  generateConvenioInvitation,
  resolveInvitationStatus,
  sendInvitationEmail,
};
