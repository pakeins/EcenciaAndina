const QRCode = require('qrcode');
const nodemailer = require('nodemailer');
const { getAdminClient } = require('../config/supabase');

const DELIVERY_STATUS = Object.freeze({
  NOT_CONFIGURED: 'not_configured',
  PENDING: 'pending',
  SENT: 'sent',
  FAILED: 'failed',
});

const escapeHtml = (value) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const deliverySummary = (status, recipient, providerId = null) => ({
  status,
  recipient,
  provider_id: providerId || null,
});

const updateInvitationDelivery = async (
  invitationId,
  values,
  createClient = getAdminClient,
) => {
  if (!invitationId) return;
  const { error } = await createClient()
    .from('telegram_invitations')
    .update(values)
    .eq('id', invitationId);
  if (error) throw error;
};

const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER || 'ecencia.andina.notificaciones@gmail.com',
      pass: process.env.GMAIL_APP_PASSWORD || '',
    },
  });
};

const buildInvitationEmail = async ({ client, onboarding }) => {
  const clientName = `${client.nombre || ''} ${client.apellido || ''}`.trim();
  const expiresAt = new Date(onboarding.expires_at);
  const expiresLabel = Number.isNaN(expiresAt.getTime())
    ? ''
    : expiresAt.toLocaleString('es-EC', {
      timeZone: process.env.REPORT_TIMEZONE || 'America/Bogota',
      dateStyle: 'long',
      timeStyle: 'short',
    });
  const safeName = escapeHtml(clientName || 'cliente');
  const safeUrl = escapeHtml(onboarding.onboarding_url);
  const qrBuffer = await QRCode.toBuffer(onboarding.onboarding_url, {
    type: 'png',
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 480,
    color: { dark: '#3b2417', light: '#ffffff' },
  });

  return {
    subject: 'Activa tus reservas de Eciencia Andina en Telegram',
    text:
      `Hola ${clientName || 'cliente'}.\n\n` +
      'Activa tu acceso al bot de Eciencia Andina usando este enlace privado:\n' +
      `${onboarding.onboarding_url}\n\n` +
      `El enlace vence ${expiresLabel || 'en 7 dias'} y solo puede reclamarse una vez.\n` +
      'No reenvies este correo. Si no solicitaste el registro, contacta a Eciencia Andina.',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#3b2417">
        <h1 style="font-size:24px">Activa tus reservas por Telegram</h1>
        <p>Hola <strong>${safeName}</strong>.</p>
        <p>Usa el boton o escanea el QR para abrir el bot de Eciencia Andina. El enlace es privado y solo puede reclamarse una vez.</p>
        <p style="margin:28px 0">
          <a href="${safeUrl}" style="background:#2f4d49;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">
            Abrir Telegram
          </a>
        </p>
        <div style="text-align:center;margin:24px 0">
          <img src="cid:telegram-activation-qr" width="260" height="260" alt="QR de activacion de Telegram" />
        </div>
        <p style="font-size:13px;color:#61603c">Vigencia: ${escapeHtml(expiresLabel || '7 dias')}.</p>
        <p style="font-size:12px;color:#6b7280">No reenvies este correo. Tambien puedes copiar este enlace:</p>
        <p style="font-size:12px;word-break:break-all">${safeUrl}</p>
      </div>
    `,
    qrBuffer,
  };
};

const sendTelegramReactivationEmail = async (
  { client }
) => {
  const recipient = normalizeEmail(client?.correo);
  const user = String(process.env.GMAIL_USER || 'ecencia.andina.notificaciones@gmail.com').trim();
  const pass = String(process.env.GMAIL_APP_PASSWORD || '').trim();
  const replyTo = String(process.env.INVITATION_REPLY_TO || '').trim();

  if (!recipient) return deliverySummary(DELIVERY_STATUS.FAILED, recipient);
  if (!user || !pass) {
    return deliverySummary(DELIVERY_STATUS.NOT_CONFIGURED, recipient);
  }

  const clientName = `${client.nombre || ''} ${client.apellido || ''}`.trim();
  try {
    const transporter = createTransporter();
    const info = await transporter.sendMail({
      from: `"Eciencia Andina" <${user}>`,
      to: recipient,
      replyTo: replyTo || undefined,
      subject: 'Reactivacion de Telegram en Eciencia Andina',
      text:
        `Hola ${clientName || 'cliente'}.\n\n` +
        'Un administrador solicito renovar tu consentimiento de Telegram. ' +
        'El aviso fue enviado directamente al chat que ya tenias vinculado.',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#3b2417">
          <h1 style="font-size:24px">Revisa Telegram</h1>
          <p>Hola <strong>${escapeHtml(clientName || 'cliente')}</strong>.</p>
          <p>Un administrador solicito renovar tu consentimiento. El aviso fue enviado directamente al chat de Telegram que ya tenias vinculado.</p>
          <p>Este correo no contiene enlaces privados ni solicita compartir credenciales.</p>
        </div>
      `,
    });
    return deliverySummary(DELIVERY_STATUS.SENT, recipient, info.messageId || null);
  } catch (error) {
    console.error('No se pudo enviar la notificacion de reactivacion:', error.message);
    return deliverySummary(DELIVERY_STATUS.FAILED, recipient);
  }
};

