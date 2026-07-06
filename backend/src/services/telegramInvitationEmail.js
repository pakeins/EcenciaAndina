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
      <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; color: #333333; border-radius: 12px; overflow: hidden; box-shadow: 0 8px 24px rgba(0,0,0,0.08); border: 1px solid #eaeaea;">
        <!-- Cabecera -->
        <div style="background: linear-gradient(135deg, #d35400 0%, #e67e22 100%); padding: 32px 20px; text-align: center;">
          <h1 style="margin: 0; color: #ffffff; font-size: 26px; font-weight: bold; letter-spacing: 0.5px;">¡Bienvenido a Ecencia Andina!</h1>
          <p style="margin: 8px 0 0; color: #ffeaa7; font-size: 16px;">Hola, <strong>${safeName}</strong></p>
        </div>
        
        <!-- Cuerpo -->
        <div style="padding: 40px 32px;">
          <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #4a4a4a;">Estamos muy emocionados de tenerte con nosotros. Tu cuenta ha sido creada exitosamente y ya eres parte de la familia Ecencia.</p>
          
          <div style="background-color: #f8f9fa; border-left: 4px solid #2f4d49; padding: 16px; margin-bottom: 28px; border-radius: 0 8px 8px 0;">
            <p style="margin: 0; font-size: 15px; line-height: 1.5; color: #555555;">Desde ahora podrás pedir tus almuerzos, ver el menú diario y gestionar tus reservas <strong>directamente desde tu celular</strong>.</p>
          </div>
          
          <p style="margin: 0 0 24px; font-size: 16px; font-weight: bold; text-align: center; color: #2c3e50;">Para empezar, activa tu cuenta de Telegram:</p>
          
          <!-- Botón de acción -->
          <div style="text-align: center; margin-bottom: 32px;">
            <a href="${safeUrl}" style="display: inline-block; background-color: #2f4d49; color: #ffffff; padding: 16px 32px; border-radius: 50px; text-decoration: none; font-weight: bold; font-size: 16px; box-shadow: 0 4px 12px rgba(47, 77, 73, 0.3);">
              Iniciar registro en Telegram
            </a>
          </div>
          
          <hr style="border: none; border-top: 1px solid #eeeeee; margin: 32px 0;" />
          
          <!-- Sección QR -->
          <div style="text-align: center; margin-bottom: 24px;">
            <p style="margin: 0 0 16px; font-size: 14px; color: #666666;">¿Estás en tu computadora? Escanea este código QR con la cámara de tu celular:</p>
            <img src="cid:telegram-activation-qr" width="200" height="200" alt="QR de activación" style="border-radius: 12px; border: 1px solid #eeeeee; padding: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);" />
          </div>

          <!-- Enlace alternativo -->
          <div style="background-color: #f9f9f9; padding: 16px; border-radius: 8px; text-align: center;">
            <p style="margin: 0 0 8px; font-size: 13px; color: #777777;">Si el botón no funciona, copia y pega este enlace:</p>
            <p style="margin: 0; font-size: 12px; word-break: break-all;"><a href="${safeUrl}" style="color: #0088cc; text-decoration: none;">${safeUrl}</a></p>
          </div>
        </div>
        
        <!-- Pie de página -->
        <div style="background-color: #f4f6f8; padding: 24px; text-align: center; border-top: 1px solid #eaeaea;">
          <p style="margin: 0 0 8px; font-size: 13px; font-weight: bold; color: #95a5a6;">Vigencia del enlace: ${escapeHtml(expiresLabel || '7 dias')}</p>
          <p style="margin: 0 0 8px; font-size: 12px; color: #a4b0be;">Ecencia Andina © 2026</p>
          <p style="margin: 0; font-size: 11px; color: #b2bec3;">Este es un mensaje automático, por favor no respondas a este correo.</p>
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
