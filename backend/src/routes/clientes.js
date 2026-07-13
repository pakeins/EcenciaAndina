const express = require('express');
const router = express.Router();
const { getAdminClient } = require('../config/supabase');
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const { parseBody, schemas, sendValidationError } = require('../validation/ecencia');
const { createHttpError, getDateInTimeZone } = require('../services/reporting');
const { CLIENT_TYPE } = require('../constants/domain');
const {
  getConsentVersion,
  privacyText,
  createInvitation,
  recordConsentEvent,
  sendMessage
} = require('../services/telegramMicroservice');

const { sendOutlookMail, buildInvitationEmail } = require('../services/outlookMail');

const sendTelegramInvitationEmail = async ({ client, onboarding }) => {
  try {
    const inviteLink = onboarding.onboarding_url;
    const emailData = buildInvitationEmail({
      nombre: client.nombre,
      inviteLink,
    });
    return await sendOutlookMail({
      to: client.correo,
      ...emailData,
    });
  } catch (error) {
    console.error('Error sending telegram invitation email:', error.message);
    return { status: 'failed', error: error.message };
  }
};

const sendTelegramReactivationEmail = async ({ client }) => {
  try {
    const fromEmail = process.env.OUTLOOK_FROM_EMAIL || process.env.GMAIL_USER || 'ecenciaconvenios@outlook.com';
    const emailData = {
      subject: 'Tu acceso al bot de ECencia Andina ha sido reactivado',
      text: `Hola ${client.nombre || 'cliente'},\n\nTu acceso al bot de Telegram ha sido reactivado por el administrador. Ya puedes seguir usando el bot para realizar tus pedidos.\n\nAtentamente,\nEquipo ECencia Andina\n${fromEmail}`,
      html: `<p>Hola <strong>${client.nombre || 'cliente'}</strong>,</p><p>Tu acceso al bot de Telegram ha sido reactivado por el administrador. Ya puedes seguir usando el bot para realizar tus pedidos.</p><br><p>Atentamente,<br>Equipo ECencia Andina<br>${fromEmail}</p>`,
    };
    return await sendOutlookMail({
      to: client.correo,
      ...emailData,
    });
  } catch (error) {
    console.error('Error sending telegram reactivation email:', error.message);
    return { status: 'failed', error: error.message };
  }
};

router.use(authMiddleware);
router.use(roleMiddleware(['administrador', 'caja']));
const adminOnly = roleMiddleware(['administrador']);
const CLIENT_SELECT = `
  *,
  tipos_cliente(nombre_tipo),
  clientes_convenios(
    convenios(id_convenio, nombre_empresa)
  ),
  telegram_subscriptions(
    id,
    consent_status,
    is_active,
    consent_notice_version,
    telegram_username,
    chat_id,
    last_menu_sent_at,
    revoked_at,
    deletion_requested_at
  )
`;

const handleRouteError = (res, error) => {
  console.error('[ROUTE ERROR]', error);
  if (sendValidationError(res, error)) return;
  const status = Number(error?.status || 500);
  res.status(status >= 400 && status < 600 ? status : 500).json({
    error: error.message || 'No se pudo completar la operacion del cliente.',
  });
};

// Función auxiliar para formatear cliente con su convenio
const getRelationFirst = (value) => Array.isArray(value) ? value[0] : value;

const telegramSummary = (client) => {
  const subscription = getRelationFirst(client.telegram_subscriptions);
  const now = Date.now();
  const sortedInvitations = [...(client.telegram_invitations || [])]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const latestInvitation = sortedInvitations[0];
  const activeInvitation = sortedInvitations
    .filter((invitation) =>
      !invitation.consumed_at &&
      !invitation.revoked_at &&
      new Date(invitation.expires_at).getTime() > now)[0];
  const deletionPending = (client.telegram_privacy_requests || []).some(
    (request) =>
      request.request_type === 'deletion' &&
      ['pending', 'in_review'].includes(request.status),
  );

  let status = 'no_invitation';
  if (deletionPending) status = 'deletion_pending';
  else if (subscription?.consent_status) status = subscription.consent_status;
  else if (activeInvitation) status = 'pending';

  return {
    status,
    policy_current:
      subscription?.consent_status === 'accepted' &&
      subscription.consent_notice_version === getConsentVersion(),
    consent_version: subscription?.consent_notice_version || null,
    has_chat: Boolean(subscription?.chat_id),
    telegram_username: subscription?.telegram_username || null,
    invitation_expires_at: activeInvitation?.expires_at || null,
    last_menu_sent_at: subscription?.last_menu_sent_at || null,
    email_delivery: latestInvitation
      ? {
        status: latestInvitation.email_delivery_status || 'not_attempted',
        recipient: latestInvitation.email_recipient || client.correo || null,
        provider_id: latestInvitation.email_provider_id || null,
        attempted_at: latestInvitation.email_attempted_at || null,
        sent_at: latestInvitation.email_sent_at || null,
      }
      : null,
  };
};

