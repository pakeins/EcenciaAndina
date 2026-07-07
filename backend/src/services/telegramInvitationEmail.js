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
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    auth: {
      user: process.env.GMAIL_USER || 'ecencia.andina.notificaciones@gmail.com',
      pass: process.env.GMAIL_APP_PASSWORD || '',
    },
  });

  cachedTransporter.on('error', (err) => {
    console.error('Nodemailer background error:', err.message);
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
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; color: #1a1a1a; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
        <!-- Simple Header -->
        <div style="background-color: #f8fafc; padding: 40px 32px; text-align: center; border-bottom: 2px solid #e2e8f0;">
          <h1 style="margin: 0; color: #2F4D49; font-size: 28px; font-weight: 800; letter-spacing: -0.5px;">Ecencia Andina</h1>
          <p style="margin: 12px 0 0; color: #64748b; font-size: 16px; font-weight: 500;">Servicio exclusivo de almuerzos corporativos</p>
        </div>
        
        <!-- Content -->
        <div style="padding: 40px 32px;">
          <h2 style="margin: 0 0 24px; font-size: 22px; color: #0f172a;">¡Hola, <strong>${safeName}</strong>! 👋</h2>
          <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6; color: #475569;">
            Tu cuenta corporativa ha sido creada exitosamente. Desde ahora, podras gestionar tus reservas diarias, consultar el menu y realizar modificaciones directamente desde tu celular de forma automatica y rapida.
          </p>
          
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px 24px; margin-bottom: 32px; text-align: center;">
            <p style="margin: 0 0 24px; font-size: 16px; font-weight: 600; color: #0f172a;">Activa tu asistente virtual en Telegram</p>
            <!-- Primary Action -->
            <a href="${safeUrl}" style="display: inline-block; background-color: #24A1DE; color: #ffffff; padding: 16px 32px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 16px; text-transform: uppercase; letter-spacing: 0.5px;">
              Conectar Telegram
            </a>
            <p style="margin: 20px 0 0; font-size: 12px; color: #94a3b8; word-break: break-all;">
              O copia este enlace: <a href="${safeUrl}" style="color: #3b82f6; text-decoration: none;">${safeUrl}</a>
            </p>
          </div>

          <!-- QR Code Section -->
          <div style="text-align: center; padding-top: 32px; border-top: 1px solid #e2e8f0;">
            <p style="margin: 0 0 16px; font-size: 14px; color: #64748b; font-weight: 500;">¿Abriendo esto desde tu computadora? Escanea el codigo QR:</p>
            <div style="background: #ffffff; padding: 12px; border-radius: 16px; display: inline-block; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
              <img src="cid:telegram-activation-qr" width="180" height="180" alt="Codigo QR" style="display: block; border-radius: 8px;" />
            </div>
          </div>
        </div>
        
        <!-- Footer -->
        <div style="background-color: #f8fafc; padding: 24px 32px; text-align: center; border-top: 1px solid #e2e8f0;">
          <p style="margin: 0 0 12px; font-size: 13px; font-weight: 600; color: #ef4444;">
            ⏳ Este enlace de activacion expira el ${escapeHtml(expiresLabel || 'en 7 dias')}
          </p>
          <p style="margin: 0 0 8px; font-size: 12px; color: #94a3b8;">
            Si no solicitaste este acceso, por favor ignora este correo.
          </p>
          <p style="margin: 0; font-size: 12px; color: #cbd5e1; font-weight: 500;">
            © ${new Date().getFullYear()} Ecencia Andina. Todos los derechos reservados.
          </p>
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
    const botUsername = String(process.env.TELEGRAM_BOT_USERNAME || 'EcenciaAndinaBot').replace('@', '');
    const botUrl = `https://t.me/${botUsername}`;

    const info = await transporter.sendMail({
      from: `"Eciencia Andina" <${user}>`,
      to: recipient,
      replyTo: replyTo || undefined,
      subject: 'Renueva tu acceso al bot de Ecencia Andina',
      text:
        `Hola ${clientName || 'cliente'}.\n\n` +
        'Un administrador de Ecencia Andina ha solicitado renovar tu acceso al bot de Telegram.\n' +
        `Puedes revisar el mensaje abriendo este enlace en tu celular: ${botUrl}`,
      html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; color: #1a1a1a; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
        <!-- Simple Header -->
        <div style="background-color: #f8fafc; padding: 40px 32px; text-align: center; border-bottom: 2px solid #e2e8f0;">
          <h1 style="margin: 0; color: #2F4D49; font-size: 28px; font-weight: 800; letter-spacing: -0.5px;">Ecencia Andina</h1>
          <p style="margin: 12px 0 0; color: #64748b; font-size: 16px; font-weight: 500;">Renovación de Acceso</p>
        </div>
        
        <!-- Content -->
        <div style="padding: 40px 32px;">
          <h2 style="margin: 0 0 24px; font-size: 22px; color: #0f172a;">¡Hola de nuevo, <strong>${escapeHtml(clientName || 'cliente')}</strong>! 👋</h2>
          <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6; color: #475569;">
            La administración de Ecencia Andina ha enviado una solicitud para <strong>reactivar tu cuenta</strong> en nuestro asistente virtual de Telegram.
          </p>
          <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6; color: #475569;">
            La notificación te ha llegado directamente a tu chat de Telegram. Puedes abrir la aplicación y presionar "Aceptar" para continuar usando el servicio de almuerzos corporativos.
          </p>
          
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px 24px; text-align: center;">
            <p style="margin: 0 0 24px; font-size: 16px; font-weight: 600; color: #0f172a;">Ir directamente al Bot</p>
            <!-- Primary Action -->
            <a href="${botUrl}" style="display: inline-block; background-color: #24A1DE; color: #ffffff; padding: 16px 32px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 16px; text-transform: uppercase; letter-spacing: 0.5px;">
              Abrir Telegram
            </a>
            <p style="margin: 20px 0 0; font-size: 12px; color: #94a3b8; word-break: break-all;">
              O usa este enlace: <a href="${botUrl}" style="color: #3b82f6; text-decoration: none;">${botUrl}</a>
            </p>
          </div>
        </div>
        
        <!-- Footer -->
        <div style="background-color: #f8fafc; padding: 24px 32px; text-align: center; border-top: 1px solid #e2e8f0;">
          <p style="margin: 0; font-size: 12px; color: #cbd5e1; font-weight: 500;">
            © ${new Date().getFullYear()} Ecencia Andina. Todos los derechos reservados.
          </p>
        </div>
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

const sendPrivacyRequestNotificationEmail = async (client, requestData) => {
  const recipient = String(process.env.TELEGRAM_PRIVACY_CONTACT || process.env.ADMIN_SEED_EMAIL || '').trim();
  const user = String(process.env.GMAIL_USER || 'ecencia.andina.notificaciones@gmail.com').trim();

  if (!recipient || !user) return false;

  const clientName = `${client?.nombre || ''} ${client?.apellido || ''}`.trim();
  
  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: `"Eciencia Andina Privacidad" <${user}>`,
      to: recipient,
      subject: `Nueva Solicitud de Eliminacion de Datos - ${clientName}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#3b2417">
          <h1 style="font-size:24px">Solicitud de Privacidad</h1>
          <p>El cliente <strong>${escapeHtml(clientName)}</strong> (Tel: ${escapeHtml(client?.telefono || 'No registrado')}) ha solicitado la eliminacion de sus datos personales a traves del bot de Telegram.</p>
          <p>La solicitud ha sido registrada automaticamente en la base de datos con el ID: <strong>${escapeHtml(requestData.id)}</strong>.</p>
          <p>Por favor, ingresa al panel de administracion en la seccion <strong>Clientes &gt; Privacidad</strong> para gestionar esta solicitud.</p>
        </div>
      `,
    });
    return true;
  } catch (error) {
    console.error('No se pudo enviar la notificacion de privacidad:', error.message);
    return false;
  }
};

module.exports = {
  DELIVERY_STATUS,
  buildInvitationEmail,
  normalizeEmail,
  sendTelegramReactivationEmail,
  sendTelegramInvitationEmail,
  sendPrivacyRequestNotificationEmail,
};
