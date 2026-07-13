import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const configPath = require.resolve('../config/supabase.js');

const mockSupabaseClient = {
  from: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
  single: vi.fn(),
  upsert: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  is: vi.fn().mockReturnThis(),
  then: (onResolve) => {
    return Promise.resolve(mockSupabaseClient._resolvedValue).then(onResolve);
  }
};

const mockSupabaseModule = {
  getAdminClient: () => mockSupabaseClient,
  supabase: mockSupabaseClient
};

delete require.cache[configPath];
require.cache[configPath] = {
  id: configPath,
  filename: configPath,
  loaded: true,
  exports: mockSupabaseModule
};

// Declare variables to store the imported functions
let stateKey, consentKey, getState, setState, deleteState, deleteChatStates,
    getSubscriptionByChat, getSubscriptionByClient, getSubscriptionByPhone,
    getClientById, ensurePendingSubscription;

beforeAll(async () => {
  const mod = await import('../services/telegramState.js');
  stateKey = mod.stateKey;
  consentKey = mod.consentKey;
  getState = mod.getState;
  setState = mod.setState;
  deleteState = mod.deleteState;
  deleteChatStates = mod.deleteChatStates;
  getSubscriptionByChat = mod.getSubscriptionByChat;
  getSubscriptionByClient = mod.getSubscriptionByClient;
  getSubscriptionByPhone = mod.getSubscriptionByPhone;
  getClientById = mod.getClientById;
  ensurePendingSubscription = mod.ensurePendingSubscription;
});

