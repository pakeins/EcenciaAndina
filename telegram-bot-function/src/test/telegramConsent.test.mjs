import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  INVITATION_TTL_MS,
  REQUIRED_TELEGRAM_ENV,
  claimInvitation,
  consumeInvitation,
  createInvitation,
  getBotUsername,
  getConsentVersion,
  getInvitationByToken,
  getPrivacySettings,
  hasCurrentConsent,
  hmacHex,
  invitationAvailability,
  privacyText,
  recordConsentEvent,
  sha256Hex,
  validateTelegramEnvironment,
} from '../services/telegramConsent.js';

describe('telegramConsent service', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TELEGRAM_BOT_USERNAME = 'EcenciaBot';
    process.env.TELEGRAM_PRIVACY_CONTACT = 'privacy@ecencia.com';
    process.env.TELEGRAM_CONSENT_VERSION = 'v1.0';
    process.env.TELEGRAM_INVITE_TOKEN_SECRET = 'super_secret_token_at_least_32_characters_long';
    process.env.TELEGRAM_PRIVACY_POLICY_URL = 'https://ecencia.com/privacy';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('validateTelegramEnvironment', () => {
    it('debe pasar si el entorno es correcto', () => {
      expect(() => validateTelegramEnvironment()).not.toThrow();
    });

    it('debe fallar si faltan variables obligatorias', () => {
      delete process.env.TELEGRAM_BOT_USERNAME;
      expect(() => validateTelegramEnvironment()).toThrow('Faltan variables Telegram obligatorias');
    });

    it('debe fallar si la clave secreta es demasiado corta', () => {
      process.env.TELEGRAM_INVITE_TOKEN_SECRET = 'short';
      expect(() => validateTelegramEnvironment()).toThrow('TELEGRAM_INVITE_TOKEN_SECRET debe tener al menos 32 caracteres');
    });

    it('debe fallar si no hay urls configuradas', () => {
      delete process.env.TELEGRAM_PRIVACY_POLICY_URL;
      delete process.env.PUBLIC_FRONTEND_URL;
      expect(() => validateTelegramEnvironment()).toThrow('Falta configurar TELEGRAM_PRIVACY_POLICY_URL');
    });
  });

  describe('getters básicos', () => {
    it('debe retornar versión y bot username correctos', () => {
      expect(getConsentVersion()).toBe('v1.0');
      expect(getBotUsername()).toBe('EcenciaBot');
    });

    it('debe limpiar la @ del bot username', () => {
      process.env.TELEGRAM_BOT_USERNAME = '@EcenciaBot';
      expect(getBotUsername()).toBe('EcenciaBot');
    });

    it('debe retornar settings de privacidad correctos', () => {
      const settings = getPrivacySettings();
      expect(settings.contact).toBe('privacy@ecencia.com');
      expect(settings.policyUrl).toBe('https://ecencia.com/privacy');
      expect(settings.version).toBe('v1.0');
    });

    it('debe usar public frontend url como fallback', () => {
      delete process.env.TELEGRAM_PRIVACY_POLICY_URL;
      process.env.PUBLIC_FRONTEND_URL = 'https://frontend.com';
      const settings = getPrivacySettings();
      expect(settings.policyUrl).toBe('https://frontend.com/privacidad');
    });
  });

  describe('crypto helpers', () => {
    it('hmacHex debe generar hash hmac correcto', () => {
      const hash = hmacHex('test-value');
      expect(hash).toHaveLength(64); // SHA256 hex is 64 chars
    });

    it('sha256Hex debe generar sha256 correcto', () => {
      const hash = sha256Hex('test-value');
      expect(hash).toHaveLength(64);
    });
  });

  describe('privacyText', () => {
    it('debe contener información de contacto y política', () => {
      const text = privacyText();
      expect(text).toContain('Ecencia Andina (v1.0)');
      expect(text).toContain('privacy@ecencia.com');
      expect(text).toContain('https://ecencia.com/privacy');
    });
  });

  describe('invitationAvailability', () => {
    it('debe retornar inválido si la invitación es nula', () => {
      expect(invitationAvailability(null)).toEqual({ valid: false, reason: 'invalid' });
    });

    it('debe retornar inválido si está revocada', () => {
      const inv = { revoked_at: '2023-01-01' };
      expect(invitationAvailability(inv)).toEqual({ valid: false, reason: 'revoked' });
    });

    it('debe retornar inválido si está consumida', () => {
      const inv = { consumed_at: '2023-01-01' };
      expect(invitationAvailability(inv)).toEqual({ valid: false, reason: 'consumed' });
    });

    it('debe retornar inválido si está expirada', () => {
      const inv = { expires_at: new Date(Date.now() - 10000).toISOString() };
      expect(invitationAvailability(inv)).toEqual({ valid: false, reason: 'expired' });
    });

    it('debe retornar inválido si está reclamada por otro chat', () => {
      const inv = { expires_at: new Date(Date.now() + 10000).toISOString(), claimed_chat_id: '456' };
      expect(invitationAvailability(inv, '123')).toEqual({ valid: false, reason: 'claimed' });
    });

    it('debe retornar inválido si el cliente no está activo', () => {
      const inv = {
        expires_at: new Date(Date.now() + 10000).toISOString(),
        clientes: { esta_activo: false }
      };
      expect(invitationAvailability(inv, '123')).toEqual({ valid: false, reason: 'inactive_client' });
    });

    it('debe retornar válido si cumple todas las condiciones', () => {
      const inv = {
        expires_at: new Date(Date.now() + 10000).toISOString(),
        clientes: { esta_activo: true }
      };
      expect(invitationAvailability(inv, '123')).toEqual({ valid: true });
    });
  });

  describe('hasCurrentConsent', () => {
    it('debe validar suscripción con consentimiento actual', () => {
      const sub = {
        consent_status: 'accepted',
        is_active: true,
        consent_notice_version: 'v1.0'
      };
      expect(hasCurrentConsent(sub)).toBe(true);
    });

    it('debe fallar si no tiene consentimiento', () => {
      expect(hasCurrentConsent(null)).toBe(false);
      expect(hasCurrentConsent({ consent_status: 'pending' })).toBe(false);
      expect(hasCurrentConsent({ consent_status: 'accepted', is_active: false })).toBe(false);
      expect(hasCurrentConsent({ consent_status: 'accepted', is_active: true, consent_notice_version: 'v2.0' })).toBe(false);
    });
  });

  describe('Database Operations', () => {
    const makeChainableMock = (finalValue) => {
      const obj = {};
      const fn = vi.fn().mockReturnValue(obj);
      obj.from = fn;
      obj.select = fn;
      obj.insert = fn;
      obj.update = fn;
      obj.delete = fn;
      obj.eq = fn;
      obj.is = fn;
      obj.maybeSingle = vi.fn().mockResolvedValue(finalValue);
      obj.single = vi.fn().mockResolvedValue(finalValue);
      obj.then = (onResolve) => Promise.resolve(finalValue).then(onResolve);
      return obj;
    };

    it('createInvitation debe insertar nueva invitación y revocar previas', async () => {
      const dbMock = makeChainableMock({ data: { id: 'inv_123', expires_at: '2023-01-01' }, error: null });
      const mockClient = () => dbMock;

      const result = await createInvitation(1, 'admin', mockClient);
      expect(result.invitationId).toBe('inv_123');
      expect(result.status).toBe('pending');
      expect(result.onboarding_url).toContain('EcenciaBot');
    });

    it('getInvitationByToken debe buscar token por HMAC', async () => {
      const dbMock = makeChainableMock({ data: { id: 'inv_123' }, error: null });
      const mockClient = () => dbMock;

      const result = await getInvitationByToken('some_valid_token_that_is_long_enough_to_pass_regex', mockClient);
      expect(result).toEqual({ id: 'inv_123' });
    });

    it('claimInvitation debe registrar reclamación de chat', async () => {
      const invitation = {
        id: 'inv_123',
        expires_at: new Date(Date.now() + 10000).toISOString(),
        clientes: { esta_activo: true }
      };

      const dbMock = makeChainableMock({ data: { ...invitation, claimed_chat_id: '123' }, error: null });
      const mockClient = () => dbMock;

      const result = await claimInvitation(invitation, { chatId: '123', telegramUserId: 'user_1' }, mockClient);
      expect(result.valid).toBe(true);
      expect(result.invitation.claimed_chat_id).toBe('123');
    });

    it('consumeInvitation debe marcar como consumida', async () => {
      const dbMock = makeChainableMock({ error: null });
      const mockClient = () => dbMock;

      await consumeInvitation('inv_123', mockClient);
      expect(dbMock.update).toHaveBeenCalledWith(expect.objectContaining({ consumed_at: expect.any(String) }));
    });

    it('recordConsentEvent debe registrar evento de consentimiento', async () => {
      const dbMock = makeChainableMock({ error: null });
      const mockClient = () => dbMock;

      await recordConsentEvent({
        idCliente: 1,
        subscriptionId: 'sub_123',
        eventType: 'accepted',
        method: 'button',
        chatId: '123'
      }, mockClient);

      expect(dbMock.insert).toHaveBeenCalledWith(expect.objectContaining({
        id_cliente: 1,
        subscription_id: 'sub_123',
        event_type: 'accepted',
        method: 'button'
      }));
    });
  });
});
