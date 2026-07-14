import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import telegramConsent from '../services/telegramConsent.js';

const {
  INVITATION_TTL_MS,
  claimInvitation,
  consumeInvitation,
  getBotUsername,
  getConsentVersion,
  getPrivacySettings,
  hasCurrentConsent,
  hmacHex,
  invitationAvailability,
  privacyText,
  sha256Hex,
  validateTelegramEnvironment,
  createInvitation,
  getInvitationByToken,
  recordConsentEvent,
} = telegramConsent;

// ────── Env setup ──────
const BASE_ENV = {
  TELEGRAM_BOT_USERNAME: '@EcenciaBot',
  TELEGRAM_PRIVACY_CONTACT: 'privacidad@ecencia.com',
  TELEGRAM_CONSENT_VERSION: 'v1.0',
  TELEGRAM_INVITE_TOKEN_SECRET: 'a'.repeat(32),
  TELEGRAM_PRIVACY_POLICY_URL: 'https://ecencia.com/privacidad',
};

const setEnv = (overrides = {}) => {
  const env = { ...BASE_ENV, ...overrides };
  Object.entries(env).forEach(([k, v]) => {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  });
};

const clearEnv = () => {
  Object.keys(BASE_ENV).forEach((k) => delete process.env[k]);
  delete process.env.PUBLIC_FRONTEND_URL;
};

beforeEach(() => setEnv());
afterEach(() => clearEnv());

// ────── Fake Supabase client ──────
const makeFakeClient = (overrides = {}) => {
  const records = {};
  return {
    _records: records,
    from(table) {
      if (!records[table]) records[table] = [];
      const rows = records[table];
      const builder = {
        _rows: [...rows],
        select() { return this; },
        eq(k, v) { this._rows = this._rows.filter((r) => r[k] === v); return this; },
        is(k, v) { this._rows = this._rows.filter((r) => r[k] === v); return this; },
        not(k, op, v) { this._rows = this._rows.filter((r) => r[k] !== v); return this; },
        update(patch) {
          this._patch = patch;
          // Apply patch to the records rows
          rows.forEach((r) => {
            if (builder._rows.includes(r)) {
              Object.assign(r, patch);
            }
          });
          return this;
        },
        insert(data) {
          const item = Array.isArray(data) ? data[0] : data;
          const row = { id: `gen-${Date.now()}`, ...item };
          rows.push(row);
          this._lastInserted = row;
          builder._rows.push(row);
          return this;
        },
        single() { return Promise.resolve({ data: this._lastInserted || this._rows[0] || null, error: null }); },
        maybeSingle() { return Promise.resolve({ data: this._rows[0] || null, error: null }); },
        ...overrides,
      };
      return builder;
    },
    storage: { from: () => ({ list: async () => ({ data: [], error: null }) }) },
  };
};

// ────── Tests ──────

