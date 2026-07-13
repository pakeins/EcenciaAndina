import { describe, expect, it, vi, beforeEach } from 'vitest';
import outlookMail from '../services/outlookMail.js';
const { buildInvitationEmail, sendOutlookMail, MAIL_STATUSES, _private } = outlookMail;
const {
  buildPublicAssetUrl,
  escapeHtml,
  getGraphAccessToken,
  mailConfig,
  missingMailConfig,
  normalizePublicBaseUrl,
  trimForAudit,
} = _private;

describe('outlookMail utility functions', () => {
  describe('trimForAudit', () => {
    it('debe recortar textos largos', () => {
      expect(trimForAudit('abc', 10)).toBe('abc');
      expect(trimForAudit('a '.repeat(20), 10)).toBe('a a a a...');
    });
  });

  describe('escapeHtml', () => {
    it('debe escapar caracteres HTML basicos', () => {
      expect(escapeHtml('hello & <world>')).toBe('hello &amp; &lt;world&gt;');
      expect(escapeHtml(null)).toBe('');
    });
  });

  describe('normalizePublicBaseUrl', () => {
    it('debe normalizar urls validas y rechazar no seguras', () => {
      expect(normalizePublicBaseUrl('https://example.com/')).toBe('https://example.com');
      expect(normalizePublicBaseUrl('http://example.com')).toBe('');
      expect(normalizePublicBaseUrl('invalid-url')).toBe('');
      expect(normalizePublicBaseUrl(null)).toBe('');
    });
  });

  describe('buildPublicAssetUrl', () => {
    it('debe construir la URL completa', () => {
      expect(buildPublicAssetUrl('/asset.png', { PUBLIC_BACKEND_URL: 'https://backend.com' })).toBe('https://backend.com/asset.png');
      expect(buildPublicAssetUrl('/asset.png', {})).toBe('');
    });
  });

  describe('mailConfig', () => {
    it('debe mapear variables de entorno', () => {
      const env = {
        OUTLOOK_FROM_EMAIL: ' test@test.com ',
        OUTLOOK_CLIENT_ID: 'id123',
        OUTLOOK_CLIENT_SECRET: 'sec123',
        OUTLOOK_REFRESH_TOKEN: 'ref123',
        OUTLOOK_TOKEN_TENANT: 'mytenant'
      };
      const config = mailConfig(env);
      expect(config.fromEmail).toBe('test@test.com');
      expect(config.clientId).toBe('id123');
      expect(config.tenant).toBe('mytenant');
    });
  });

  describe('missingMailConfig', () => {
    it('debe listar claves de configuracion faltantes', () => {
      expect(missingMailConfig({ fromEmail: 'a', clientId: '', clientSecret: 'c', refreshToken: '' })).toEqual(['clientId', 'refreshToken']);
    });
  });
});

describe('buildInvitationEmail', () => {
  it('genera correo HTML con imagen enlazada, link de respaldo y firma', () => {
    const inviteLink = 'https://t.me/EcenciaBot?start=abc123';
    const email = buildInvitationEmail({
      nombre: 'Alex <script>',
      inviteLink,
      env: {
        PUBLIC_BACKEND_URL: 'https://backend.example.com/',
        OUTLOOK_FROM_EMAIL: 'ecenciaconvenios@outlook.com',
      },
    });

    expect(email.subject).toBe('Tu invitacion al bot de ECencia Andina');
    expect(email.html).toContain('src="https://backend.example.com/assets/email/telegram-invite-cta.png"');
    expect(email.html).toContain(`href="${inviteLink}"`);
    expect(email.html).toContain('Si el bot&oacute;n o la imagen no abre');
    expect(email.html).toContain('Equipo ECencia Andina');
    expect(email.html).toContain('ecenciaconvenios@outlook.com');
    expect(email.html).toContain('Alex &lt;script&gt;');
    expect(email.html).not.toContain('Alex <script>');
    expect(email.text).toContain(inviteLink);
    expect(email.text).toContain('Equipo ECencia Andina');
  });

  it('mantiene boton y link aunque no haya URL publica para la imagen', () => {
    const inviteLink = 'https://t.me/EcenciaBot?start=abc123';
    const email = buildInvitationEmail({
      nombre: 'Ana',
      inviteLink,
      env: {
        OUTLOOK_FROM_EMAIL: 'ecenciaconvenios@outlook.com',
      },
    });

    expect(email.html).not.toContain('telegram-invite-cta.png');
    expect(email.html).toContain(`href="${inviteLink}"`);
    expect(email.text).toContain(inviteLink);
  });
});

