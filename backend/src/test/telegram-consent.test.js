import { describe, it, expect, vi, beforeEach } from 'vitest';
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
    process.env = { ...originalEnv };
    // Set standard environment variables
    process.env.TELEGRAM_BOT_USERNAME = '@eciencia_test_bot';
    process.env.TELEGRAM_PRIVACY_CONTACT = 'privacy@example.com';
    process.env.TELEGRAM_CONSENT_VERSION = 'EC-LOPDP-V1';
    process.env.TELEGRAM_INVITE_TOKEN_SECRET = 'a'.repeat(32);
    process.env.TELEGRAM_PRIVACY_POLICY_URL = 'https://example.com/privacy';
  });

  describe('validateTelegramEnvironment', () => {
    it('pasa la validación si todo está configurado correctamente', () => {
      expect(() => validateTelegramEnvironment()).not.toThrow();
    });

    it('falla si falta alguna variable obligatoria', () => {
      delete process.env.TELEGRAM_BOT_USERNAME;
      expect(() => validateTelegramEnvironment()).toThrow(/Faltan variables Telegram obligatorias/);
    });

    it('falla si falta configurar la URL de política o la del frontend', () => {
      delete process.env.TELEGRAM_PRIVACY_POLICY_URL;
      delete process.env.PUBLIC_FRONTEND_URL;
      expect(() => validateTelegramEnvironment()).toThrow(/Falta configurar TELEGRAM_PRIVACY_POLICY_URL o PUBLIC_FRONTEND_URL/);
    });

    it('falla si la llave de hmac es menor a 32 caracteres', () => {
      process.env.TELEGRAM_INVITE_TOKEN_SECRET = 'short';
      expect(() => validateTelegramEnvironment()).toThrow(/TELEGRAM_INVITE_TOKEN_SECRET debe tener al menos 32 caracteres/);
    });
  });

  describe('utilidades de consentimiento', () => {
    it('retorna bot username normalizado sin @', () => {
      expect(getBotUsername()).toBe('eciencia_test_bot');
    });

    it('retorna version de consentimiento', () => {
      expect(getConsentVersion()).toBe('EC-LOPDP-V1');
    });

    it('genera correctas configuraciones de privacidad', () => {
      const settings = getPrivacySettings();
      expect(settings).toEqual({
        contact: 'privacy@example.com',
        policyUrl: 'https://example.com/privacy',
        version: 'EC-LOPDP-V1'
      });
    });

    it('genera la URL de privacidad usando el frontend si no hay URL de política directa', () => {
      delete process.env.TELEGRAM_PRIVACY_POLICY_URL;
      process.env.PUBLIC_FRONTEND_URL = 'https://frontend.com';
      const settings = getPrivacySettings();
      expect(settings.policyUrl).toBe('https://frontend.com/privacidad');
    });

    it('genera texto de privacidad', () => {
      const text = privacyText();
      expect(text).toContain('Aviso de privacidad y consentimiento - Eciencia Andina (EC-LOPDP-V1)');
      expect(text).toContain('https://example.com/privacy');
    });

    it('genera hashes SHA256 y HMAC correctos', () => {
      const value = 'test-value';
      const hash = sha256Hex(value);
      expect(hash).toHaveLength(64); // hex representation of sha256 is 64 chars

      const hmac = hmacHex(value);
      expect(hmac).toHaveLength(64);
    });
  });

  describe('createInvitation', () => {
    it('crea una invitación exitosamente', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: { id: 'inv-123', expires_at: '2026-07-18T00:00:00.000Z' },
        error: null,
      });
      const mockInsert = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ single: mockSingle }),
      });
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          is: vi.fn().mockReturnValue({
            is: vi.fn().mockResolvedValue({ error: null })
          })
        })
      });
      const mockClient = () => ({
        from: vi.fn((table) => {
          if (table === 'telegram_invitations') {
            return { update: mockUpdate, insert: mockInsert };
          }
        }),
      });

      const result = await createInvitation('cli-1', 'admin-1', mockClient);
      expect(result.invitationId).toBe('inv-123');
      expect(result.status).toBe('pending');
      expect(result.onboarding_url).toContain('https://t.me/eciencia_test_bot?start=');
      expect(result.expires_at).toBe('2026-07-18T00:00:00.000Z');
      expect(mockInsert).toHaveBeenCalled();
    });

    it('lanza error si la eliminación previa de invitaciones o inserción falla', async () => {
      const mockClient = () => ({
        from: vi.fn(() => ({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({ error: new Error('Database Error') })
              })
            })
          })
        })),
      });

      await expect(createInvitation('cli-1', 'admin-1', mockClient)).rejects.toThrow('Database Error');
    });
  });

  describe('getInvitationByToken', () => {
    it('retorna null si el token es inválido', async () => {
      const result = await getInvitationByToken('short-token');
      expect(result).toBeNull();
    });

    it('obtiene la invitación usando token HMAC', async () => {
      const mockMaybeSingle = vi.fn().mockResolvedValue({
        data: { id: 'inv-123', token_hmac: 'mock-hmac' },
        error: null,
      });
      const mockClient = () => ({
        from: vi.fn(() => ({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: mockMaybeSingle
            })
          })
        })),
      });

      const token = 'a'.repeat(32); // valid token length
      const result = await getInvitationByToken(token, mockClient);
      expect(result).toEqual({ id: 'inv-123', token_hmac: 'mock-hmac' });
    });

    it('lanza error si la consulta a la base de datos falla', async () => {
      const mockClient = () => ({
        from: vi.fn(() => ({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: new Error('Fetch failed') })
            })
          })
        })),
      });

      const token = 'a'.repeat(32);
      await expect(getInvitationByToken(token, mockClient)).rejects.toThrow('Fetch failed');
    });
  });

  describe('invitationAvailability', () => {
    it('invalida si no hay invitación', () => {
      expect(invitationAvailability(null, 'chat-1')).toEqual({ valid: false, reason: 'invalid' });
    });

    it('invalida si está revocada', () => {
      const inv = { revoked_at: '2026-07-11T00:00:00Z' };
      expect(invitationAvailability(inv, 'chat-1')).toEqual({ valid: false, reason: 'revoked' });
    });

    it('invalida si está consumida', () => {
      const inv = { consumed_at: '2026-07-11T00:00:00Z' };
      expect(invitationAvailability(inv, 'chat-1')).toEqual({ valid: false, reason: 'consumed' });
    });

    it('invalida si está expirada', () => {
      const inv = { expires_at: new Date(Date.now() - 1000).toISOString() };
      expect(invitationAvailability(inv, 'chat-1')).toEqual({ valid: false, reason: 'expired' });
    });

    it('invalida si está reclamada por otro chat', () => {
      const inv = { expires_at: new Date(Date.now() + 10000).toISOString(), claimed_chat_id: 'chat-2' };
      expect(invitationAvailability(inv, 'chat-1')).toEqual({ valid: false, reason: 'claimed' });
    });

    it('invalida si el cliente está inactivo', () => {
      const inv = {
        expires_at: new Date(Date.now() + 10000).toISOString(),
        clientes: { esta_activo: false }
      };
      expect(invitationAvailability(inv, 'chat-1')).toEqual({ valid: false, reason: 'inactive_client' });
    });

    it('es válida si cumple condiciones', () => {
      const inv = {
        expires_at: new Date(Date.now() + 10000).toISOString(),
        clientes: { esta_activo: true }
      };
      expect(invitationAvailability(inv, 'chat-1')).toEqual({ valid: true });
    });
  });

  describe('claimInvitation', () => {
    it('retorna la invitación ya reclamada por el mismo chat', async () => {
      const inv = {
        expires_at: new Date(Date.now() + 10000).toISOString(),
        clientes: { esta_activo: true },
        claimed_chat_id: 'chat-1'
      };
      const result = await claimInvitation(inv, { chatId: 'chat-1', telegramUserId: 'user-1' });
      expect(result).toEqual({ valid: true, invitation: inv });
    });

    it('realiza el reclamo exitosamente', async () => {
      const inv = {
        id: 'inv-1',
        expires_at: new Date(Date.now() + 10000).toISOString(),
        clientes: { esta_activo: true }
      };
      const mockMaybeSingle = vi.fn().mockResolvedValue({
        data: { ...inv, claimed_chat_id: 'chat-1' },
        error: null
      });
      const mockClient = () => ({
        from: vi.fn(() => ({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  maybeSingle: mockMaybeSingle
                })
              })
            })
          })
        })),
      });

      const resultReal = await claimInvitation(inv, { chatId: 'chat-1', telegramUserId: 'user-1' }, mockClient);
      expect(resultReal.valid).toBe(true);
      expect(resultReal.invitation.claimed_chat_id).toBe('chat-1');
    });

    it('hace el fallback a la consulta si la actualización retorna nulo (reclamo concurrente o ya reclamado)', async () => {
      const inv = {
        id: 'inv-1',
        expires_at: new Date(Date.now() + 10000).toISOString(),
        clientes: { esta_activo: true }
      };
      const mockCurrent = { ...inv, claimed_chat_id: 'chat-1' };
      
      const mockClient = () => ({
        from: vi.fn((table) => {
          if (table === 'telegram_invitations') {
            return {
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  is: vi.fn().mockReturnValue({
                    select: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) // update did not modify any row
                    })
                  })
                })
              }),
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: mockCurrent, error: null }) // current state query
                })
              })
            };
          }
        }),
      });

      const result = await claimInvitation(inv, { chatId: 'chat-1', telegramUserId: 'user-1' }, mockClient);
      expect(result.valid).toBe(true);
      expect(result.invitation.claimed_chat_id).toBe('chat-1');
    });
  });

  describe('consumeInvitation', () => {
    it('consume la invitación de manera exitosa', async () => {
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          is: vi.fn().mockResolvedValue({ error: null })
        })
      });
      const mockClient = () => ({
        from: vi.fn(() => ({ update: mockUpdate })),
      });

      await expect(consumeInvitation('inv-1', mockClient)).resolves.not.toThrow();
      expect(mockUpdate).toHaveBeenCalled();
    });
  });

  describe('recordConsentEvent', () => {
    it('registra el evento correctamente', async () => {
      const mockInsert = vi.fn().mockResolvedValue({ error: null });
      const mockClient = () => ({
        from: vi.fn(() => ({ insert: mockInsert })),
      });

      const params = {
        idCliente: 'cli-1',
        subscriptionId: 'sub-1',
        invitationId: 'inv-1',
        eventType: 'accept',
        method: 'telegram',
        telegramUserId: 'user-1',
        chatId: 'chat-1',
        phone: '12345',
      };

      await expect(recordConsentEvent(params, mockClient)).resolves.not.toThrow();
      expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
        id_cliente: 'cli-1',
        event_type: 'accept',
        consent_version: 'EC-LOPDP-V1'
      }));
    });
  });

  describe('hasCurrentConsent', () => {
    it('retorna false si no hay sub o está inactiva', () => {
      expect(hasCurrentConsent(null)).toBe(false);
      expect(hasCurrentConsent({ consent_status: 'accepted', is_active: false })).toBe(false);
    });

    it('retorna true si está activa y tiene la versión de consentimiento actual', () => {
      const sub = {
        consent_status: 'accepted',
        is_active: true,
        consent_notice_version: 'EC-LOPDP-V1'
      };
      expect(hasCurrentConsent(sub)).toBe(true);
    });
  });
});
