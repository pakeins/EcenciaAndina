let nodemailer = require('nodemailer');
if (process.env.NODE_ENV === 'test') {
  nodemailer = {
    createTransport: () => ({
      sendMail: async (options) => {
        if (global.__mockNodemailerSendMailError) {
          throw global.__mockNodemailerSendMailError;
        }
        return { messageId: global.__mockNodemailerMessageId || 'mock-gmail-id' };
      }
    })
  };
}
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

const buildInvitationHtml = ({ firstName, inviteLink, ctaImageUrl, fromEmail }) => {
  const safeFirstName = escapeHtml(firstName);
  const safeInviteLink = inviteLink ? escapeHtml(inviteLink) : '';
  const safeImageUrl = ctaImageUrl ? escapeHtml(ctaImageUrl) : '';
  const safeFromEmail = escapeHtml(fromEmail);

  const imageBlock = safeImageUrl && safeInviteLink
    ? `
      <tr>
        <td style="padding:0 0 22px;">
          <a href="${safeInviteLink}" target="_blank" style="text-decoration:none;">
            <img src="${safeImageUrl}" width="600" alt="Abrir bot de ECencia Andina en Telegram" style="display:block;width:100%;max-width:600px;border:0;border-radius:16px;">
          </a>
        </td>
      </tr>`
    : '';

  const actionBlock = safeInviteLink
    ? `
      <tr>
        <td align="center" style="padding:10px 0 24px;">
          <a href="${safeInviteLink}" target="_blank" style="display:inline-block;background:#2F4D49;color:#FFFFFF;font-family:Arial,sans-serif;font-size:16px;font-weight:700;line-height:20px;text-decoration:none;padding:14px 24px;border-radius:6px;">
            Abrir invitaci&oacute;n en Telegram
          </a>
        </td>
      </tr>
      <tr>
        <td style="padding:0 0 24px;">
          <p style="margin:0;color:#61603C;font-family:Arial,sans-serif;font-size:13px;line-height:19px;">
            Si el bot&oacute;n o la imagen no abre, copia y pega este enlace en tu navegador:
            <br>
            <a href="${safeInviteLink}" target="_blank" style="color:#7A402E;word-break:break-all;">${safeInviteLink}</a>
          </p>
        </td>
      </tr>`
    : `
      <tr>
        <td style="padding:0 0 24px;">
          <p style="margin:0;color:#7A402E;font-family:Arial,sans-serif;font-size:15px;line-height:22px;">
            El link de registro no est&aacute; disponible. Contacta al administrador de ECencia Andina.
          </p>
        </td>
      </tr>`;

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#D1CDC4;">
    <div style="display:none;max-height:0;overflow:hidden;color:transparent;opacity:0;">
      Registra tu Telegram para recibir el men&uacute; cuando ECencia Andina lo env&iacute;e.
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#D1CDC4;margin:0;padding:24px 0;">
      <tr>
        <td align="center" style="padding:0 12px;">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#FFFFFF;border-radius:16px;overflow:hidden;">
            ${imageBlock}
            <tr>
              <td style="padding:0 28px 8px;">
                <p style="margin:0 0 12px;color:#7A402E;font-family:Arial,sans-serif;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">
                  ECencia Andina
                </p>
                <h1 style="margin:0 0 12px;color:#2F4D49;font-family:Arial,sans-serif;font-size:28px;line-height:34px;">
                  Hola ${safeFirstName}, activa tu registro en Telegram
                </h1>
                <p style="margin:0;color:#2F4D49;font-family:Arial,sans-serif;font-size:16px;line-height:24px;">
                  Te invitamos a vincular tu Telegram con tu registro de cliente para recibir el men&uacute; del d&iacute;a cuando ECencia Andina lo env&iacute;e y reservar tus almuerzos desde el bot.
                </p>
              </td>
            </tr>
            ${actionBlock}
            <tr>
              <td style="padding:0 28px 24px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#D1CDC4;border-radius:8px;">
                  <tr>
                    <td style="padding:18px 20px;">
                      <p style="margin:0 0 10px;color:#2F4D49;font-family:Arial,sans-serif;font-size:15px;font-weight:700;line-height:22px;">
                        Para completar el registro:
                      </p>
                      <p style="margin:0;color:#2F4D49;font-family:Arial,sans-serif;font-size:14px;line-height:22px;">
                        1. Abre el bot desde la imagen, el bot&oacute;n o el enlace.<br>
                        2. Acepta el aviso de privacidad.<br>
                        3. Comparte tu tel&eacute;fono usando el bot&oacute;n de Telegram.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 30px;">
                <table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="border-top:1px solid #D1CDC4;padding-top:18px;">
                  <tr>
                    <td valign="top">
                      <p style="margin:0;color:#2F4D49;font-family:Arial,sans-serif;font-size:15px;font-weight:700;line-height:20px;">
                        Equipo ECencia Andina
                      </p>
                      <p style="margin:0;color:#7A402E;font-family:Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:.08em;line-height:18px;">
                        TRADICION NATURAL
                      </p>
                      <p style="margin:4px 0 0;color:#61603C;font-family:Arial,sans-serif;font-size:13px;line-height:19px;">
                        <a href="mailto:${safeFromEmail}" style="color:#61603C;text-decoration:none;">${safeFromEmail}</a>
                      </p>
                    </td>
                  </tr>
                </table>
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
  const env = options.env || process.env;
  const recipient = String(to || '').trim().toLowerCase();
  if (!recipient) {
    const error = new Error('El cliente no tiene correo para enviar la invitacion.');
    error.code = 'MAIL_MISSING_RECIPIENT';
    throw error;
  }

  if (env.GMAIL_USER && env.GMAIL_APP_PASSWORD) {
    try {
      const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
          user: env.GMAIL_USER,
          pass: env.GMAIL_APP_PASSWORD,
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