const formatCliente = (cli) => {
  const convenioRel = cli.clientes_convenios?.[0]?.convenios;
  return {
    id: cli.id_cliente,
    cedula: cli.cedula,
    nombre: cli.nombre,
    apellido: cli.apellido,
    telefono: cli.telefono || '',
    correo: cli.correo || '',
    activo: cli.esta_activo,
    id_tipo_cliente: cli.id_tipo_cliente,
    tipo_nombre: cli.tipos_cliente?.nombre_tipo || 'Sin tipo',
    convenio: convenioRel ? {
      id: convenioRel.id_convenio,
      nombre: convenioRel.nombre_empresa
    } : null,
    telegram: telegramSummary(cli),
  };
};

const setConsentState = async (adminClient, chatId, value) => {
  const { error } = await adminClient
    .from('telegram_bot_state')
    .upsert(
      {
        key: `consent:${chatId}`,
        value: { ...value, updatedAt: new Date().toISOString() },
      },
      { onConflict: 'key' },
    );
  if (error) throw error;
};

const directConsentKeyboard = () => ({
  inline_keyboard: [
    [{ text: 'Acepto', callback_data: 'consent:accept' }],
    [{ text: 'No acepto', callback_data: 'consent:reject' }],
  ],
});

const publicOnboarding = (onboarding) => ({
  status: onboarding.status,
  onboarding_url: onboarding.onboarding_url,
  expires_at: onboarding.expires_at,
  email_delivery: onboarding.email_delivery || null,
});

