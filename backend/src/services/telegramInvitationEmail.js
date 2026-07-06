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

let cachedTransporter = null;

const createTransporter = () => {
  if (cachedTransporter) return cachedTransporter;

  cachedTransporter = nodemailer.createTransport({
    service: 'gmail',
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    auth: {
      user: process.env.GMAIL_USER || 'ecencia.andina.notificaciones@gmail.com',
      pass: process.env.GMAIL_APP_PASSWORD || '',
    },
  });

  return cachedTransporter;
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
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;background-color:#1c1c1c;color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.1)">
        <div style="background-color:#d35400;padding:20px;text-align:center;">
          <h2 style="margin:0;color:#ffffff;font-size:18px;">¡Bienvenido a Ecencia Andina, ${safeName}!</h2>
        </div>
        <div style="padding:30px 20px;">
          <p style="margin:0 0 16px;line-height:1.5;">Estamos emocionados de tenerte con nosotros. Tu cuenta ha sido creada exitosamente en nuestro sistema.</p>
          <p style="margin:0 0 20px;line-height:1.5;">Desde ahora podrás pedir tus almuerzos, ver el menú diario y gestionar tus reservas directamente desde tu celular.</p>
          <p style="margin:0 0 24px;font-weight:bold;">Da clic en el siguiente botón para empezar:</p>
          <div style="text-align:center;margin-bottom:30px;">
            <a href="${safeUrl}" style="display:inline-block;background-color:#0088cc;color:#ffffff;padding:14px 24px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">
              Iniciar registro en Telegram
            </a>
          </div>
          <p style="margin:0 0 8px;font-size:14px;color:#a0a0a0;">Si el botón no funciona, copia y pega este enlace en tu navegador:</p>
          <p style="margin:0 0 24px;font-size:14px;word-break:break-all;"><a href="${safeUrl}" style="color:#0088cc;">${safeUrl}</a></p>
          
          <div style="text-align:center;margin:30px 0;">
            <p style="margin:0 0 12px;font-size:14px;color:#a0a0a0;">También puedes escanear este código QR:</p>
            <img src="cid:telegram-activation-qr" width="220" height="220" alt="QR de activacion de Telegram" style="border-radius:8px;border:4px solid #ffffff;" />
          </div>
          
          <p style="font-size:12px;color:#888888;text-align:center;">Vigencia del enlace: ${escapeHtml(expiresLabel || '7 dias')}.</p>
        </div>
        <div style="background-color:#121212;padding:20px;text-align:center;border-top:1px solid #333333;">
          <p style="margin:0 0 8px;font-size:12px;color:#888888;">Ecencia Andina © 2026</p>
          <p style="margin:0;font-size:12px;color:#888888;">Este es un mensaje automático, por favor no respondas a este correo.</p>
        </div>
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
