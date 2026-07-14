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
    eventType: 'rejected',
    method: 'telegram_inline_button',
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
    return;
  }
  await supabase.getAdminClient()
    .from('telegram_subscriptions')
    .update({
      phone_normalized: clientPhone,
      consent_status: 'accepted',
      is_active: true,
      consent_notice_version: consentState.policyVersion,
      consent_notice_text: telegramConsent.privacyText(),
      accepted_at: new Date().toISOString(),
      linked_at: new Date().toISOString(),
      rejected_at: null,
      revoked_at: null,
      deletion_requested_at: null,
      consent_method: 'telegram_contact_button',
    })
    .eq('id', consentState.subscriptionId);
  await telegramConsent.recordConsentEvent({
    idCliente: consentState.idCliente,
    subscriptionId: consentState.subscriptionId,
    eventType: 'accepted',
    method: 'telegram_contact_button',
    telegramUserId: parsed.telegramUserId,
    chatId: parsed.chatId,
    phone: clientPhone,
    evidence: { phone_verified: true, contact_message_id: parsed.messageId, accepted_version: consentState.policyVersion },
    includeNotice: true,
  });
  if (consentState.invitationId) {
    await telegramConsent.consumeInvitation(consentState.invitationId);
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
  if (!parsed.isCallback) {
    await telegramApi.deleteMessage(parsed.chatId, parsed.messageId).catch(() => {});
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

  if (command === '/privacidad') {
    const settings = telegramConsent.getPrivacySettings();
    await telegramApi.sendMessage(
      chatId,
      `🛡️ <b>Centro de Privacidad</b>\n\n${telegramConsent.privacyText()}\n\n<b>Comandos disponibles:</b>\n/misdatos - Ver mis datos\n/eliminarmisdatos - Borrar mis datos\n/revocar - Retirar consentimiento\n/ayuda - Ver mas opciones\n\n<a href="${settings.policyUrl}">Ver Politica Completa</a>`,
      null,
      'HTML'
    );
    return true;
  }

  if (command === '/misaldo') {
    if (!subscription) {
      await telegramApi.sendMessage(chatId, '⚠️ <b>Sin suscripcion</b>\n\nEste chat no tiene una suscripcion de Telegram vinculada.', null, 'HTML');
      return true;
    }
    
    const { data: clientInfo, error } = await supabase.getAdminClient()
      .from('clientes')
      .select(`
        id_tipo_cliente,
        clientes_convenios(
          convenios(esta_activo, nombre_empresa)
        ),
        saldos_servicio(cantidad_disponible, productos(nombre_producto))
      `)
      .eq('id_cliente', subscription.id_cliente)
      .single();

    if (error || !clientInfo) {
      await telegramApi.sendMessage(chatId, '⚠️ No pudimos obtener tu informacion. Por favor, contacta al administrador.', null, 'HTML');
      return true;
    }

    if (clientInfo.id_tipo_cliente === 1) { // AGREEMENT
      const convenioRel = clientInfo.clientes_convenios?.[0]?.convenios;
      if (convenioRel && convenioRel.esta_activo) {
        const empresa = convenioRel.nombre_empresa || 'tu empresa';
        await telegramApi.sendMessage(chatId, `✅ <b>Convenio Activo</b>\n\nTu convenio con la empresa <b>${empresa}</b> se encuentra activo. Puedes disfrutar de tus almuerzos con normalidad.`, null, 'HTML');
      } else {
        await telegramApi.sendMessage(chatId, `⚠️ <b>Convenio Inactivo</b>\n\nTu convenio actualmente no se encuentra activo. Por favor, comunícate con la administración.`, null, 'HTML');
      }
    } else { // DIRECT
      const saldos = clientInfo.saldos_servicio || [];
      const totalSaldos = saldos.reduce((sum, s) => sum + (s.cantidad_disponible || 0), 0);
      
      if (totalSaldos > 0) {
        let detalle = '';
        saldos.forEach(s => {
          if (s.cantidad_disponible > 0) {
            const nombre = s.productos?.nombre_producto || 'Almuerzo general';
            detalle += `\n• ${s.cantidad_disponible}x ${nombre}`;
          }
        });
        await telegramApi.sendMessage(chatId, `💰 <b>Saldo Disponible</b>\n\nActualmente tienes <b>${totalSaldos}</b> almuerzos disponibles en tu monedero prepago.\n${detalle}`, null, 'HTML');
      } else {
        await telegramApi.sendMessage(chatId, `⚠️ <b>Sin Saldo</b>\n\nActualmente no tienes almuerzos disponibles en tu monedero prepago. Por favor, acércate a caja para realizar una recarga.`, null, 'HTML');
      }
    }
    return true;
  }

  if (command === '/misdatos') {
    if (!subscription) {
      await telegramApi.sendMessage(chatId, '⚠️ <b>Sin suscripcion</b>\n\nEste chat no tiene una suscripcion de Telegram vinculada.', null, 'HTML');
      return true;
    }
    await supabase.getAdminClient()
      .from('telegram_privacy_audits')
      .insert({ action: 'misdatos', outcome: 'informed', chat_id: String(chatId) });
    await telegramApi.sendMessage(
      chatId,
      '📁 <b>Tus Datos Personales</b>\n\nCategorias de datos que almacenamos:\n' +
      '• Identificador del chat de Telegram\n' +
      '• Numero de telefono (enmascarado)\n' +
      '• Nombre del cliente (segun tu registro)\n' +
      '• Selecciones de menu y reservas\n' +
      '• Historial de consentimiento\n\n' +
      `<b>Estado del consentimiento:</b> <code>${subscription.consent_status}</code>\n\n` +
      `Para acceder, rectificar o eliminar tus datos, contacta a: <b>${telegramConsent.getPrivacySettings().contact}</b> o usa /eliminarmisdatos.`,
      null,
      'HTML'
    );
    return true;
  }

  if (command === '/revocar') {
    if (!subscription) {
      await telegramApi.sendMessage(chatId, '⚠️ <b>Sin suscripcion</b>\n\nNo existe una suscripcion vinculada para revocar.', null, 'HTML');
      return true;
    }
    if (['rejected', 'revoked'].includes(subscription.consent_status)) {
      await telegramApi.sendMessage(chatId, '🚫 <b>Ya estas revocado</b>\n\nTu suscripcion ya se encuentra bloqueada.', null, 'HTML');
      return true;
    }
    await telegramApi.sendMessage(
      chatId,
      '🛑 <b>Revocar Consentimiento</b>\n\n<b>Confirma tu decision:</b>\n\nRevocar el consentimiento bloqueara tu acceso al bot de Ecencia Andina. No recibiras menus hasta que un administrador reactive tu suscripcion.',
      revokeConfirmKeyboard(),
      'HTML'
    );
    return true;
  }

  if (parsed.text === 'revocar:cancel') {
    if (parsed.isCallback) await telegramApi.removeInlineKeyboard(chatId, messageId).catch(() => {});
    await telegramApi.sendMessage(chatId, '✅ <b>Accion Cancelada</b>\n\nTu consentimiento se mantiene activo y seguiras disfrutando del servicio.', null, 'HTML');
    return true;
  }

  if (parsed.text === 'revocar:confirm') {
    if (parsed.isCallback) await telegramApi.removeInlineKeyboard(chatId, messageId).catch(() => {});
    if (!subscription) {
      await telegramApi.sendMessage(chatId, '⚠️ <b>Sin suscripcion</b>\n\nNo existe una suscripcion vinculada para revocar.', null, 'HTML');
      return true;
    }
    await supabase.getAdminClient()
      .from('telegram_subscriptions')
      .update({
        consent_status: 'rejected',
        is_active: false,
        revoked_at: new Date().toISOString(),
      })
      .eq('id', subscription.id);
    await supabase.getAdminClient()
      .from('telegram_privacy_audits')
      .insert({ action: 'revocar', outcome: 'revoked', chat_id: String(chatId) });
    await telegramState.deleteChatStates(chatId);
    await telegramApi.sendMessage(
      chatId,
      '🚫 <b>Consentimiento Revocado</b>\n\nTu acceso ha quedado bloqueado. Ya no recibiras el menu diario hasta que un administrador reactive tu suscripcion.',
      removeKeyboard(),
      'HTML'
    );
    return true;
  }

  if (command === '/eliminarmisdatos') {
    if (!subscription) {
      await telegramApi.sendMessage(chatId, '⚠️ <b>Sin datos</b>\n\nEste chat no tiene datos Telegram vinculados.', null, 'HTML');
      return true;
    }

    const client = await getClientById(subscription.id_cliente);

    const { data: existingRequests } = await supabase.getAdminClient()
      .from('telegram_privacy_requests')
      .select('id, status')
      .eq('id_cliente', subscription.id_cliente)
      .in('status', ['pending', 'in_review']);

    if (existingRequests && existingRequests.length > 0) {
      await telegramApi.sendMessage(
        chatId,
        '⏳ <b>Solicitud en curso</b>\n\nYa hemos recibido tu solicitud anteriormente. Actualmente se encuentra en proceso de gestion.',
        null,
        'HTML'
      );
      return true;
    }

    await supabase.getAdminClient()
      .from('telegram_privacy_audits')
      .insert({ action: 'eliminarmisdatos', outcome: 'requested', chat_id: String(chatId) });

    const { data: privacyRequest, error } = await supabase.getAdminClient()
      .from('telegram_privacy_requests')
      .insert({
        id_cliente: subscription.id_cliente,
        subscription_id: subscription.id,
        request_type: 'deletion',
        status: 'pending',
        source: 'telegram'
      })
      .select()
      .single();

    if (error && error.code !== '23505') {
      console.error('Error al insertar solicitud de privacidad:', error);
    }

    if (privacyRequest && client) {
      try {
        const { sendPrivacyRequestNotificationEmail } = require('../services/telegramInvitationEmail');
        sendPrivacyRequestNotificationEmail(client, privacyRequest).catch(err => console.error('Error notificacion:', err));
      } catch (e) {
        console.warn('Módulo de correos no disponible en este entorno.');
      }
    }

    await telegramApi.sendMessage(
      chatId,
      '🗑️ <b>Solicitud Recibida</b>\n\nHemos recibido tu solicitud de eliminacion de datos personales.\n\nEl requerimiento ha sido registrado automaticamente y nuestro equipo de privacidad lo evaluara y procesara en el plazo establecido por la ley. En caso de requerir detalles adicionales, te contactaremos.',
      null,
      'HTML'
    );
    return true;
  }

  return false;
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