const validateConvenioLink = async (adminClient, idConvenio, idCliente = null) => {
  const [convenioResult, currentLinkResult] = await Promise.all([
    adminClient
      .from('convenios')
      .select('cupo_maximo, esta_activo, fecha_caducidad, clientes_convenios(count)')
      .eq('id_convenio', idConvenio)
      .maybeSingle(),
    idCliente
      ? adminClient
        .from('clientes_convenios')
        .select('id_convenio')
        .eq('id_cliente', idCliente)
        .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (convenioResult.error) throw convenioResult.error;
  if (currentLinkResult.error) throw currentLinkResult.error;
  if (!convenioResult.data) throw createHttpError(404, 'Convenio no encontrado.');

  const convenio = convenioResult.data;
  const isSameLink = currentLinkResult.data?.id_convenio === idConvenio;
  const expiryDate = String(convenio.fecha_caducidad || '').slice(0, 10);
  if (convenio.esta_activo === false || (expiryDate && expiryDate < getDateInTimeZone(new Date()))) {
    throw createHttpError(400, 'No se puede vincular un cliente a un convenio inactivo o vencido.');
  }

  const memberCount = Number(convenio.clientes_convenios?.[0]?.count || 0);
  const capacity = Number(convenio.cupo_maximo || 0);
  if (!isSameLink && memberCount >= capacity) {
    throw createHttpError(400, `El convenio alcanzo su cupo maximo de ${capacity} colaboradores.`);
  }

  return { isSameLink };
};

// OBTENER TODOS LOS CLIENTES
router.get('/', async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const { data, error } = await adminClient
      .from('clientes')
      .select(CLIENT_SELECT)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data.map(formatCliente));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// OBTENER TIPOS DE CLIENTE
router.get('/tipos', async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const { data, error } = await adminClient
      .from('tipos_cliente')
      .select('*')
      .order('nombre_tipo', { ascending: true });
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/telegram/privacidad-solicitudes', adminOnly, async (req, res) => {
  try {
    const { data, error } = await getAdminClient()
      .from('telegram_privacy_requests')
      .select(`
        id,
        request_type,
        status,
        retained_order_count,
        details,
        requested_at,
        resolved_at,
        resolution_notes,
        clientes(id_cliente,nombre,apellido,cedula,ordenes(count))
      `)
      .order('requested_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    handleRouteError(res, error);
  }
});

router.patch('/telegram/privacidad-solicitudes/:requestId', adminOnly, async (req, res) => {
  try {
    const { status, resolution_notes } = parseBody(schemas.telegramPrivacyResolution, req.body);
    const terminal = ['resolved', 'rejected'].includes(status);
    const adminClient = getAdminClient();
    const { data, error } = await adminClient
      .from('telegram_privacy_requests')
      .update({
        status,
        resolution_notes: resolution_notes || null,
        resolved_at: terminal ? new Date().toISOString() : null,
        resolved_by: terminal ? (req.user.empleado_id || req.user.id) : null,
      })
      .eq('id', req.params.requestId)
      .select('id,subscription_id,status,resolved_at,resolution_notes')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw createHttpError(404, 'Solicitud de privacidad no encontrada.');

    if (terminal && data.subscription_id) {
      const updatePayload = status === 'resolved'
        ? { deletion_requested_at: null, consent_status: 'rejected', is_active: false, revoked_at: new Date().toISOString() }
        : { deletion_requested_at: null };
      const clearResult = await adminClient
        .from('telegram_subscriptions')
        .update(updatePayload)
        .eq('id', data.subscription_id)
        .select('chat_id')
        .maybeSingle();
      if (clearResult.error) throw clearResult.error;
      
      if (status === 'resolved' && clearResult.data?.chat_id) {
        await sendMessage(
          clearResult.data.chat_id,
          '✅ <b>Solicitud Atendida</b>\n\nTu solicitud de eliminacion de datos ha sido procesada exitosamente. Como resultado, <b>tu suscripcion al bot ha sido revocada</b> y ya no recibiras el menu diario.\n\nPara cualquier duda adicional, acercate a Ecencia Andina.',
          { remove_keyboard: true },
          'HTML'
        ).catch((err) => console.error('No se pudo enviar notificacion de privacidad por Telegram:', err)); // NOSONAR
      } else if (status === 'rejected' && clearResult.data?.chat_id) {
        const motivo = resolution_notes ? `\n\n<b>Motivo:</b> ${resolution_notes}` : '';
        await sendMessage(
          clearResult.data.chat_id,
          `❌ <b>Solicitud Rechazada</b>\n\nTu solicitud de eliminacion de datos ha sido rechazada por la administracion.${motivo}\n\nPara cualquier duda adicional, acercate a Ecencia Andina.`,
          null,
          'HTML'
        ).catch((err) => console.error('No se pudo enviar notificacion de privacidad (rechazo) por Telegram:', err)); // NOSONAR
      }
    }
    res.json(data);
  } catch (error) {
    handleRouteError(res, error);
  }
});

// QUITAR CLIENTE DE CUALQUIER CONVENIO
router.delete('/:id/convenio', adminOnly, async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const { error } = await adminClient
      .from('clientes_convenios')
      .delete()
      .eq('id_cliente', req.params.id);

    if (error) throw error;
    const updateResult = await adminClient
      .from('clientes')
      .update({ id_tipo_cliente: CLIENT_TYPE.DIRECT, updated_by: req.user.id })
      .eq('id_cliente', req.params.id);
    if (updateResult.error) throw updateResult.error;
    res.json({ mensaje: 'Vínculo con convenio eliminado' });
  } catch (error) {
    handleRouteError(res, error);
  }
});