const sendTelegramInvitationEmail = async (
  { client, onboarding },
  { createClient = getAdminClient, getTransporter = createTransporter } = {},
) => {
  const recipient = normalizeEmail(client?.correo);
  const invitationId = onboarding?.invitationId;
  const user = String(process.env.GMAIL_USER || 'ecencia.andina.notificaciones@gmail.com').trim();
  const pass = String(process.env.GMAIL_APP_PASSWORD || '').trim();
  const replyTo = String(process.env.INVITATION_REPLY_TO || '').trim();
  const attemptedAt = new Date().toISOString();

  if (!recipient || !onboarding?.onboarding_url || !invitationId) {
    return deliverySummary(DELIVERY_STATUS.FAILED, recipient);
  }

  if (!user || !pass) {
    await updateInvitationDelivery(
      invitationId,
      {
        email_delivery_status: DELIVERY_STATUS.NOT_CONFIGURED,
        email_recipient: recipient,
        email_provider_id: null,
        email_attempted_at: attemptedAt,
        email_sent_at: null,
      },
      createClient,
    );
    return deliverySummary(DELIVERY_STATUS.NOT_CONFIGURED, recipient);
  }

  await updateInvitationDelivery(
    invitationId,
    {
      email_delivery_status: DELIVERY_STATUS.PENDING,
      email_recipient: recipient,
      email_provider_id: null,
      email_attempted_at: attemptedAt,
      email_sent_at: null,
    },
    createClient,
  );

  try {
    const content = await buildInvitationEmail({ client, onboarding });
    const transporter = getTransporter();
    
    const info = await transporter.sendMail({
      from: `"Eciencia Andina" <${user}>`,
      to: recipient,
      replyTo: replyTo || undefined,
      subject: content.subject,
      text: content.text,
      html: content.html,
      attachments: [
        {
          filename: 'activacion-telegram.png',
          content: content.qrBuffer,
          cid: 'telegram-activation-qr',
        },
      ],
    });

    const providerId = info.messageId || null;
    await updateInvitationDelivery(
      invitationId,
      {
        email_delivery_status: DELIVERY_STATUS.SENT,
        email_recipient: recipient,
        email_provider_id: providerId,
        email_sent_at: new Date().toISOString(),
      },
      createClient,
    );
    return deliverySummary(DELIVERY_STATUS.SENT, recipient, providerId);
  } catch (error) {
    await updateInvitationDelivery(
      invitationId,
      {
        email_delivery_status: DELIVERY_STATUS.FAILED,
        email_recipient: recipient,
        email_provider_id: null,
        email_sent_at: null,
      },
      createClient,
    );
    console.error('No se pudo enviar la invitacion Telegram por correo:', error.message);
    return deliverySummary(DELIVERY_STATUS.FAILED, recipient);
  }
};

module.exports = {
  DELIVERY_STATUS,
  buildInvitationEmail,
  normalizeEmail,
  sendTelegramReactivationEmail,
  sendTelegramInvitationEmail,
};