describe('getGraphAccessToken and sendOutlookMail API calls', () => {
  const dummyEnv = {
    OUTLOOK_FROM_EMAIL: 'sender@outlook.com',
    OUTLOOK_CLIENT_ID: 'client-id',
    OUTLOOK_CLIENT_SECRET: 'secret',
    OUTLOOK_REFRESH_TOKEN: 'refresh-token',
  };

  it('getGraphAccessToken lanza error si falta configuracion', async () => {
    await expect(getGraphAccessToken({ env: {} })).rejects.toThrow(/Falta configuracion Outlook/);
  });

  it('getGraphAccessToken lanza error si endpoint Microsoft falla', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('Error in OAuth', { status: 400 }));
    await expect(getGraphAccessToken({ fetchImpl: mockFetch, env: dummyEnv })).rejects.toThrow(/Error in OAuth/);
  });

  it('getGraphAccessToken lanza error si no devuelve access_token', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    await expect(getGraphAccessToken({ fetchImpl: mockFetch, env: dummyEnv })).rejects.toThrow(/no devolvio access_token/);
  });

  it('getGraphAccessToken obtiene token exitosamente', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: 'valid-token' }), { status: 200 }));
    const res = await getGraphAccessToken({ fetchImpl: mockFetch, env: dummyEnv });
    expect(res.accessToken).toBe('valid-token');
    expect(res.fromEmail).toBe('sender@outlook.com');
  });

  it('sendOutlookMail lanza error si no hay destinatario', async () => {
    await expect(sendOutlookMail({ to: '', subject: 'test', text: 'hi' })).rejects.toThrow(/El cliente no tiene correo/);
  });

  it('sendOutlookMail envia via Graph API si no esta Gmail configurado', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'tkn' }), { status: 200 })) // token call
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200, headers: { 'request-id': 'req-123' } })); // sendMail call

    // Ensure Gmail variables are not present
    const originalGmailUser = process.env.GMAIL_USER;
    const originalGmailPass = process.env.GMAIL_APP_PASSWORD;
    delete process.env.GMAIL_USER;
    delete process.env.GMAIL_APP_PASSWORD;

    const res = await sendOutlookMail({ to: 'recipient@test.com', subject: 'hi', text: 'body', html: '<h1>body</h1>' }, {
      fetchImpl: mockFetch,
      env: dummyEnv
    });

    expect(res.status).toBe(MAIL_STATUSES.sent);
    expect(res.providerRequestId).toBe('req-123');

    // Restore
    process.env.GMAIL_USER = originalGmailUser;
    process.env.GMAIL_APP_PASSWORD = originalGmailPass;
  });

  it('sendOutlookMail maneja errores de Microsoft Graph API', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'tkn' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'Quota exceeded' } }), { status: 403 }));

    const originalGmailUser = process.env.GMAIL_USER;
    delete process.env.GMAIL_USER;

    await expect(
      sendOutlookMail({ to: 'recipient@test.com', subject: 'hi', text: 'body' }, { fetchImpl: mockFetch, env: dummyEnv })
    ).rejects.toThrow(/Quota exceeded/);

    process.env.GMAIL_USER = originalGmailUser;
  });

  it('sendOutlookMail utiliza Gmail fallback si GMAIL_USER y GMAIL_APP_PASSWORD estan configurados', async () => {
    global.__mockNodemailerMessageId = 'gmail-123';

    const envWithGmail = {
      ...dummyEnv,
      GMAIL_USER: 'test@gmail.com',
      GMAIL_APP_PASSWORD: 'app-password',
    };

    const res = await sendOutlookMail({ to: 'recipient@test.com', subject: 'hi', text: 'body', html: '<h1>body</h1>' }, {
      env: envWithGmail
    });

    expect(res.status).toBe(MAIL_STATUSES.sent);
    expect(res.providerRequestId).toBe('gmail-123');

    delete global.__mockNodemailerMessageId;
  });

  it('sendOutlookMail continua con Graph API si Gmail falla', async () => {
    global.__mockNodemailerSendMailError = new Error('SMTP Error');

    const mockFetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'tkn' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200, headers: { 'request-id': 'graph-req-123' } }));

    const envWithGmail = {
      ...dummyEnv,
      GMAIL_USER: 'test@gmail.com',
      GMAIL_APP_PASSWORD: 'app-password',
    };

    const res = await sendOutlookMail({ to: 'recipient@test.com', subject: 'hi', text: 'body', html: '<h1>body</h1>' }, {
      fetchImpl: mockFetch,
      env: envWithGmail
    });

    expect(mockFetch).toHaveBeenCalledTimes(2); // Fallback to Graph API occurred
    expect(res.status).toBe(MAIL_STATUSES.sent);
    expect(res.providerRequestId).toBe('graph-req-123');

    delete global.__mockNodemailerSendMailError;
  });

  it('sendOutlookMail lanza error si Microsoft Graph rechaza la solicitud', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'tkn' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'Graph sending failed' } }), { status: 400 }));

    await expect(sendOutlookMail({ to: 'recipient@test.com', subject: 'hi', text: 'body' }, {
      fetchImpl: mockFetch,
      env: dummyEnv
    })).rejects.toThrow('Graph sending failed');
  });

  it('sendOutlookMail lanza error generico si la respuesta de Microsoft Graph no es JSON', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'tkn' }), { status: 200 }))
      .mockResolvedValueOnce(new Response('Plain text error', { status: 500 }));

    await expect(sendOutlookMail({ to: 'recipient@test.com', subject: 'hi', text: 'body' }, {
      fetchImpl: mockFetch,
      env: dummyEnv
    })).rejects.toThrow('Plain text error');
  });
});
