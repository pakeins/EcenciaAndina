import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('telegramState service', () => {
  const makeChainableMock = (finalValue) => {
    const obj = {};
    obj.from = vi.fn().mockReturnValue(obj);
    obj.select = vi.fn().mockReturnValue(obj);
    obj.insert = vi.fn().mockReturnValue(obj);
    obj.update = vi.fn().mockReturnValue(obj);
    obj.delete = vi.fn().mockReturnValue(obj);
    obj.upsert = vi.fn().mockReturnValue(obj);
    obj.eq = vi.fn().mockReturnValue(obj);
    obj.is = vi.fn().mockReturnValue(obj);
    obj.maybeSingle = vi.fn().mockResolvedValue(finalValue);
    obj.single = vi.fn().mockResolvedValue(finalValue);
    obj.then = (onResolve) => Promise.resolve(finalValue).then(onResolve);
    return obj;
  };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.TELEGRAM_CONSENT_VERSION = 'v1.0';
    process.env.TELEGRAM_BOT_USERNAME = 'EcenciaBot';
    process.env.TELEGRAM_PRIVACY_CONTACT = 'privacy@ecencia.com';
    process.env.TELEGRAM_INVITE_TOKEN_SECRET = 'super_secret_token_at_least_32_characters_long';
    process.env.TELEGRAM_PRIVACY_POLICY_URL = 'https://ecencia.com/privacy';
  });

  describe('keys', () => {
    it('debe retornar keys con prefijos adecuados', () => {
      const { stateKey, consentKey } = require('../services/telegramState.js');
      expect(stateKey('123')).toBe('session:123');
      expect(consentKey('123')).toBe('consent:123');
    });
  });

  describe('Database Operations', () => {
    it('getState debe obtener valor', async () => {
      const supabase = require('../config/supabase');
      const dbMock = makeChainableMock({ data: { value: { foo: 'bar' } }, error: null });
      vi.spyOn(supabase, 'getAdminClient').mockReturnValue(dbMock);

      const { getState } = require('../services/telegramState.js');
      const res = await getState('session:123');
      expect(res).toEqual({ foo: 'bar' });
    });

    it('setState debe upsertear valor', async () => {
      const supabase = require('../config/supabase');
      const dbMock = makeChainableMock({ error: null });
      vi.spyOn(supabase, 'getAdminClient').mockReturnValue(dbMock);

      const { setState } = require('../services/telegramState.js');
      await setState('session:123', { foo: 'bar' });
      expect(dbMock.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'session:123', value: expect.objectContaining({ foo: 'bar' }) }),
        { onConflict: 'key' }
      );
    });

    it('deleteState debe borrar key', async () => {
      const supabase = require('../config/supabase');
      const dbMock = makeChainableMock({ error: null });
      vi.spyOn(supabase, 'getAdminClient').mockReturnValue(dbMock);

      const { deleteState } = require('../services/telegramState.js');
      await deleteState('session:123');
      expect(dbMock.delete).toHaveBeenCalled();
    });

    it('deleteChatStates debe borrar ambos keys', async () => {
      const supabase = require('../config/supabase');
      const dbMock = makeChainableMock({ error: null });
      vi.spyOn(supabase, 'getAdminClient').mockReturnValue(dbMock);

      const { deleteChatStates } = require('../services/telegramState.js');
      await deleteChatStates('123');
      expect(dbMock.delete).toHaveBeenCalledTimes(2);
    });

    it('getSubscriptionByChat debe retornar sub por chat_id', async () => {
      const supabase = require('../config/supabase');
      const dbMock = makeChainableMock({ data: { id: 1 }, error: null });
      vi.spyOn(supabase, 'getAdminClient').mockReturnValue(dbMock);

      const { getSubscriptionByChat } = require('../services/telegramState.js');
      const res = await getSubscriptionByChat('123');
      expect(res).toEqual({ id: 1 });
    });

    it('getSubscriptionByClient debe retornar null si no hay idCliente', async () => {
      const { getSubscriptionByClient } = require('../services/telegramState.js');
      const res = await getSubscriptionByClient(null);
      expect(res).toBeNull();
    });

    it('getSubscriptionByClient debe retornar sub', async () => {
      const supabase = require('../config/supabase');
      const dbMock = makeChainableMock({ data: { id: 1 }, error: null });
      vi.spyOn(supabase, 'getAdminClient').mockReturnValue(dbMock);

      const { getSubscriptionByClient } = require('../services/telegramState.js');
      const res = await getSubscriptionByClient(12);
      expect(res).toEqual({ id: 1 });
    });

    it('getSubscriptionByPhone debe retornar null si el teléfono no es válido', async () => {
      const { getSubscriptionByPhone } = require('../services/telegramState.js');
      const res = await getSubscriptionByPhone('invalid');
      expect(res).toBeNull();
    });

    it('getSubscriptionByPhone debe retornar sub', async () => {
      const supabase = require('../config/supabase');
      const dbMock = makeChainableMock({ data: { id: 1 }, error: null });
      vi.spyOn(supabase, 'getAdminClient').mockReturnValue(dbMock);

      const { getSubscriptionByPhone } = require('../services/telegramState.js');
      const res = await getSubscriptionByPhone('+593 99 999 9999');
      expect(res).toEqual({ id: 1 });
    });

    it('getClientById debe retornar cliente', async () => {
      const supabase = require('../config/supabase');
      const dbMock = makeChainableMock({ data: { id_cliente: 1 }, error: null });
      vi.spyOn(supabase, 'getAdminClient').mockReturnValue(dbMock);

      const { getClientById } = require('../services/telegramState.js');
      const res = await getClientById(1);
      expect(res).toEqual({ id_cliente: 1 });
    });
  });

  describe('ensurePendingSubscription', () => {
    it('debe lanzar error 409 si cliente y chat tienen suscripciones distintas', async () => {
      const supabase = require('../config/supabase');
      const mockSingle1 = vi.fn().mockResolvedValue({ data: { id: 1, id_cliente: 1 }, error: null });
      const mockSingle2 = vi.fn().mockResolvedValue({ data: { id: 2, id_cliente: 2 }, error: null });
      
      const mockFrom = vi.fn().mockImplementation((table) => {
        if (table === 'telegram_subscriptions') {
          return {
            select: () => ({
              eq: (field, val) => {
                if (field === 'id_cliente') return { maybeSingle: mockSingle1 };
                if (field === 'chat_id') return { maybeSingle: mockSingle2 };
              }
            })
          };
        }
      });
      vi.spyOn(supabase, 'getAdminClient').mockReturnValue({ from: mockFrom });

      const { ensurePendingSubscription } = require('../services/telegramState.js');
      await expect(ensurePendingSubscription({ idCliente: 1, chatId: '123' }))
        .rejects.toThrow('El chat o cliente ya esta vinculado a otra suscripcion.');
    });

    it('debe lanzar error 409 si el chat pertenece a otro cliente', async () => {
      const supabase = require('../config/supabase');
      const mockSingleClient = vi.fn().mockResolvedValue({ data: null, error: null });
      const mockSingleChat = vi.fn().mockResolvedValue({ data: { id: 1, id_cliente: 99 }, error: null });
      
      const mockFrom = vi.fn().mockImplementation((table) => {
        if (table === 'telegram_subscriptions') {
          return {
            select: () => ({
              eq: (field, val) => {
                if (field === 'id_cliente') return { maybeSingle: mockSingleClient };
                if (field === 'chat_id') return { maybeSingle: mockSingleChat };
              }
            })
          };
        }
      });
      vi.spyOn(supabase, 'getAdminClient').mockReturnValue({ from: mockFrom });

      const { ensurePendingSubscription } = require('../services/telegramState.js');
      await expect(ensurePendingSubscription({ idCliente: 1, chatId: '123' }))
        .rejects.toThrow('Este chat ya pertenece a otro cliente.');
    });

    it('debe lanzar error 409 si el cliente está vinculado a otro chat', async () => {
      const supabase = require('../config/supabase');
      const mockSingleClient = vi.fn().mockResolvedValue({ data: { id: 1, chat_id: '999' }, error: null });
      const mockSingleChat = vi.fn().mockResolvedValue({ data: null, error: null });
      
      const mockFrom = vi.fn().mockImplementation((table) => {
        if (table === 'telegram_subscriptions') {
          return {
            select: () => ({
              eq: (field, val) => {
                if (field === 'id_cliente') return { maybeSingle: mockSingleClient };
                if (field === 'chat_id') return { maybeSingle: mockSingleChat };
              }
            })
          };
        }
      });
      vi.spyOn(supabase, 'getAdminClient').mockReturnValue({ from: mockFrom });

      const { ensurePendingSubscription } = require('../services/telegramState.js');
      await expect(ensurePendingSubscription({ idCliente: 1, chatId: '123' }))
        .rejects.toThrow('El cliente ya esta vinculado a otro chat.');
    });

    it('debe actualizar si ya existe una suscripción parcial', async () => {
      const supabase = require('../config/supabase');
      const invitation = { id: 1, id_cliente: 1, chat_id: '123' };
      const dbMock = makeChainableMock({ data: invitation, error: null });
      vi.spyOn(supabase, 'getAdminClient').mockReturnValue(dbMock);

      const { ensurePendingSubscription } = require('../services/telegramState.js');
      const res = await ensurePendingSubscription({ idCliente: 1, chatId: '123' });
      expect(res).toEqual(invitation);
    });
  });
});