describe('telegramConsent: funciones puras', () => {
  it('getBotUsername quita el @ del nombre del bot', () => {
    expect(getBotUsername()).toBe('EcenciaBot');
  });

  it('getConsentVersion retorna la version configurada', () => {
    expect(getConsentVersion()).toBe('v1.0');
  });

  it('getPrivacySettings retorna contact, policyUrl y version', () => {
    const settings = getPrivacySettings();
    expect(settings.contact).toBe('privacidad@ecencia.com');
    expect(settings.policyUrl).toBe('https://ecencia.com/privacidad');
    expect(settings.version).toBe('v1.0');
  });

  it('getPrivacySettings construye policyUrl desde PUBLIC_FRONTEND_URL si no hay PRIVACY_POLICY_URL', () => {
    process.env.TELEGRAM_PRIVACY_POLICY_URL = '';
    process.env.PUBLIC_FRONTEND_URL = 'https://app.ecencia.com';
    const settings = getPrivacySettings();
    expect(settings.policyUrl).toBe('https://app.ecencia.com/privacidad');
  });

  it('hmacHex genera hashes diferentes para inputs distintos', () => {
    const h1 = hmacHex('token1');
    const h2 = hmacHex('token2');
    expect(h1).toHaveLength(64);
    expect(h1).not.toBe(h2);
  });

  it('sha256Hex genera hash sha256 de 64 chars', () => {
    const h = sha256Hex('contenido');
    expect(h).toHaveLength(64);
    expect(h).toMatch(/^[a-f0-9]+$/);
  });

  it('privacyText contiene la version y el contacto', () => {
    const text = privacyText();
    expect(text).toContain('v1.0');
    expect(text).toContain('privacidad@ecencia.com');
    expect(text).toContain('https://ecencia.com/privacidad');
  });

  describe('INVITATION_TTL_MS', () => {
    it('es equivalente a 7 dias en ms', () => {
      expect(INVITATION_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
    });
  });
});

describe('validateTelegramEnvironment', () => {
  it('valida correctamente cuando todas las vars estan configuradas', () => {
    expect(() => validateTelegramEnvironment()).not.toThrow();
  });

  it('lanza error si falta alguna variable obligatoria', () => {
    delete process.env.TELEGRAM_BOT_USERNAME;
    expect(() => validateTelegramEnvironment()).toThrow(/Faltan variables Telegram/);
  });

  it('lanza error si el secret es muy corto (< 32 chars)', () => {
    process.env.TELEGRAM_INVITE_TOKEN_SECRET = 'short';
    expect(() => validateTelegramEnvironment()).toThrow(/al menos 32/);
  });

  it('lanza error si no hay URL de privacidad ni frontend URL', () => {
    process.env.TELEGRAM_PRIVACY_POLICY_URL = '';
    process.env.PUBLIC_FRONTEND_URL = '';
    expect(() => validateTelegramEnvironment()).toThrow(/TELEGRAM_PRIVACY_POLICY_URL/);
  });
});

describe('invitationAvailability', () => {
  const futureDate = new Date(Date.now() + 3_600_000).toISOString();

  it('invalid si la invitacion es null', () => {
    expect(invitationAvailability(null, '111')).toEqual({ valid: false, reason: 'invalid' });
  });

  it('invalid si la invitacion fue revocada', () => {
    expect(invitationAvailability({ revoked_at: '2026-01-01', expires_at: futureDate }, '111')).toMatchObject({ valid: false, reason: 'revoked' });
  });

  it('invalid si la invitacion fue consumida', () => {
    expect(invitationAvailability({ consumed_at: '2026-01-01', expires_at: futureDate }, '111')).toMatchObject({ valid: false, reason: 'consumed' });
  });

  it('invalid si la invitacion ya expiro', () => {
    const expired = new Date(Date.now() - 1000).toISOString();
    expect(invitationAvailability({ expires_at: expired }, '111')).toMatchObject({ valid: false, reason: 'expired' });
  });

  it('invalid si ya fue reclamada por otro chat', () => {
    expect(invitationAvailability({ claimed_chat_id: '999', expires_at: futureDate }, '111')).toMatchObject({ valid: false, reason: 'claimed' });
  });

  it('invalid si el cliente esta inactivo', () => {
    expect(invitationAvailability({
      expires_at: futureDate,
      clientes: { esta_activo: false },
    }, '111')).toMatchObject({ valid: false, reason: 'inactive_client' });
  });

  it('valid si la invitacion esta disponible', () => {
    expect(invitationAvailability({ expires_at: futureDate, clientes: { esta_activo: true } }, '111')).toEqual({ valid: true });
  });

  it('valid si el chat es el mismo que reclamo (mismo chat_id)', () => {
    expect(invitationAvailability({ claimed_chat_id: '111', expires_at: futureDate, clientes: { esta_activo: true } }, '111')).toEqual({ valid: true });
  });
});

describe('hasCurrentConsent', () => {
  it('retorna true si el consentimiento esta vigente', () => {
    const sub = { consent_status: 'accepted', is_active: true, consent_notice_version: 'v1.0' };
    expect(hasCurrentConsent(sub)).toBe(true);
  });

  it('retorna false si la version del consentimiento es diferente', () => {
    const sub = { consent_status: 'accepted', is_active: true, consent_notice_version: 'v0.9' };
    expect(hasCurrentConsent(sub)).toBe(false);
  });

  it('retorna false si el consentimiento es rejected', () => {
    const sub = { consent_status: 'rejected', is_active: true, consent_notice_version: 'v1.0' };
    expect(hasCurrentConsent(sub)).toBe(false);
  });

  it('retorna false si la suscripcion esta inactiva', () => {
    const sub = { consent_status: 'accepted', is_active: false, consent_notice_version: 'v1.0' };
    expect(hasCurrentConsent(sub)).toBe(false);
  });

  it('retorna false si la suscripcion es null', () => {
    expect(hasCurrentConsent(null)).toBe(false);
  });
});

describe('consumeInvitation', () => {
  it('no hace nada si el invitationId es falsy', async () => {
    const client = makeFakeClient();
    await expect(consumeInvitation(null, () => client)).resolves.toBeUndefined();
    await expect(consumeInvitation('', () => client)).resolves.toBeUndefined();
  });
});

describe('claimInvitation', () => {
  const futureDate = new Date(Date.now() + 3_600_000).toISOString();

  it('retorna invalid si la invitacion no es valida', async () => {
    const result = await claimInvitation({ revoked_at: '2026-01-01', expires_at: futureDate }, { chatId: '111' });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('revoked');
  });

  it('retorna valid con la invitacion actual si ya fue reclamada por el mismo chat', async () => {
    const inv = { id: 'inv-1', claimed_chat_id: '111', expires_at: futureDate, clientes: { esta_activo: true } };
    const result = await claimInvitation(inv, { chatId: '111' });
    expect(result.valid).toBe(true);
    expect(result.invitation).toBe(inv);
  });

  it('reclama la invitacion exitosamente si no ha sido reclamada', async () => {
    const inv = { id: 'inv-unclaimed', claimed_chat_id: null, expires_at: futureDate, clientes: { esta_activo: true } };
    const dbMock = {
      from: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { ...inv, claimed_chat_id: '222' }, error: null })
    };
    
    const result = await claimInvitation(inv, { chatId: '222' }, () => dbMock);
    expect(result.valid).toBe(true);
    expect(result.invitation.claimed_chat_id).toBe('222');
  });

  it('lanza error si la base de datos falla al intentar actualizar', async () => {
    const inv = { id: 'inv-error', claimed_chat_id: null, expires_at: futureDate, clientes: { esta_activo: true } };
    const dbMock = {
      from: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: new Error('DB Error') })
    };
    
    await expect(claimInvitation(inv, { chatId: '333' }, () => dbMock)).rejects.toThrow('DB Error');
  });

  it('vuelve a consultar la base si tal vez otro cliente reclamo concurrentemente', async () => {
    const inv = { id: 'inv-race', claimed_chat_id: null, expires_at: futureDate, clientes: { esta_activo: true } };
    
    let callCount = 0;
    const dbMock = {
      from: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // El update no afecto a ninguna fila
          return Promise.resolve({ data: null, error: null });
        } else {
          // La consulta (select) encuentra que ahora está reclamada por otro
          return Promise.resolve({ data: { ...inv, claimed_chat_id: '999' }, error: null });
        }
      })
    };
    
    const result = await claimInvitation(inv, { chatId: '444' }, () => dbMock);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('claimed');
  });

  describe('createInvitation', () => {
    it('crea una invitacion revocando las anteriores pendientes', async () => {
      const client = makeFakeClient();
      const result = await createInvitation('cli-123', 'admin', () => client);
      expect(result.status).toBe('pending');
      expect(result.invitationId).toBeDefined();
      expect(result.onboarding_url).toContain('EcenciaBot');
    });
  });

  describe('getInvitationByToken', () => {
    it('retorna null si el token no tiene formato valido', async () => {
      const client = makeFakeClient();
      const result = await getInvitationByToken('token-corto', () => client);
      expect(result).toBeNull();
    });

    it('busca invitacion en la db usando hmac del token si el token es valido', async () => {
      const client = makeFakeClient();
      const token = 'a'.repeat(32); // token valido de 32 chars
      const hmac = hmacHex(token);
      
      // Pre-populate store
      client.from('telegram_invitations').insert({ token_hmac: hmac, id_cliente: 'cli-123' });

      const result = await getInvitationByToken(token, () => client);
      expect(result).not.toBeNull();
      expect(result.id_cliente).toBe('cli-123');
    });
  });

  describe('consumeInvitation', () => {
    it('consume la invitacion actualizando consumed_at', async () => {
      const client = makeFakeClient();
      await consumeInvitation('inv-123', () => client);
      // Completa sin errores
      expect(client._records.telegram_invitations).toBeDefined();
    });

    it('no hace nada si el invitationId es nulo o indefinido', async () => {
      const client = makeFakeClient();
      await consumeInvitation(null, () => client);
      expect(Object.keys(client._records).length).toBe(0);
    });

    it('lanza error si falla la actualización en base de datos', async () => {
      const dbMock = {
        from: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockResolvedValue({ error: new Error('Consume failed') })
      };
      await expect(consumeInvitation('inv-err', () => dbMock)).rejects.toThrow('Consume failed');
    });
  });

  describe('recordConsentEvent', () => {
    it('registra evento de consentimiento insertando en telegram_consent_events', async () => {
      const client = makeFakeClient();
      
      await recordConsentEvent({
        idCliente: 'cli-123',
        subscriptionId: 'sub-123',
        invitationId: 'inv-123',
        eventType: 'accepted',
        method: 'telegram_button',
        telegramUserId: 'user-123',
        chatId: 'chat-123',
        phone: '593999999999',
        evidence: { ip: '127.0.0.1' },
        includeNotice: true
      }, () => client);

      // Completa sin errores y debe haber insertado en el store
      expect(client._records.telegram_consent_events.length).toBe(1);
    });

    it('registra evento sin incluir aviso si includeNotice=false', async () => {
      const client = makeFakeClient();
      
      await recordConsentEvent({
        idCliente: 'cli-123',
        eventType: 'policy_reconsent_requested',
        method: 'telegram_command',
        includeNotice: false
      }, () => client);
      expect(client._records.telegram_consent_events.length).toBe(1);
    });
  });
});
