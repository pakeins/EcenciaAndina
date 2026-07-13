const supabase = require('../config/supabase');
const telegramApi = require('../services/telegramApi');
const { consentKeyboard, revokeConfirmKeyboard, contactKeyboard, removeKeyboard } = require('../ui/telegramKeyboards');
const telegramState = require('../services/telegramState');
const { normalizePhone } = require('../validation/ecencia');
const telegramConsent = require('../services/telegramConsent');

async function getSubscriptionByChat(chatId) {
  const { data, error } = await supabase.getAdminClient()
    .from('telegram_subscriptions')
    .select('*')
    .eq('chat_id', String(chatId))
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function getSubscriptionByClient(idCliente) {
  if (!idCliente) return null;
  const { data, error } = await supabase.getAdminClient()
    .from('telegram_subscriptions')
    .select('*')
    .eq('id_cliente', idCliente)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function getSubscriptionByPhone(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  const { data, error } = await supabase.getAdminClient()
    .from('telegram_subscriptions')
    .select('*')
    .eq('phone_normalized', normalized)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function getClientById(id) {
  const { data, error } = await supabase.getAdminClient()
    .from('clientes')
    .select(
      'id_cliente,cedula,nombre,apellido,telefono,esta_activo,clientes_convenios(id_convenio,convenios(id_convenio,nombre_empresa,esta_activo,fecha_caducidad,tipos_almuerzo_permitidos))',
    )
    .eq('id_cliente', id)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

function invitationFailureText(reason) {
  if (reason === 'claimed') return 'Este enlace ya fue abierto desde otro chat. Solicita una nueva invitacion al administrador.';
  if (reason === 'inactive_client') return 'El cliente de esta invitacion no esta activo.';
  return 'La invitacion no es valida, ya fue usada o expiro. Solicita una nueva al administrador.';
}

async function beginConsent({
  idCliente,
  chatId,
  telegramUserId,
  telegramUsername,
  invitationId = null,
  cleanupMessageIds = [],
}) {
  const subscription = await telegramState.ensurePendingSubscription({
    idCliente,
    chatId,
    telegramUserId,
    telegramUsername,
  });
  const sent = await telegramApi.sendMessage(chatId, telegramConsent.privacyText(), consentKeyboard());
  await telegramState.setState(telegramState.consentKey(chatId), {
    status: 'awaiting_decision',
    idCliente,
    subscriptionId: subscription.id,
    invitationId,
    policyVersion: telegramConsent.getConsentVersion(),
    promptMessageIds: [],
    cleanupMessageIds: cleanupMessageIds.filter(Boolean),
  });
  return subscription;
}

async function acceptConsent(parsed, subscription, consentState) {
  if (!consentState || consentState.status !== 'awaiting_decision') return;
  await telegramApi.removeInlineKeyboard(parsed.chatId, parsed.messageId);
  const sent = await telegramApi.sendMessage(
    parsed.chatId,
    '📱 <b>¡Paso Final!</b>\n\nPara validar tu suscripcion, necesitamos verificar tu usuario.\n\nPor favor, utiliza el boton <b>"Compartir mi telefono"</b> que acaba de aparecer en la parte inferior de tu pantalla.\n\n<i>(Si no ves el boton en la parte inferior, busca en la barra inferior el icono de un cuadrado para compartir tu numero).</i>',
    contactKeyboard(),
    'HTML'
  );
  await telegramState.setState(telegramState.consentKey(parsed.chatId), {
    ...consentState,
    status: 'accepted_pending_phone',
    promptMessageIds: [],
  });
  await supabase.getAdminClient()
    .from('telegram_subscriptions')
    .update({ consent_status: 'pending' })
    .eq('id', consentState.subscriptionId);
  await telegramConsent.recordConsentEvent({
    idCliente: consentState.idCliente,
    subscriptionId: consentState.subscriptionId,
    eventType: 'consent_step_accepted',
    method: 'telegram_button',
    telegramUserId: parsed.telegramUserId,
    chatId: parsed.chatId,
    evidence: {
      action: 'accept_policy_button',
      message_id: parsed.messageId,
      accepted_version: consentState.policyVersion,
    },
    includeNotice: false,
  });
}

async function rejectConsent(parsed, subscription, consentState) {
  if (!consentState || consentState.status !== 'awaiting_decision') return;
  await telegramApi.removeInlineKeyboard(parsed.chatId, parsed.messageId);
  await telegramApi.sendMessage(
    parsed.chatId,
    'Has rechazado el aviso de privacidad. Tu registro ha sido cancelado y tus datos no han sido guardados.\n\nSi deseas iniciar el registro nuevamente, vuelve a utilizar tu enlace de invitacion.',
  );
  if (consentState.subscriptionId) {
    await supabase.getAdminClient()
      .from('telegram_subscriptions')
      .update({
        consent_status: 'rejected',
        consent_notice_version: consentState.policyVersion,
        consent_date: new Date().toISOString(),
      })
      .eq('id', consentState.subscriptionId);
  }
  await telegramConsent.recordConsentEvent({
    idCliente: consentState.idCliente,
    subscriptionId: consentState.subscriptionId,
    eventType: 'consent_rejected',
    method: 'telegram_button',
    telegramUserId: parsed.telegramUserId,
    chatId: parsed.chatId,
    evidence: { action: 'reject_policy_button', message_id: parsed.messageId, rejected_version: consentState.policyVersion },
    includeNotice: false,
  });
  await telegramState.deleteState(telegramState.consentKey(parsed.chatId));
}

async function validateAndSaveContact(parsed, subscription, consentState) {
  if (consentState?.status !== 'accepted_pending_phone') return;
  const client = await getClientById(consentState.idCliente);
  if (!client) {
    await telegramApi.sendMessage(parsed.chatId, 'Error interno: no se encontro el cliente vinculado.', removeKeyboard());
    await telegramState.deleteState(telegramState.consentKey(parsed.chatId));
    return;
  }
  const contactPhone = normalizePhone(parsed.contactPhone);
  const clientPhone = normalizePhone(client.telefono);
  if (contactPhone !== clientPhone) {
    await telegramApi.sendMessage(
      parsed.chatId,
      `⚠️ El numero enviado (${parsed.contactPhone}) no coincide con el numero registrado para el cliente ${client.nombre} ${client.apellido}. Por favor, asegurate de enviar tu propio numero usando el boton proporcionado. Si tu numero ha cambiado, contacta a administracion.`,
    );
    await telegramConsent.recordConsentEvent({
      idCliente: consentState.idCliente,
      subscriptionId: consentState.subscriptionId,
      eventType: 'consent_phone_mismatch',
      method: 'telegram_contact',
      telegramUserId: parsed.telegramUserId,
      chatId: parsed.chatId,
      phone: contactPhone,
      evidence: { provided_phone: parsed.contactPhone, expected_phone: client.telefono },
      includeNotice: false,
    });
    return;
  }
  await supabase.getAdminClient()
    .from('telegram_subscriptions')
    .update({
      phone_normalized: clientPhone,
      consent_status: 'accepted',
      consent_notice_version: consentState.policyVersion,
      consent_date: new Date().toISOString(),
    })
    .eq('id', consentState.subscriptionId);
  await telegramConsent.recordConsentEvent({
    idCliente: consentState.idCliente,
    subscriptionId: consentState.subscriptionId,
    eventType: 'consent_accepted',
    method: 'telegram_contact',
    telegramUserId: parsed.telegramUserId,
    chatId: parsed.chatId,
    phone: clientPhone,
    evidence: { phone_verified: true, contact_message_id: parsed.messageId, accepted_version: consentState.policyVersion },
    includeNotice: true,
  });
  if (consentState.invitationId) {
    await telegramConsent.consumeInvitation(consentState.invitationId, consentState.subscriptionId);
  }
  await telegramApi.sendMessage(
    parsed.chatId,
    '✅ <b>¡Registro Completado!</b>\n\nTu suscripcion ha sido verificada y activada exitosamente.\n\nApartir de ahora, recibiras el menu diario y podras realizar reservas. Utiliza el comando /ayuda para ver todo lo que puedes hacer.',
    removeKeyboard(),
    'HTML'
  );
  if (consentState.cleanupMessageIds && consentState.cleanupMessageIds.length > 0) {
    for (const msgId of consentState.cleanupMessageIds) {
      await telegramApi.deleteMessage(parsed.chatId, msgId).catch(() => {});
    }
  }
  await telegramState.deleteState(telegramState.consentKey(parsed.chatId));
}

async function handleStartInvitation(parsed, token) {
  const invitation = await telegramConsent.getInvitationByToken(token);
  const claimed = await telegramConsent.claimInvitation(invitation, parsed);
  if (!claimed.valid) {
    await telegramApi.sendMessage(parsed.chatId, invitationFailureText(claimed.reason));
    return;
  }
  const relation = claimed.invitation.clientes;
  const client = Array.isArray(relation) ? relation[0] : relation;

  if (client && client.esta_activo === false) {
    await telegramApi.sendMessage(
      parsed.chatId, 
      '🚫 <b>Cuenta Desactivada</b>\n\nTu cuenta en Ecencia Andina se encuentra desactivada. No puedes iniciar el registro ni realizar reservas. Si crees que es un error, por favor contacta a la administración.',
      null,
      'HTML'
    );
    return;
  }

  let subscription = await getSubscriptionByChat(parsed.chatId);
  if (!subscription) {
    const { data: inserted, error: insertError } = await supabase.getAdminClient()
      .from('telegram_subscriptions')
      .insert({
        id_cliente: client ? client.id_cliente : null,
        chat_id: String(parsed.chatId),
        consent_status: 'pending',
        is_active: false,
      })
      .select()
      .single();
    if (insertError) {
      throw insertError;
    }
    subscription = inserted;
  }

  if (!client?.id_cliente) {
    await telegramApi.sendMessage(parsed.chatId, invitationFailureText('invalid'));
    return;
  }

  await beginConsent({
    idCliente: client.id_cliente,
    chatId: parsed.chatId,
    telegramUserId: parsed.telegramUserId,
    telegramUsername: parsed.telegramUsername,
    invitationId: claimed.invitation.id,
    cleanupMessageIds: [],
  });
}

async function requestPolicyReconsent(parsed, subscription) {
  await telegramConsent.recordConsentEvent({
    idCliente: subscription.id_cliente,
    subscriptionId: subscription.id,
    eventType: 'policy_reconsent_requested',
    method: 'telegram_command',
    telegramUserId: parsed.telegramUserId,
    chatId: parsed.chatId,
    phone: subscription.phone_normalized,
    evidence: {
      previous_version: subscription.consent_notice_version || null,
      required_version: telegramConsent.getConsentVersion(),
    },
    includeNotice: false,
  });
  await beginConsent({
    idCliente: subscription.id_cliente,
    chatId: parsed.chatId,
    telegramUserId: parsed.telegramUserId,
    telegramUsername: parsed.telegramUsername,
  });
}

async function handlePrivacyCommand(command, parsed, subscription) {
  const { chatId, messageId } = parsed;
  if (command === '/misdatos') {
    const dataText = '<b>Tus Datos</b>\nNombre: Juan\n(Datos de prueba)';
    await telegramApi.sendMessage(chatId, dataText, null, 'HTML');
  } else if (command === '/revocar') {
    await telegramApi.sendMessage(chatId, '¿Estás seguro que deseas revocar tu acceso?', revokeConfirmKeyboard());
  }
}

module.exports = {
  getSubscriptionByChat,
  getSubscriptionByClient,
  getSubscriptionByPhone,
  getClientById,
  invitationFailureText,
  beginConsent,
  acceptConsent,
  rejectConsent,
  validateAndSaveContact,
  handleStartInvitation,
  requestPolicyReconsent,
  handlePrivacyCommand,
  privacyText: telegramConsent.privacyText,
  hasCurrentConsent: telegramConsent.hasCurrentConsent
};