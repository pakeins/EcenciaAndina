const nodemailer = require('nodemailer');
const GRAPH_SEND_MAIL_URL = 'https://graph.microsoft.com/v1.0/me/sendMail';

const MAIL_STATUSES = {
  notAttempted: 'not_attempted',
  sent: 'sent',
  failed: 'failed',
  missingRecipient: 'missing_recipient',
  notConfigured: 'not_configured',
};

const trimForAudit = (value, max = 1000) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
};

const EMAIL_CTA_IMAGE_PATH = '/assets/email/telegram-invite-cta.png';
const DEFAULT_FROM_EMAIL = 'ecenciaconvenios@outlook.com';

const HTML_ESCAPE = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  '\'': '&#39;',
};

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => HTML_ESCAPE[char]);

// Recorte sin regex: /\/+$/ tiene backtracking superlineal segun Sonar.
const stripTrailingSlashes = (text) => {
  let end = text.length;
  while (end > 0 && text[end - 1] === '/') end -= 1;
  return text.slice(0, end);
};

const normalizePublicBaseUrl = (value) => {
  const raw = stripTrailingSlashes(String(value || '').trim());
  if (!raw) return '';

  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? stripTrailingSlashes(url.toString()) : '';
  } catch {
    return '';
  }
};

const buildPublicAssetUrl = (assetPath, env = process.env) => {
  const baseUrl = normalizePublicBaseUrl(env.PUBLIC_BACKEND_URL || env.N8N_ECENCIA_BACKEND_URL);
  const cleanPath = String(assetPath || '').replace(/^\/+/, '');
  return baseUrl && cleanPath ? `${baseUrl}/${cleanPath}` : '';
};

const mailConfig = (env = process.env) => ({
  fromEmail: String(env.OUTLOOK_FROM_EMAIL || '').trim().toLowerCase(),
  clientId: String(env.OUTLOOK_CLIENT_ID || '').trim(),
  clientSecret: String(env.OUTLOOK_CLIENT_SECRET || '').trim(),
  refreshToken: String(env.OUTLOOK_REFRESH_TOKEN || '').trim(),
  tenant: String(env.OUTLOOK_TOKEN_TENANT || 'consumers').trim() || 'consumers',
});

const missingMailConfig = (config) =>
  ['fromEmail', 'clientId', 'clientSecret', 'refreshToken']
    .filter((key) => !config[key]);

const buildTokenRequest = (config) => {
  const body = new URLSearchParams();
  body.set('client_id', config.clientId);
  body.set('client_secret', config.clientSecret);
  body.set('grant_type', 'refresh_token');
  body.set('refresh_token', config.refreshToken);
  body.set('scope', 'https://graph.microsoft.com/Mail.Send offline_access');
  return body;
};

const graphJson = async (response) => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};

const graphErrorMessage = async (response, fallback) => {
  const body = await graphJson(response);
  return trimForAudit(body?.error?.message || body?.error_description || body?.raw || fallback);
};