// CREAR NUEVO CLIENTE
router.post('/', async (req, res) => {
  try {
    const { cedula, nombre, apellido, telefono, correo, id_tipo_cliente, id_convenio } = parseBody(schemas.clienteCreate, req.body);
    const adminClient = getAdminClient();

    if (id_tipo_cliente === CLIENT_TYPE.AGREEMENT && req.user.rol !== 'administrador') {
      throw createHttpError(403, 'Solo un administrador puede vincular clientes a convenios.');
    }
    if (id_tipo_cliente === CLIENT_TYPE.AGREEMENT && !id_convenio) {
      throw createHttpError(400, 'Debe seleccionar un convenio para este tipo de cliente.');
    }
    if (id_tipo_cliente === CLIENT_TYPE.DIRECT && id_convenio) {
      throw createHttpError(400, 'Un cliente frecuente no puede tener convenio.');
    }
    if (id_tipo_cliente === CLIENT_TYPE.AGREEMENT) {
      await validateConvenioLink(adminClient, id_convenio);
    }

    const [phoneCheck, emailCheck] = await Promise.all([
      telefono
        ? adminClient
          .from('clientes')
          .select('id_cliente')
          .eq('telefono', telefono)
          .eq('esta_activo', true)
          .limit(1)
        : Promise.resolve({ data: [], error: null }),
      adminClient
        .from('clientes')
        .select('id_cliente')
        .ilike('correo', correo)
        .limit(1),
    ]);
    if (phoneCheck.error) throw phoneCheck.error;
    if (emailCheck.error) throw emailCheck.error;
    if (phoneCheck.data?.length) {
      return res.status(400).json({ error: 'Este telefono ya pertenece a un cliente activo.' });
    }
    if (emailCheck.data?.length) {
      return res.status(400).json({ error: 'Este correo ya pertenece a otro cliente.' });
    }

    const { data: created, error } = await adminClient
      .from('clientes')
      .insert([{
        cedula,
        nombre,
        apellido,
        telefono,
        correo,
        id_tipo_cliente: id_tipo_cliente || CLIENT_TYPE.DIRECT,
        created_by: req.user.id,
      }])
      .select('id_cliente')
      .single();
    if (error) throw error;

    if (id_tipo_cliente === CLIENT_TYPE.AGREEMENT && id_convenio) {
      const linkResult = await adminClient
        .from('clientes_convenios')
        .insert([{ id_cliente: created.id_cliente, id_convenio, created_by: req.user.id }]);
      if (linkResult.error) {
        await adminClient.from('clientes').delete().eq('id_cliente', created.id_cliente);
        throw linkResult.error;
      }
    }

    let onboarding;
    try {
      onboarding = await createInvitation(
        created.id_cliente,
        req.user.empleado_id || req.user.id,
      );
    } catch (invitationError) {
      await adminClient.from('clientes').delete().eq('id_cliente', created.id_cliente);
      throw invitationError;
    }
    onboarding.email_delivery = await sendTelegramInvitationEmail({
      client: { nombre, apellido, correo },
      onboarding,
    });

    const finalResult = await adminClient
      .from('clientes')
      .select(CLIENT_SELECT)
      .eq('id_cliente', created.id_cliente)
      .single();
    if (finalResult.error) throw finalResult.error;
    res.status(201).json({
      ...formatCliente(finalResult.data),
      telegram_onboarding: publicOnboarding(onboarding),
    });
  } catch (error) {
    handleRouteError(res, error);
  }
});

router.post('/:id/telegram/invitacion', adminOnly, async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const [clientResult, subscriptionResult] = await Promise.all([
      adminClient
        .from('clientes')
        .select('id_cliente,nombre,apellido,telefono,correo,esta_activo')
        .eq('id_cliente', req.params.id)
        .maybeSingle(),
      adminClient
        .from('telegram_subscriptions')
        .select('*')
        .eq('id_cliente', req.params.id)
        .maybeSingle(),
    ]);
    if (clientResult.error) throw clientResult.error;
    if (subscriptionResult.error) throw subscriptionResult.error;
    const client = clientResult.data;
    const subscription = subscriptionResult.data;
    if (!client) throw createHttpError(404, 'Cliente no encontrado.');
    if (!client.esta_activo) throw createHttpError(400, 'El cliente debe estar activo para reinvitarlo.');

    if (subscription?.chat_id) {
      const { data: pending, error: updateError } = await adminClient
        .from('telegram_subscriptions')
        .update({
          consent_status: 'pending',
          is_active: false,
          consent_notice_version: getConsentVersion(),
          consent_notice_text: privacyText(),
          consent_method: null,
          accepted_at: null,
          rejected_at: null,
          revoked_at: null,
          deletion_requested_at: null,
        })
        .eq('id', subscription.id)
        .select()
        .single();
      if (updateError) throw updateError;

      const sent = await sendMessage(
        pending.chat_id,
        privacyText(),
        directConsentKeyboard(),
      );
      await setConsentState(adminClient, pending.chat_id, {
        status: 'awaiting_decision',
        idCliente: client.id_cliente,
        subscriptionId: pending.id,
        invitationId: null,
        policyVersion: getConsentVersion(),
        promptMessageIds: [sent?.message_id].filter(Boolean),
        cleanupMessageIds: [],
      });
      await recordConsentEvent({
        idCliente: client.id_cliente,
        subscriptionId: pending.id,
        eventType: 'admin_reinvited',
        method: 'admin_direct',
        chatId: pending.chat_id,
        phone: pending.phone_normalized,
        includeNotice: false,
      });
      const emailDelivery = await sendTelegramReactivationEmail({ client });
      return res.json({
        telegram_onboarding: {
          status: 'sent',
          onboarding_url: null,
          expires_at: null,
          email_delivery: emailDelivery,
        },
      });
    }

    if (subscription) {
      const resetResult = await adminClient
        .from('telegram_subscriptions')
        .update({
          consent_status: 'pending',
          is_active: false,
          accepted_at: null,
          rejected_at: null,
          revoked_at: null,
          deletion_requested_at: null,
        })
        .eq('id', subscription.id);
      if (resetResult.error) throw resetResult.error;
    }

    const onboarding = await createInvitation(
      client.id_cliente,
      req.user.empleado_id || req.user.id,
    );
    onboarding.email_delivery = await sendTelegramInvitationEmail({
      client,
      onboarding,
    });
    await recordConsentEvent({
      idCliente: client.id_cliente,
      subscriptionId: subscription?.id,
      invitationId: onboarding.invitationId,
      eventType: 'admin_reinvited',
      method: 'admin_link',
      includeNotice: false,
    });
    res.json({ telegram_onboarding: publicOnboarding(onboarding) });
  } catch (error) {
    handleRouteError(res, error);
  }
});

