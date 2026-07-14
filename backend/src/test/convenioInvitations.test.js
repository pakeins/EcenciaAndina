import { describe, expect, it, vi } from 'vitest';
import convenioInvitations from '../services/convenioInvitations.js';

const {
  INVITATION_STATUSES,
  buildConvenioInvitationMessage,
  buildInvitationLink,
  cleanBotUsername,
  generateConvenioInvitation,
  resolveInvitationStatus,
  sendInvitationEmail,
} = convenioInvitations;

// ──────────────── Helpers ────────────────

const makeSupabaseMock = (overrides = {}) => {
  const store = { subscriptions: [], invitations: [] };

  return {
    _store: store,
    from(table) {
      const rows = table === 'telegram_subscriptions' ? store.subscriptions : store.invitations;
      const builder = {
        _data: [...rows],
        select() { return this; },
        eq(k, v) { this._data = this._data.filter(r => r[k] === v); return this; },
        not(k, op, v) { this._data = this._data.filter(r => r[k] !== v); return this; },
        limit() { return this; },
        update(payload) {
          store.subscriptions = store.subscriptions.map(r => ({ ...r, ...payload }));
          store.invitations = store.invitations.map(r => ({ ...r, ...payload }));
          return this;
        },
        insert(payload) {
          const item = Array.isArray(payload) ? payload[0] : payload;
          const newRow = { id: `new-${Date.now()}`, ...item };
          rows.push(newRow);
          this._single = newRow;
          return this;
        },
        single() { return Promise.resolve({ data: this._single || this._data[0] || null, error: null }); },
        maybeSingle() { return Promise.resolve({ data: this._data[0] || null, error: null }); },
        ...overrides,
      };
      return builder;
    },
  };
};

// ──────────────── Tests ────────────────

describe('convenioInvitations helpers', () => {
  it('cleanBotUsername limpia el @ y espacios', () => {
    expect(cleanBotUsername('@EcenciaBot')).toBe('EcenciaBot');
    expect(cleanBotUsername('EcenciaBot')).toBe('EcenciaBot');
    expect(cleanBotUsername('')).toBe('');
  });

  it('buildInvitationLink genera link de Telegram con token', () => {
    expect(buildInvitationLink('abc123', 'EcenciaBot')).toBe('https://t.me/EcenciaBot?start=abc123');
    expect(buildInvitationLink('', 'EcenciaBot')).toBeNull();
    expect(buildInvitationLink('abc123', '')).toBeNull();
  });

  it('buildConvenioInvitationMessage genera mensaje con nombre y convenio', () => {
    const msg = buildConvenioInvitationMessage({
      nombre: 'Ana',
      convenioNombre: 'Empresa XYZ',
      inviteLink: 'https://t.me/EcenciaBot?start=tok123',
    });
    expect(msg).toContain('Ana');
    expect(msg).toContain('Empresa XYZ');
    expect(msg).toContain('https://t.me/EcenciaBot?start=tok123');
  });

  it('buildConvenioInvitationMessage usa defaults cuando no hay nombre o link', () => {
    const msg = buildConvenioInvitationMessage({ nombre: '', convenioNombre: '', inviteLink: null });
    expect(msg).toContain('colaborador');
    expect(msg).toContain('tu convenio');
    expect(msg).toContain('Solicita tu link');
  });

  it('resolveInvitationStatus: rejected -> rejectedManualRequired', () => {
    expect(resolveInvitationStatus({
      phoneNormalized: '+593999',
      inviteLink: null,
      subscriptionStatus: 'rejected',
    })).toBe(INVITATION_STATUSES.rejectedManualRequired);
  });

  it('resolveInvitationStatus: inviteLink presente -> manualRequired', () => {
    expect(resolveInvitationStatus({
      phoneNormalized: null,
      inviteLink: 'https://t.me/bot?start=tok',
      subscriptionStatus: 'pending',
    })).toBe(INVITATION_STATUSES.manualRequired);
  });

  it('resolveInvitationStatus: sin phone -> noPhone', () => {
    expect(resolveInvitationStatus({
      phoneNormalized: null,
      inviteLink: null,
      subscriptionStatus: 'pending',
    })).toBe(INVITATION_STATUSES.noPhone);
  });

  it('resolveInvitationStatus: sin bot username -> missingBotUsername', () => {
    expect(resolveInvitationStatus({
      phoneNormalized: '+593999',
      inviteLink: null,
      subscriptionStatus: 'pending',
    })).toBe(INVITATION_STATUSES.missingBotUsername);
  });
});

