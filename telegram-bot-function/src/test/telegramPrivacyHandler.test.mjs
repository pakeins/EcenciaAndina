import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/telegramState', () => ({
  ensurePendingSubscription: vi.fn(),
  setState: vi.fn(),
  consentKey: (chatId) => `consent:${chatId}`,
  getState: vi.fn(),
  deleteState: vi.fn(),
  stateKey: vi.fn()
}));

import {
  invitationFailureText,
  privacyText,
  hasCurrentConsent,
  beginConsent
} from '../handlers/telegramPrivacyHandler.js';
import * as telegramApi from '../services/telegramApi.js';
import * as telegramState from '../services/telegramState.js';

describe('telegramPrivacyHandler', () => {
  
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TELEGRAM_PRIVACY_CONTACT = 'contacto@test.com';
    process.env.TELEGRAM_CONSENT_VERSION = 'v1.0.0-2024';
    process.env.TELEGRAM_INVITE_TOKEN_SECRET = 'secret_test_token';
  });

  describe('Funciones de Texto (Puras)', () => {
    it('invitationFailureText debe retornar textos correctos', () => {
      const { invitationFailureText } = require('../handlers/telegramPrivacyHandler.js');
      expect(invitationFailureText('claimed')).toContain('ya fue abierto');
      expect(invitationFailureText('inactive_client')).toContain('no esta activo');
      expect(invitationFailureText('other')).toContain('no es valida');
    });

    it('privacyText debe contener el mensaje de privacidad', () => {
      const { privacyText } = require('../handlers/telegramPrivacyHandler.js');
      const text = privacyText();
      expect(text).toContain('Aviso de privacidad');
      expect(text).toContain('contacto@test.com');
    });
  });

  describe('hasCurrentConsent', () => {
    it('debe validar el consentimiento aceptado con versión actual', () => {
      const { hasCurrentConsent } = require('../handlers/telegramPrivacyHandler.js');
      const sub = {
        consent_status: 'accepted',
        consent_notice_version: 'v1.0.0-2024'
      };
      // La v1.0.0-2024 es la hardcodeada en getConsentVersion actualmente
      expect(hasCurrentConsent(sub)).toBe(true);
    });

    it('debe retornar falso si no esta aceptado o la version es diferente', () => {
      const { hasCurrentConsent } = require('../handlers/telegramPrivacyHandler.js');
      expect(hasCurrentConsent({ consent_status: 'pending' })).toBe(false);
      expect(hasCurrentConsent({ consent_status: 'accepted', consent_notice_version: 'old' })).toBe(false);
      expect(hasCurrentConsent(null)).toBe(false);
    });
  });

  describe('Database Wrappers', () => {
    it('getSubscriptionByChat debe retornar datos si existen', async () => {
      const { getSubscriptionByChat } = require('../handlers/telegramPrivacyHandler.js');
      const supabase = require('../config/supabase.js');
      const mockSingle = vi.fn().mockResolvedValue({ data: { id: 1 }, error: null });
      const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockSingle });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });
      
      vi.spyOn(supabase, 'getAdminClient').mockReturnValue({ from: mockFrom });

      const res = await getSubscriptionByChat(123);
      expect(res).toEqual({ id: 1 });
      expect(mockFrom).toHaveBeenCalledWith('telegram_subscriptions');
    });

    it('debe iniciar el flujo de consentimiento enviando el mensaje y guardando el estado', async () => {
      const { beginConsent } = require('../handlers/telegramPrivacyHandler.js');
      const telegramState = require('../services/telegramState.js');
      const telegramApi = require('../services/telegramApi.js');

      const subMock = { id: 123, id_cliente: 456 };
      vi.spyOn(telegramState, 'ensurePendingSubscription').mockResolvedValue(subMock);
      vi.spyOn(telegramState, 'setState').mockResolvedValue(true);
      vi.spyOn(telegramApi, 'sendMessage').mockResolvedValue(true);

      const result = await beginConsent({
        idCliente: 456,
        chatId: '789',
        telegramUserId: 'user1',
        telegramUsername: 'uname',
        invitationId: null,
        cleanupMessageIds: [1, 2]
      });

      expect(result).toBe(subMock);
      expect(telegramState.ensurePendingSubscription).toHaveBeenCalledWith({
        idCliente: 456,
        chatId: '789',
        telegramUserId: 'user1',
        telegramUsername: 'uname'
      });
      expect(telegramApi.sendMessage).toHaveBeenCalled();
      expect(telegramState.setState).toHaveBeenCalled();
    });
    
    it('acceptConsent debe avanzar el estado a accepted_pending_phone', async () => {
      const { acceptConsent } = require('../handlers/telegramPrivacyHandler.js');
      const telegramState = require('../services/telegramState.js');
      const telegramApi = require('../services/telegramApi.js');
      const supabase = require('../config/supabase.js');
      const telegramConsent = require('../services/telegramConsent.js');

      vi.spyOn(telegramApi, 'removeInlineKeyboard').mockResolvedValue();
      vi.spyOn(telegramApi, 'sendMessage').mockResolvedValue();
      vi.spyOn(telegramState, 'setState').mockResolvedValue();
      vi.spyOn(telegramConsent, 'recordConsentEvent').mockResolvedValue();
      
      const mockEq = vi.fn().mockResolvedValue({ error: null });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      const mockFrom = vi.fn().mockReturnValue({ update: mockUpdate });
      vi.spyOn(supabase, 'getAdminClient').mockReturnValue({ from: mockFrom });

      await acceptConsent(
        { chatId: '789', messageId: 10, telegramUserId: 'user1' },
        { id: 123 },
        { status: 'awaiting_decision', idCliente: 456, subscriptionId: 123, policyVersion: 'v1' }
      );

      expect(telegramApi.removeInlineKeyboard).toHaveBeenCalledWith('789', 10);
      expect(telegramState.setState).toHaveBeenCalledWith('consent:789', expect.objectContaining({
        status: 'accepted_pending_phone'
      }));
      expect(telegramConsent.recordConsentEvent).toHaveBeenCalled();
    });

    it('rejectConsent debe cancelar y guardar en la DB', async () => {
      const { rejectConsent } = require('../handlers/telegramPrivacyHandler.js');
      const telegramState = require('../services/telegramState.js');
      const telegramApi = require('../services/telegramApi.js');
      const supabase = require('../config/supabase.js');
      const telegramConsent = require('../services/telegramConsent.js');

      vi.spyOn(telegramApi, 'removeInlineKeyboard').mockResolvedValue();
      vi.spyOn(telegramApi, 'sendMessage').mockResolvedValue();
      vi.spyOn(telegramState, 'deleteState').mockResolvedValue();
      vi.spyOn(telegramConsent, 'recordConsentEvent').mockResolvedValue();
      
      const mockEq = vi.fn().mockResolvedValue({ error: null });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      const mockFrom = vi.fn().mockReturnValue({ update: mockUpdate });
      vi.spyOn(supabase, 'getAdminClient').mockReturnValue({ from: mockFrom });

      await rejectConsent(
        { chatId: '789', messageId: 10, telegramUserId: 'user1' },
        { id: 123 },
        { status: 'awaiting_decision', idCliente: 456, subscriptionId: 123, policyVersion: 'v1' }
      );

      expect(telegramApi.removeInlineKeyboard).toHaveBeenCalledWith('789', 10);
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
        consent_status: 'rejected'
      }));
      expect(telegramState.deleteState).toHaveBeenCalledWith('consent:789');
    });

    it('validateAndSaveContact debe validar, guardar y notificar si el teléfono coincide', async () => {
      const { validateAndSaveContact } = require('../handlers/telegramPrivacyHandler.js');
      const telegramState = require('../services/telegramState.js');
      const telegramApi = require('../services/telegramApi.js');
      const supabase = require('../config/supabase.js');
      const telegramConsent = require('../services/telegramConsent.js');

      const clientMock = { telefono: '0987654321', nombre: 'Juan', apellido: 'Perez' };
      const mockSingle = vi.fn().mockResolvedValue({ data: clientMock, error: null });
      const mockEqSelect = vi.fn().mockReturnValue({ maybeSingle: mockSingle });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEqSelect });
      const mockFromSelect = vi.fn().mockReturnValue({ select: mockSelect });

      const mockEqUpdate = vi.fn().mockResolvedValue({ error: null });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEqUpdate });
      const mockFromUpdate = vi.fn().mockReturnValue({ update: mockUpdate });

      vi.spyOn(supabase, 'getAdminClient').mockImplementation(() => {
        return {
          from: (table) => {
            if (table === 'clientes') return { select: mockSelect };
            if (table === 'telegram_subscriptions') return { update: mockUpdate };
          }
        };
      });

      vi.spyOn(telegramApi, 'sendMessage').mockResolvedValue();
      vi.spyOn(telegramApi, 'deleteMessage').mockResolvedValue();
      vi.spyOn(telegramState, 'deleteState').mockResolvedValue();
      vi.spyOn(telegramConsent, 'recordConsentEvent').mockResolvedValue();

      await validateAndSaveContact(
        { chatId: '789', messageId: 10, telegramUserId: 'user1', contactPhone: '0987654321' },
        { id: 123 },
        { status: 'accepted_pending_phone', idCliente: 456, subscriptionId: 123, policyVersion: 'v1' }
      );

      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
        phone_normalized: '593987654321',
        consent_status: 'accepted'
      }));
      expect(telegramApi.sendMessage).toHaveBeenCalledWith('789', expect.stringContaining('¡Registro Completado!'), expect.anything(), 'HTML');
      expect(telegramState.deleteState).toHaveBeenCalledWith('consent:789');
    });
    it('getSubscriptionByClient debe retornar datos si existen', async () => {
      const { getSubscriptionByClient } = require('../handlers/telegramPrivacyHandler.js');
      const supabase = require('../config/supabase.js');
      const mockSingle = vi.fn().mockResolvedValue({ data: { id: 2 }, error: null });
      const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockSingle });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });
      
      vi.spyOn(supabase, 'getAdminClient').mockReturnValue({ from: mockFrom });

      const res = await getSubscriptionByClient(456);
      expect(res).toEqual({ id: 2 });
      expect(mockFrom).toHaveBeenCalledWith('telegram_subscriptions');
    });

    it('getSubscriptionByPhone debe retornar datos si existen', async () => {
      const { getSubscriptionByPhone } = require('../handlers/telegramPrivacyHandler.js');
      const supabase = require('../config/supabase.js');
      const mockSingle = vi.fn().mockResolvedValue({ data: { id: 3 }, error: null });
      const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockSingle });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });
      
      vi.spyOn(supabase, 'getAdminClient').mockReturnValue({ from: mockFrom });

      const res = await getSubscriptionByPhone('0987654321');
      expect(res).toEqual({ id: 3 });
    });

    it('getClientById debe retornar datos si existen', async () => {
      const { getClientById } = require('../handlers/telegramPrivacyHandler.js');
      const supabase = require('../config/supabase.js');
      const mockSingle = vi.fn().mockResolvedValue({ data: { id_cliente: 456 }, error: null });
      const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockSingle });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });
      
      vi.spyOn(supabase, 'getAdminClient').mockReturnValue({ from: mockFrom });

      const res = await getClientById(456);
      expect(res).toEqual({ id_cliente: 456 });
    });

    it('handleStartInvitation debe enviar error si el token no es válido', async () => {
      const { handleStartInvitation } = require('../handlers/telegramPrivacyHandler.js');
      const telegramApi = require('../services/telegramApi.js');
      const telegramConsent = require('../services/telegramConsent.js');
      
      vi.spyOn(telegramConsent, 'getInvitationByToken').mockResolvedValue(null);
      vi.spyOn(telegramConsent, 'claimInvitation').mockResolvedValue({ valid: false, reason: 'invalid' });
      vi.spyOn(telegramApi, 'sendMessage').mockResolvedValue();

      await handleStartInvitation({ chatId: '789' }, 'bad_token');
      expect(telegramApi.sendMessage).toHaveBeenCalledWith('789', expect.stringContaining('no es valida'));
    });

    it('requestPolicyReconsent debe guardar evento e iniciar consent', async () => {
      const { requestPolicyReconsent } = require('../handlers/telegramPrivacyHandler.js');
      const telegramConsent = require('../services/telegramConsent.js');
      const telegramState = require('../services/telegramState.js');
      const telegramApi = require('../services/telegramApi.js');
      
      vi.spyOn(telegramConsent, 'recordConsentEvent').mockResolvedValue();
      vi.spyOn(telegramState, 'ensurePendingSubscription').mockResolvedValue({ id: 123 });
      vi.spyOn(telegramState, 'setState').mockResolvedValue();
      vi.spyOn(telegramApi, 'sendMessage').mockResolvedValue();

      await requestPolicyReconsent(
        { chatId: '789', telegramUserId: 'user1', telegramUsername: 'uname' },
        { id: 123, id_cliente: 456, phone_normalized: '593987654321', consent_notice_version: 'v0.9' }
      );

      expect(telegramConsent.recordConsentEvent).toHaveBeenCalledWith(expect.objectContaining({
        eventType: 'policy_reconsent_requested'
      }));
      expect(telegramState.ensurePendingSubscription).toHaveBeenCalled();
      expect(telegramApi.sendMessage).toHaveBeenCalled();
    });

    it('handlePrivacyCommand debe procesar comandos de privacidad', async () => {
      const { handlePrivacyCommand } = require('../handlers/telegramPrivacyHandler.js');
      const telegramApi = require('../services/telegramApi.js');

      vi.spyOn(telegramApi, 'sendMessage').mockResolvedValue();

      await handlePrivacyCommand('/misdatos', { chatId: '789' }, {});
      expect(telegramApi.sendMessage).toHaveBeenCalledWith('789', expect.stringContaining('Tus Datos'), null, 'HTML');

      vi.clearAllMocks();
      await handlePrivacyCommand('/revocar', { chatId: '789' }, {});
      expect(telegramApi.sendMessage).toHaveBeenCalledWith('789', expect.stringContaining('revocar tu acceso'), expect.anything());
    });
  });
});