// REVOCAR TELEGRAM MANUALMENTE
router.post('/:id/telegram/revocar', adminOnly, async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const { data: subscription, error } = await adminClient
      .from('telegram_subscriptions')
      .select('id, chat_id, consent_status')
      .eq('id_cliente', req.params.id)
      .maybeSingle();

    if (error) throw error;
    if (!subscription) throw createHttpError(404, 'No existe una suscripcion para este cliente.');
    if (['revoked', 'rejected'].includes(subscription.consent_status)) {
      throw createHttpError(400, 'La suscripcion ya se encuentra revocada.');
    }

    const { error: updateError } = await adminClient
      .from('telegram_subscriptions')
      .update({
        consent_status: 'revoked',
        is_active: false,
        revoked_at: new Date().toISOString()
      })
      .eq('id', subscription.id);

    if (updateError) throw updateError;

    if (subscription.chat_id) {
      await sendMessage(
        subscription.chat_id,
        '🚫 <b>Suscripcion Revocada</b>\n\nTu acceso al bot de Telegram ha sido revocado por la administracion. Ya no recibiras notificaciones ni menus diarios.',
        { remove_keyboard: true },
        'HTML'
      ).catch(err => {
        const safeError = String(err?.message || err).replace(/[\r\n]/g, '_');
        console.error('Error enviando revocacion:', safeError);
      });
    }

    await recordConsentEvent({
      idCliente: req.params.id,
      subscriptionId: subscription.id,
      eventType: 'revoked',
      method: 'admin_action'
    });

    res.json({ success: true, message: 'Suscripcion revocada correctamente.' });
  } catch (error) {
    handleRouteError(res, error);
  }
});