describe('sendInvitationEmail', () => {
  it('retorna missingRecipient si el cliente no tiene correo', async () => {
    const client = makeSupabaseMock();
    const audit = { id: 'audit-1' };
    const clientData = { nombre: 'Juan', email: '' };

    const result = await sendInvitationEmail(client, audit, { client: clientData, inviteLink: 'https://t.me/bot?start=tok' });
    expect(result.emailStatus).toBe('missing_recipient');
    expect(result.emailTo).toBeNull();
  });

  it('retorna failed si no hay inviteLink', async () => {
    const client = makeSupabaseMock();
    const audit = { id: 'audit-1' };
    const clientData = { nombre: 'Juan', email: 'juan@test.com' };

    const result = await sendInvitationEmail(client, audit, { client: clientData, inviteLink: null });
    expect(result.emailStatus).toBe('failed');
    expect(result.emailTo).toBe('juan@test.com');
  });

  it('retorna sent cuando el email se envia exitosamente via mock', async () => {
    const client = makeSupabaseMock();
    const audit = { id: 'audit-1' };
    const clientData = { nombre: 'Ana', email: 'ana@test.com' };

    // Mock sendOutlookMail via fetch (Gmail path disabled)
    const originalGmailUser = process.env.GMAIL_USER;
    delete process.env.GMAIL_USER;

    // Mock fetch for token + sendMail
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'tkn' }), { status: 200 }))
      .mockResolvedValueOnce(new Response('', { status: 200, headers: { 'request-id': 'rid-1' } }));
    
    const dummyMailEnv = {
      OUTLOOK_FROM_EMAIL: 'sender@outlook.com',
      OUTLOOK_CLIENT_ID: 'cid',
      OUTLOOK_CLIENT_SECRET: 'sec',
      OUTLOOK_REFRESH_TOKEN: 'ref',
    };

    const result = await sendInvitationEmail(
      client,
      audit,
      { client: clientData, inviteLink: 'https://t.me/bot?start=tok' },
      { mailOptions: { fetchImpl: mockFetch, env: dummyMailEnv } }
    );

    process.env.GMAIL_USER = originalGmailUser;

    expect(result.emailStatus).toBe('sent');
    expect(result.emailTo).toBe('ana@test.com');
  });

  it('retorna failed si el email lanza error generico', async () => {
    const client = makeSupabaseMock();
    const audit = { id: 'audit-1' };
    const clientData = { nombre: 'Ana', email: 'ana@test.com' };

    const originalGmailUser = process.env.GMAIL_USER;
    delete process.env.GMAIL_USER;

    // Mock fetch for token but fail on sendMail
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'tkn' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'Quota exceeded' } }), { status: 403 }));

    const dummyMailEnv = {
      OUTLOOK_FROM_EMAIL: 'sender@outlook.com',
      OUTLOOK_CLIENT_ID: 'cid',
      OUTLOOK_CLIENT_SECRET: 'sec',
      OUTLOOK_REFRESH_TOKEN: 'ref',
    };

    const result = await sendInvitationEmail(
      client,
      audit,
      { client: clientData, inviteLink: 'https://t.me/bot?start=tok' },
      { mailOptions: { fetchImpl: mockFetch, env: dummyMailEnv } }
    );

    process.env.GMAIL_USER = originalGmailUser;

    expect(result.emailStatus).toBe('failed');
  });

  it('retorna not_configured si no hay configuracion de correo', async () => {
    const client = makeSupabaseMock();
    const audit = { id: 'audit-1' };
    const clientData = { nombre: 'Ana', email: 'ana@test.com' };

    const originalGmailUser = process.env.GMAIL_USER;
    delete process.env.GMAIL_USER;

    const result = await sendInvitationEmail(
      client,
      audit,
      { client: clientData, inviteLink: 'https://t.me/bot?start=tok' },
      { mailOptions: { env: {} } }
    );

    process.env.GMAIL_USER = originalGmailUser;

    expect(result.emailStatus).toBe('not_configured');
  });
});

describe('generateConvenioInvitation', () => {
  it('genera invitacion con manual_required cuando cliente no tiene telefono pero hay botUsername', async () => {
    const client = makeSupabaseMock();
    const convenio = { id_convenio: 'conv-1', nombre_empresa: 'Empresa Test' };
    const clientData = { id_cliente: 'cli-1', nombre: 'Ana', telefono: null, email: '' };

    const result = await generateConvenioInvitation(
      client,
      { convenio, client: clientData, createdBy: 'admin', sendDirect: false, sendEmail: false },
      { botUsername: 'EcenciaBot' }
    );

    // Con botUsername el inviteLink se genera, luego resolveInvitationStatus devuelve manualRequired
    // porque no hay subscripcion pero hay link
    expect(result.telegramStatus).toBe(INVITATION_STATUSES.manualRequired);
    expect(result.token).toBeTruthy();
    expect(result.inviteLink).toBeTruthy();
  });

  it('omite email si sendEmail=false', async () => {
    const client = makeSupabaseMock();
    const convenio = { id_convenio: 'conv-1', nombre_empresa: 'Empresa Test' };
    const clientData = { id_cliente: 'cli-1', nombre: 'Ana', telefono: '+593999', email: 'ana@test.com' };

    const result = await generateConvenioInvitation(
      client,
      { convenio, client: clientData, createdBy: 'admin', sendDirect: false, sendEmail: false },
      { botUsername: 'EcenciaBot' }
    );

    expect(result.emailStatus).toBe('not_attempted');
  });
});