describe('telegramState service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TELEGRAM_CONSENT_VERSION = 'v1.0';
    process.env.TELEGRAM_BOT_USERNAME = 'EcenciaBot';
    process.env.TELEGRAM_PRIVACY_CONTACT = 'privacy@ecencia.com';
    process.env.TELEGRAM_INVITE_TOKEN_SECRET = 'super_secret_token_at_least_32_characters_long';
    process.env.TELEGRAM_PRIVACY_POLICY_URL = 'https://ecencia.com/privacy';

    // Reset default mock resolved values to prevent leaks across tests
    mockSupabaseClient.maybeSingle.mockReset();
    mockSupabaseClient.single.mockReset();
    mockSupabaseClient._resolvedValue = { data: null, error: null };
  });

  describe('keys', () => {
    it('debe retornar keys con prefijos adecuados', () => {
      expect(stateKey('123')).toBe('session:123');
      expect(consentKey('123')).toBe('consent:123');
    });
  });

  describe('Database Operations', () => {
    it('getState debe obtener valor', async () => {
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({ data: { value: { foo: 'bar' } }, error: null });
      const res = await getState('session:123');
      expect(res).toEqual({ foo: 'bar' });
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('telegram_bot_state');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('key', 'session:123');
    });

    it('getState debe retornar null si no hay valor', async () => {
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
      const res = await getState('session:123');
      expect(res).toBeNull();
    });

    it('getState debe lanzar error si falla db', async () => {
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({ data: null, error: new Error('DB Error') });
      await expect(getState('session:123')).rejects.toThrow('DB Error');
    });

    it('setState debe upsertear valor', async () => {
      mockSupabaseClient._resolvedValue = { error: null };
      await setState('session:123', { foo: 'bar' });
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('telegram_bot_state');
      expect(mockSupabaseClient.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'session:123',
          value: expect.objectContaining({ foo: 'bar' })
        }),
        { onConflict: 'key' }
      );
    });

    it('setState debe lanzar error si falla db', async () => {
      mockSupabaseClient._resolvedValue = { error: new Error('DB Error') };
      await expect(setState('session:123', { foo: 'bar' })).rejects.toThrow('DB Error');
    });

    it('deleteState debe borrar key', async () => {
      mockSupabaseClient._resolvedValue = { error: null };
      await deleteState('session:123');
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('telegram_bot_state');
      expect(mockSupabaseClient.delete).toHaveBeenCalled();
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('key', 'session:123');
    });

    it('deleteState debe lanzar error si falla db', async () => {
      mockSupabaseClient._resolvedValue = { error: new Error('DB Error') };
      await expect(deleteState('session:123')).rejects.toThrow('DB Error');
    });

    it('deleteChatStates debe borrar ambos keys', async () => {
      mockSupabaseClient._resolvedValue = { error: null };
      await deleteChatStates('123');
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('telegram_bot_state');
      expect(mockSupabaseClient.delete).toHaveBeenCalledTimes(2);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('key', 'session:123');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('key', 'consent:123');
    });

    it('getSubscriptionByChat debe retornar sub por chat_id', async () => {
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({ data: { id: 1, chat_id: '123' }, error: null });
      const res = await getSubscriptionByChat('123');
      expect(res).toEqual({ id: 1, chat_id: '123' });
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('telegram_subscriptions');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('chat_id', '123');
    });

    it('getSubscriptionByChat debe lanzar error si falla db', async () => {
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({ data: null, error: new Error('DB Error') });
      await expect(getSubscriptionByChat('123')).rejects.toThrow('DB Error');
    });

    it('getSubscriptionByClient debe retornar null si no hay idCliente', async () => {
      const res = await getSubscriptionByClient(null);
      expect(res).toBeNull();
    });

    it('getSubscriptionByClient debe retornar sub', async () => {
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({ data: { id: 1, id_cliente: 12 }, error: null });
      const res = await getSubscriptionByClient(12);
      expect(res).toEqual({ id: 1, id_cliente: 12 });
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('telegram_subscriptions');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id_cliente', 12);
    });

    it('getSubscriptionByClient debe lanzar error si falla db', async () => {
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({ data: null, error: new Error('DB Error') });
      await expect(getSubscriptionByClient(12)).rejects.toThrow('DB Error');
    });

    it('getSubscriptionByPhone debe retornar null si el teléfono no es válido', async () => {
      const res = await getSubscriptionByPhone('invalid');
      expect(res).toBeNull();
    });

    it('getSubscriptionByPhone debe retornar sub', async () => {
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({ data: { id: 1, telefono: '+593999999999' }, error: null });
      const res = await getSubscriptionByPhone('+593 99 999 9999');
      expect(res).toEqual({ id: 1, telefono: '+593999999999' });
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('telegram_subscriptions');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('phone_normalized', '593999999999');
    });

    it('getSubscriptionByPhone debe lanzar error si falla db', async () => {
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({ data: null, error: new Error('DB Error') });
      await expect(getSubscriptionByPhone('+593 99 999 9999')).rejects.toThrow('DB Error');
    });

    it('getClientById debe retornar cliente', async () => {
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({ data: { id: 1, name: 'Client' }, error: null });
      const res = await getClientById(1);
      expect(res).toEqual({ id: 1, name: 'Client' });
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('clientes');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id_cliente', 1);
    });

    it('getClientById debe lanzar error si falla db', async () => {
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({ data: null, error: new Error('DB Error') });
      await expect(getClientById(1)).rejects.toThrow('DB Error');
    });
  });

  describe('ensurePendingSubscription', () => {
    it('debe lanzar error 409 si cliente y chat tienen suscripciones distintas', async () => {
      mockSupabaseClient.maybeSingle
        .mockResolvedValueOnce({ data: { id: 1, id_cliente: 1 }, error: null }) // byClient
        .mockResolvedValueOnce({ data: { id: 2, chat_id: '123' }, error: null }); // byChat

      await expect(ensurePendingSubscription({ idCliente: 1, chatId: '123' }))
        .rejects.toThrow('El chat o cliente ya esta vinculado a otra suscripcion.');
    });

    it('debe lanzar error 409 si el chat pertenece a otro cliente', async () => {
      mockSupabaseClient.maybeSingle
        .mockResolvedValueOnce({ data: null, error: null }) // byClient
        .mockResolvedValueOnce({ data: { id: 2, id_cliente: 99, chat_id: '123' }, error: null }); // byChat

      await expect(ensurePendingSubscription({ idCliente: 1, chatId: '123' }))
        .rejects.toThrow('Este chat ya pertenece a otro cliente.');
    });

    it('debe lanzar error 409 si el cliente está vinculado a otro chat', async () => {
      mockSupabaseClient.maybeSingle
        .mockResolvedValueOnce({ data: { id: 1, id_cliente: 1, chat_id: '999' }, error: null }) // byClient
        .mockResolvedValueOnce({ data: null, error: null }); // byChat

      await expect(ensurePendingSubscription({ idCliente: 1, chatId: '123' }))
        .rejects.toThrow('El cliente ya esta vinculado a otro chat.');
    });

    it('debe actualizar si ya existe una suscripción parcial', async () => {
      const invitation = { id: 1, id_cliente: 1, chat_id: '123' };
      mockSupabaseClient.maybeSingle
        .mockResolvedValueOnce({ data: invitation, error: null }) // byClient
        .mockResolvedValueOnce({ data: invitation, error: null }); // byChat

      mockSupabaseClient.single.mockResolvedValueOnce({ data: invitation, error: null });

      const res = await ensurePendingSubscription({ idCliente: 1, chatId: '123' });
      expect(res).toEqual(invitation);
      expect(mockSupabaseClient.update).toHaveBeenCalled();
    });

    it('debe lanzar error si falla actualizacion', async () => {
      const invitation = { id: 1, id_cliente: 1, chat_id: '123' };
      mockSupabaseClient.maybeSingle
        .mockResolvedValueOnce({ data: invitation, error: null }) // byClient
        .mockResolvedValueOnce({ data: invitation, error: null }); // byChat

      mockSupabaseClient.single.mockResolvedValueOnce({ data: null, error: new Error('DB Error') });

      await expect(ensurePendingSubscription({ idCliente: 1, chatId: '123' })).rejects.toThrow('DB Error');
    });

    it('debe insertar una nueva suscripción si no existe ninguna previa', async () => {
      mockSupabaseClient.maybeSingle
        .mockResolvedValueOnce({ data: null, error: null }) // byClient
        .mockResolvedValueOnce({ data: null, error: null }); // byChat

      const newSub = { id: 3, id_cliente: 1, chat_id: '123' };
      mockSupabaseClient._resolvedValue = { data: newSub, error: null };
      mockSupabaseClient.single.mockResolvedValueOnce({ data: newSub, error: null });

      const res = await ensurePendingSubscription({ idCliente: 1, chatId: '123' });
      expect(res).toEqual(newSub);
      expect(mockSupabaseClient.insert).toHaveBeenCalled();
    });

    it('debe lanzar error si falla insercion', async () => {
      mockSupabaseClient.maybeSingle
        .mockResolvedValueOnce({ data: null, error: null }) // byClient
        .mockResolvedValueOnce({ data: null, error: null }); // byChat

      mockSupabaseClient._resolvedValue = { data: null, error: new Error('DB Error') };
      mockSupabaseClient.single.mockResolvedValueOnce({ data: null, error: new Error('DB Error') });

      await expect(ensurePendingSubscription({ idCliente: 1, chatId: '123' })).rejects.toThrow('DB Error');
    });
  });
});