// ACTUALIZAR CLIENTE
router.put('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const { activo, cedula, nombre, apellido, telefono, correo, id_tipo_cliente, id_convenio } = parseBody(schemas.clienteUpdate, req.body);
    const actualizacion = { updated_by: req.user.id };
    if (activo !== undefined) actualizacion.esta_activo = activo;
    if (cedula !== undefined) actualizacion.cedula = cedula;
    if (nombre !== undefined) actualizacion.nombre = nombre;
    if (apellido !== undefined) actualizacion.apellido = apellido;
    if (telefono !== undefined) actualizacion.telefono = telefono;
    if (correo !== undefined) actualizacion.correo = correo;
    if (id_tipo_cliente !== undefined) actualizacion.id_tipo_cliente = id_tipo_cliente;

    const adminClient = getAdminClient();
    const currentResult = await adminClient
      .from('clientes')
      .select('id_tipo_cliente, telefono, correo, esta_activo')
      .eq('id_cliente', id)
      .maybeSingle();
    if (currentResult.error) throw currentResult.error;
    if (!currentResult.data) return res.status(404).json({ error: 'Cliente no encontrado' });

    const currentLinkResult = await adminClient
      .from('clientes_convenios')
      .select('id_convenio')
      .eq('id_cliente', id)
      .maybeSingle();
    if (currentLinkResult.error) throw currentLinkResult.error;

    const currentAgreementId = currentLinkResult.data?.id_convenio || null;
    const finalClientType = id_tipo_cliente ?? currentResult.data.id_tipo_cliente;
    const finalAgreementId = id_convenio === undefined ? currentAgreementId : id_convenio;
    if (
      req.user.rol !== 'administrador' &&
      (
        finalClientType !== currentResult.data.id_tipo_cliente ||
        finalAgreementId !== currentAgreementId
      )
    ) {
      throw createHttpError(403, 'Solo un administrador puede cambiar el tipo o convenio del cliente.');
    }
    if (finalClientType === CLIENT_TYPE.AGREEMENT && !finalAgreementId) {
      throw createHttpError(400, 'Debe seleccionar un convenio para este tipo de cliente.');
    }
    if (finalClientType === CLIENT_TYPE.DIRECT && finalAgreementId) {
      throw createHttpError(400, 'Un cliente frecuente no puede tener convenio.');
    }

    const targetPhone = telefono ?? currentResult.data.telefono;
    const targetEmail = correo ?? currentResult.data.correo;
    const targetActive = activo ?? currentResult.data.esta_activo;
    const linkValidation = finalClientType === CLIENT_TYPE.AGREEMENT && finalAgreementId
      ? await validateConvenioLink(adminClient, finalAgreementId, id)
      : { isSameLink: false };

    const [phoneCheck, emailCheck] = await Promise.all([
      targetActive && targetPhone
        ? adminClient
          .from('clientes')
          .select('id_cliente')
          .eq('telefono', targetPhone)
          .eq('esta_activo', true)
          .neq('id_cliente', id)
          .limit(1)
        : Promise.resolve({ data: [], error: null }),
      targetEmail
        ? adminClient
          .from('clientes')
          .select('id_cliente')
          .ilike('correo', targetEmail)
          .neq('id_cliente', id)
          .limit(1)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (phoneCheck.error) throw phoneCheck.error;
    if (emailCheck.error) throw emailCheck.error;
    if (phoneCheck.data?.length) {
      return res.status(400).json({ error: 'Este telefono ya pertenece a un cliente activo.' });
    }
    if (emailCheck.data?.length) {
      return res.status(400).json({ error: 'Este correo ya pertenece a otro cliente.' });
    }

    const { data, error } = await adminClient
      .from('clientes')
      .update(actualizacion)
      .eq('id_cliente', id)
      .select('id_cliente, id_tipo_cliente')
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Cliente no encontrado' });

    if (finalClientType === CLIENT_TYPE.DIRECT) {
      const unlinkResult = await adminClient.from('clientes_convenios').delete().eq('id_cliente', id);
      if (unlinkResult.error) throw unlinkResult.error;
    } else if (finalAgreementId && !linkValidation.isSameLink) {
      const unlinkResult = await adminClient.from('clientes_convenios').delete().eq('id_cliente', id);
      if (unlinkResult.error) throw unlinkResult.error;
      const linkResult = await adminClient
        .from('clientes_convenios')
        .insert([{ id_cliente: id, id_convenio: finalAgreementId, created_by: req.user.id }]);
      if (linkResult.error) throw linkResult.error;
    }

    const finalResult = await adminClient
      .from('clientes')
      .select(CLIENT_SELECT)
      .eq('id_cliente', id)
      .single();
    if (finalResult.error) throw finalResult.error;
    res.json(formatCliente(finalResult.data));
  } catch (error) {
    handleRouteError(res, error);
  }
});