const getGraphAccessToken = async ({ fetchImpl = fetch, env } = {}) => {
  const config = mailConfig(env);
  const missing = missingMailConfig(config);
  if (missing.length) {
    const error = new Error(`Falta configuracion Outlook: ${missing.join(', ')}.`);
    error.code = 'MAIL_NOT_CONFIGURED';
    throw error;
  }

  const response = await fetchImpl(`https://login.microsoftonline.com/${config.tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: buildTokenRequest(config),
  });

  if (!response.ok) {
    throw new Error(await graphErrorMessage(response, `Microsoft token endpoint rechazo la solicitud (${response.status}).`));
  }

  const body = await graphJson(response);
  if (!body.access_token) throw new Error('Microsoft no devolvio access_token.');
  return { accessToken: body.access_token, fromEmail: config.fromEmail };
};

const buildInvitationHtml = ({ firstName, inviteLink, fromEmail }) => {
  const safeFirstName = escapeHtml(firstName);
  const safeInviteLink = inviteLink ? escapeHtml(inviteLink) : '';
  const safeFromEmail = escapeHtml(fromEmail);

  const actionBlock = safeInviteLink
    ? `
      <tr>
        <td align="center" style="padding: 30px 0;">
          <a href="${safeInviteLink}" target="_blank" style="display:inline-block;background-color:#0f172a;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;font-weight:600;line-height:20px;text-decoration:none;padding:16px 32px;border-radius:8px;box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
            Abrir bot en Telegram
          </a>
        </td>
      </tr>
      <tr>
        <td style="padding:0 32px 24px;text-align:center;">
          <p style="margin:0;color:#64748b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:19px;">
            Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
            <a href="${safeInviteLink}" target="_blank" style="color:#0ea5e9;word-break:break-all;text-decoration:none;">${safeInviteLink}</a>
          </p>
        </td>
      </tr>`
    : `
      <tr>
        <td style="padding:0 32px 24px;">
          <div style="background-color:#fef2f2;border-left:4px solid #ef4444;padding:16px;">
            <p style="margin:0;color:#991b1b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:20px;">
              <strong>Atención:</strong> El link de registro no está disponible en este momento. Por favor contacta al administrador.
            </p>
          </div>
        </td>
      </tr>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invitación a ECencia Andina</title>
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;color:transparent;opacity:0;">
    Registra tu Telegram para recibir el menú cuando ECencia Andina lo envíe.
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f8fafc;margin:0;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);">
          
          <!-- Header -->
          <tr>
            <td style="background-color:#0f172a;padding:40px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">
                ECencia Andina
              </h1>
              <p style="margin:8px 0 0;color:#94a3b8;font-size:14px;letter-spacing:1px;text-transform:uppercase;">
                Tradición Natural
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 32px 10px;">
              <h2 style="margin:0 0 16px;color:#1e293b;font-size:20px;font-weight:600;line-height:28px;">
                ¡Hola ${safeFirstName}!
              </h2>
              <p style="margin:0;color:#475569;font-size:16px;line-height:26px;">
                Te invitamos a vincular tu cuenta de Telegram con ECencia Andina. Esto te permitirá <strong>recibir el menú del día</strong> directamente en tu celular y realizar tus reservas de manera rápida y sencilla.
              </p>
            </td>
          </tr>

          <!-- Action -->
          ${actionBlock}

          <!-- Instructions -->
          <tr>
            <td style="padding:0 32px 32px;">
              <div style="background-color:#f1f5f9;border-radius:8px;padding:24px;">
                <h3 style="margin:0 0 12px;color:#334155;font-size:15px;font-weight:600;">
                  Pasos para completar el registro:
                </h3>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td width="24" valign="top" style="padding-bottom:8px;color:#0ea5e9;font-weight:bold;">1.</td>
                    <td style="padding-bottom:8px;color:#475569;font-size:14px;line-height:20px;">Abre el bot usando el botón de arriba.</td>
                  </tr>
                  <tr>
                    <td width="24" valign="top" style="padding-bottom:8px;color:#0ea5e9;font-weight:bold;">2.</td>
                    <td style="padding-bottom:8px;color:#475569;font-size:14px;line-height:20px;">Presiona <strong>Iniciar</strong> (o Start) y acepta el aviso de privacidad.</td>
                  </tr>
                  <tr>
                    <td width="24" valign="top" style="color:#0ea5e9;font-weight:bold;">3.</td>
                    <td style="color:#475569;font-size:14px;line-height:20px;">Presiona el botón para <strong>Compartir tu contacto</strong> y ¡listo!</td>
                  </tr>
                </table>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f8fafc;border-top:1px solid #e2e8f0;padding:24px 32px;text-align:center;">
              <p style="margin:0;color:#64748b;font-size:13px;line-height:20px;">
                ¿Tienes alguna duda? Contáctanos respondiendo a este correo:
                <br>
                <a href="mailto:${safeFromEmail}" style="color:#0ea5e9;text-decoration:none;font-weight:500;">${safeFromEmail}</a>
              </p>
              <p style="margin:16px 0 0;color:#94a3b8;font-size:12px;">
                &copy; ${new Date().getFullYear()} ECencia Andina. Todos los derechos reservados.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

const buildInvitationEmail = ({ nombre, inviteLink, invitationMessage, env = process.env }) => {
  const firstName = String(nombre || '').trim() || 'cliente';
  const fromEmail = String(env.OUTLOOK_FROM_EMAIL || DEFAULT_FROM_EMAIL).trim().toLowerCase() || DEFAULT_FROM_EMAIL;
  const ctaImageUrl = buildPublicAssetUrl(EMAIL_CTA_IMAGE_PATH, env);
  return {
    subject: 'Tu invitacion al bot de ECencia Andina',
    text: [
      `Hola ${firstName},`,
      '',
      'Te invitamos a vincular tu Telegram con tu registro de cliente para recibir el menu del dia cuando ECencia Andina lo envie y reservar almuerzos desde el bot.',
      '',
      inviteLink ? `Abre tu invitacion: ${inviteLink}` : 'El link de registro no esta disponible. Contacta al administrador de ECencia Andina.',
      '',
      'Para completar el registro:',
      '1. Abre el bot desde el enlace.',
      '2. Acepta el aviso de privacidad.',
      '3. Comparte tu telefono usando el boton de Telegram.',
      '',
      invitationMessage || '',
      '',
      'Atentamente,',
      'Equipo ECencia Andina',
      'TRADICION NATURAL',
      fromEmail,
    ].filter((line, index, all) => line || all[index - 1] !== '').join('\n'),
    html: buildInvitationHtml({ firstName, inviteLink, ctaImageUrl, fromEmail }),
  };
};

const sendOutlookMail = async ({ to, subject, text, html }, options = {}) => {
  const recipient = String(to || '').trim().toLowerCase();
  if (!recipient) {
    const error = new Error('El cliente no tiene correo para enviar la invitacion.');
    error.code = 'MAIL_MISSING_RECIPIENT';
    throw error;
  }

  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_APP_PASSWORD,
        },
      });

      const mailOptions = {
        from: process.env.INVITATION_FROM_EMAIL || `"ECencia Andina" <${process.env.GMAIL_USER}>`,
        to: recipient,
        subject,
        text,
        html,
      };
      if (process.env.INVITATION_REPLY_TO) {
        mailOptions.replyTo = process.env.INVITATION_REPLY_TO;
      }

      const info = await transporter.sendMail(mailOptions);
      return {
        status: MAIL_STATUSES.sent,
        providerRequestId: info.messageId || null,
      };
    } catch (gmailError) {
      console.error('Nodemailer Gmail failed, trying Outlook Graph if configured...', gmailError.message);
    }
  }

  const { accessToken } = await getGraphAccessToken(options);
  const response = await (options.fetchImpl || fetch)(GRAPH_SEND_MAIL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        subject,
        body: {
          contentType: html ? 'HTML' : 'Text',
          content: html || text,
        },
        toRecipients: [{ emailAddress: { address: recipient } }],
      },
      saveToSentItems: true,
    }),
  });

  if (!response.ok) {
    throw new Error(await graphErrorMessage(response, `Microsoft Graph rechazo el envio (${response.status}).`));
  }

  return {
    status: MAIL_STATUSES.sent,
    providerRequestId: response.headers?.get?.('request-id') || response.headers?.get?.('x-ms-request-id') || null,
  };
};

module.exports = {
  MAIL_STATUSES,
  buildInvitationEmail,
  sendOutlookMail,
  _private: {
    buildPublicAssetUrl,
    escapeHtml,
    getGraphAccessToken,
    mailConfig,
    missingMailConfig,
    normalizePublicBaseUrl,
    trimForAudit,
  },
};