// OBTENER SALDO DEL MONEDERO VIRTUAL
router.get('/:id/saldo', async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const { data, error } = await adminClient
      .from('saldos_servicio')
      .select('*, productos(nombre_producto, precio_unitario)')
      .eq('id_cliente', req.params.id);

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// RECARGAR SALDO AL MONEDERO VIRTUAL
router.post('/:id/recargar', async (req, res) => {
  const id_cliente = req.params.id;

  try {
    const { id_producto, cantidad_comprada, monto_total, numero_factura } = parseBody(schemas.recarga, req.body);
    const adminClient = getAdminClient();

    // 1. Insertar el registro de recarga
    const { error: errorRecarga } = await adminClient
      .from('recargas_saldo')
      .insert([{ 
        id_cliente, 
        id_producto, 
        cantidad_comprada, 
        monto_total,
        numero_factura,
        created_by: req.user.id 
      }]);

    if (errorRecarga) throw errorRecarga;

    // 2. Verificar si ya tiene saldo previo de este producto
    const { data: saldoPrevio, error: errorSaldoPrevio } = await adminClient
      .from('saldos_servicio')
      .select('cantidad_disponible')
      .eq('id_cliente', id_cliente)
      .eq('id_producto', id_producto)
      .single();

    if (errorSaldoPrevio && errorSaldoPrevio.code !== 'PGRST116') {
      // PGRST116 is "Results contain 0 rows"
      throw errorSaldoPrevio;
    }

    if (saldoPrevio) {
      // Actualizar sumando la nueva cantidad
      const nuevaCantidad = saldoPrevio.cantidad_disponible + cantidad_comprada;
      const { error: errorUpdate } = await adminClient
        .from('saldos_servicio')
        .update({ cantidad_disponible: nuevaCantidad, updated_by: req.user.id })
        .eq('id_cliente', id_cliente)
        .eq('id_producto', id_producto);

      if (errorUpdate) throw errorUpdate;
    } else {
      // Insertar nuevo registro de saldo
      const { error: errorInsert } = await adminClient
        .from('saldos_servicio')
        .insert([{ 
          id_cliente, 
          id_producto, 
          cantidad_disponible: cantidad_comprada,
          updated_by: req.user.id 
        }]);

      if (errorInsert) throw errorInsert;
    }

    res.status(201).json({ mensaje: 'Recarga registrada exitosamente y saldo actualizado' });
  } catch (error) {
    if (sendValidationError(res, error)) return;
    res.status(500).json({ error: error.message });
  }
});

// OBTENER HISTORIAL DE RECARGAS Y CONSUMOS DE UN CLIENTE
router.get('/:id/historial', async (req, res) => {
  const id_cliente = req.params.id;
  try {
    const adminClient = getAdminClient();

    // 1. Obtener todas las recargas del cliente
    const { data: recargas, error: errRecargas } = await adminClient
      .from('recargas_saldo')
      .select('id_recarga, cantidad_comprada, monto_total, numero_factura, created_at, created_by, productos(nombre_producto)')
      .eq('id_cliente', id_cliente)
      .order('created_at', { ascending: false });

    if (errRecargas) throw errRecargas;

    // 2. Obtener todas las órdenes consumidas (estado 2) con Saldo Prepago del cliente
    const { data: ordenes, error: errOrdenes } = await adminClient
      .from('ordenes')
      .select(`
        id_orden,
        created_at,
        consumed_at,
        created_by,
        detalle_orden(
          cantidad,
          precio_aplicado,
          productos(nombre_producto)
        )
      `)
      .eq('id_cliente', id_cliente)
      .eq('id_estado', 2)
      .eq('metodo_pago', 'Saldo Prepago')
      .order('consumed_at', { ascending: false });

    if (errOrdenes) throw errOrdenes;

    // 3. Obtener nombres de empleados para ambas fuentes
    const { data: empleados } = await adminClient
      .from('empleados')
      .select('id, nombre, apellido');

    const empMap = {};
    (empleados || []).forEach(e => { empMap[e.id] = `${e.nombre} ${e.apellido}`; });

    // 4. Formatear recargas
    const eventosRecarga = (recargas || []).map(r => ({
      tipo: 'recarga',
      fecha: r.created_at,
      producto: r.productos?.nombre_producto || 'Sin producto',
      cantidad: r.cantidad_comprada,
      monto_total: r.monto_total,
      numero_factura: r.numero_factura || null,
      registrado_por: empMap[r.created_by] || 'Sistema',
      referencia: r.id_recarga
    }));

    // 5. Formatear consumos (una entrada por detalle de la orden)
    const eventosConsumo = [];
    for (const orden of (ordenes || [])) {
      for (const det of (orden.detalle_orden || [])) {
        eventosConsumo.push({
          tipo: 'consumo',
          fecha: orden.consumed_at || orden.created_at,
          producto: det.productos?.nombre_producto || 'Sin producto',
          cantidad: det.cantidad,
          precio_aplicado: det.precio_aplicado,
          registrado_por: empMap[orden.created_by] || 'Sistema',
          referencia: orden.id_orden
        });
      }
    }

    // 6. Combinar y ordenar por fecha descendente
    const historial = [...eventosRecarga, ...eventosConsumo]
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

    res.json(historial);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ELIMINAR CLIENTE
router.delete('/:id', async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const { id } = req.params;

    const { data: sub } = await adminClient
      .from('telegram_subscriptions')
      .select('chat_id')
      .eq('id_cliente', id)
      .maybeSingle();

    const { error } = await adminClient.from('clientes').delete().eq('id_cliente', id);

    if (error) {
      if (error.code === '23503') {
        return res.status(400).json({ error: 'No se puede eliminar el cliente porque tiene órdenes, recargas o registros asociados.' });
      }
      throw error;
    }

    if (sub?.chat_id) {
      await sendMessage(
        sub.chat_id,
        '🚫 <b>Cuenta Eliminada</b>\n\nTu cuenta ha sido eliminada del sistema de Ecencia Andina. Como resultado, tu suscripcion al bot de Telegram ha sido revocada permanentemente y todos tus datos asociados han sido borrados.\n\nGracias por utilizar nuestro servicio.',
        { remove_keyboard: true },
        'HTML'
      ).catch((err) => console.error('No se pudo notificar eliminacion de cuenta por Telegram:', err)); // NOSONAR
    }

    res.json({ success: true, message: 'Cliente eliminado correctamente' });
  } catch (error) {
    console.error('Error al eliminar cliente:', error);
    res.status(500).json({ error: 'Error interno del servidor al eliminar cliente' });
  }
});

// BORRADO FORZADO (HARD DELETE) - SOLO ADMINISTRADORES
router.delete('/:id/hard-delete', adminOnly, async (req, res) => {
  try {
    const adminClient = getAdminClient();
    const { id } = req.params;

    // 1. Obtener la suscripción para saber el chat_id y enviar el mensaje final
    const { data: sub } = await adminClient
      .from('telegram_subscriptions')
      .select('chat_id')
      .eq('id_cliente', id)
      .maybeSingle();

    // 2. Obtener todas las órdenes para borrar sus detalles
    const { data: ordenes } = await adminClient
      .from('ordenes')
      .select('id_orden')
      .eq('id_cliente', id);

    const ordenesIds = ordenes?.map((o) => o.id_orden) || [];

    if (ordenesIds.length > 0) {
      // 3. Borrar detalles de las órdenes
      await adminClient.from('detalle_orden').delete().in('id_orden', ordenesIds);
    }

    // 4. Borrar Órdenes
    await adminClient.from('ordenes').delete().eq('id_cliente', id);

    // 5. Borrar Recargas y Saldos
    await adminClient.from('recargas_saldo').delete().eq('id_cliente', id);
    await adminClient.from('saldos_servicio').delete().eq('id_cliente', id);

    // 6. Borrar Trazabilidad e Invitaciones
    await adminClient.from('telegram_order_traces').delete().eq('id_cliente', id);
    await adminClient.from('telegram_privacy_requests').delete().eq('id_cliente', id);
    await adminClient.from('telegram_invitations').delete().eq('id_cliente', id);

    // 7. Borrar Estado del Bot si hay chat_id
    if (sub?.chat_id) {
      await adminClient.from('telegram_bot_state').delete().in('key', [`consent:${sub.chat_id}`, `session:${sub.chat_id}`]);
    }

    // 8. Borrar Suscripciones
    await adminClient.from('telegram_subscriptions').delete().eq('id_cliente', id);

    // 9. Borrar Convenios
    await adminClient.from('clientes_convenios').delete().eq('id_cliente', id);

    // 10. Finalmente, Borrar Cliente
    const { error: finalError } = await adminClient.from('clientes').delete().eq('id_cliente', id);
    if (finalError) throw finalError;

    // 11. Enviar mensaje de despedida si estaba suscrito
    if (sub?.chat_id) {
      await sendMessage(
        sub.chat_id,
        '🚫 <b>Cuenta Eliminada (Borrado Forzado)</b>\n\nTu cuenta ha sido eliminada completamente del sistema de Ecencia Andina junto con todos tus datos y registros financieros. Ya no tienes acceso al bot.\n\nGracias por utilizar nuestro servicio.',
        { remove_keyboard: true },
        'HTML'
      ).catch((err) => console.error('No se pudo notificar eliminacion forzada por Telegram:', err)); // NOSONAR
    }

    res.json({ success: true, message: 'Cliente y todo su historial han sido eliminados de forma forzada.' });
  } catch (error) {
    console.error('Error en Borrado Forzado:', error);
    res.status(500).json({ error: error.message || 'Error interno del servidor al realizar el borrado forzado.' });
  }
});

module.exports = router;
