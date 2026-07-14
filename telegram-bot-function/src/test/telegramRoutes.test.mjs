import { describe, it, expect, vi, beforeEach } from 'vitest';

const privacyHandler = require('../handlers/telegramPrivacyHandler');
const orderHandler = require('../handlers/telegramOrderHandler');
const orderTrace = require('../services/telegramOrderTrace');
const consent = require('../services/telegramConsent');
const api = require('../services/telegramApi');
const helpers = require('../utils/telegramHelpers');
const state = require('../services/telegramState');
const keyboards = require('../ui/telegramKeyboards');

// Spy on all of them first and stub implementations to avoid real calls!
const spies = {
  getSubscriptionByChat: vi.spyOn(privacyHandler, 'getSubscriptionByChat').mockImplementation(() => Promise.resolve(null)),
  getClientById: vi.spyOn(privacyHandler, 'getClientById').mockImplementation(() => Promise.resolve(null)),
  beginConsent: vi.spyOn(privacyHandler, 'beginConsent').mockImplementation(() => Promise.resolve(null)),
  acceptConsent: vi.spyOn(privacyHandler, 'acceptConsent').mockImplementation(() => Promise.resolve(null)),
  rejectConsent: vi.spyOn(privacyHandler, 'rejectConsent').mockImplementation(() => Promise.resolve(null)),
  validateAndSaveContact: vi.spyOn(privacyHandler, 'validateAndSaveContact').mockImplementation(() => Promise.resolve(null)),
  handleStartInvitation: vi.spyOn(privacyHandler, 'handleStartInvitation').mockImplementation(() => Promise.resolve(null)),
  requestPolicyReconsent: vi.spyOn(privacyHandler, 'requestPolicyReconsent').mockImplementation(() => Promise.resolve(null)),
  handlePrivacyCommand: vi.spyOn(privacyHandler, 'handlePrivacyCommand').mockImplementation(() => Promise.resolve(false)),

  handleAcceptedSession: vi.spyOn(orderHandler, 'handleAcceptedSession').mockImplementation(() => Promise.resolve(null)),
  promptMenu: vi.spyOn(orderHandler, 'promptMenu').mockImplementation(() => Promise.resolve(null)),
  handlePedidoCallback: vi.spyOn(orderHandler, 'handlePedidoCallback').mockImplementation(() => Promise.resolve(null)),
  findActiveTodayOrder: vi.spyOn(orderHandler, 'findActiveTodayOrder').mockImplementation(() => Promise.resolve(null)),
  getOrderDetail: vi.spyOn(orderHandler, 'getOrderDetail').mockImplementation(() => Promise.resolve(null)),

  createOrderTrace: vi.spyOn(orderTrace, 'createOrderTrace').mockImplementation(() => Promise.resolve('trace_id')),
  updateOrderTrace: vi.spyOn(orderTrace, 'updateOrderTrace').mockImplementation(() => Promise.resolve(null)),

  hasCurrentConsent: vi.spyOn(consent, 'hasCurrentConsent').mockImplementation(() => false),

  answerCallback: vi.spyOn(api, 'answerCallback').mockImplementation(() => Promise.resolve(null)),
  deleteMessage: vi.spyOn(api, 'deleteMessage').mockImplementation(() => Promise.resolve(null)),
  removeInlineKeyboard: vi.spyOn(api, 'removeInlineKeyboard').mockImplementation(() => Promise.resolve(null)),
  sendMessage: vi.spyOn(api, 'sendMessage').mockImplementation(() => Promise.resolve(null)),

  todayInTimezone: vi.spyOn(helpers, 'todayInTimezone').mockImplementation(() => '2023-01-01'),
  isBusinessDay: vi.spyOn(helpers, 'isBusinessDay').mockImplementation(() => true),

  getState: vi.spyOn(state, 'getState').mockImplementation(() => Promise.resolve(null)),
  setState: vi.spyOn(state, 'setState').mockImplementation(() => Promise.resolve(null)),
  deleteState: vi.spyOn(state, 'deleteState').mockImplementation(() => Promise.resolve(null))
};

// Now require telegramRoutes, so it gets the spied functions!
let handleTelegramUpdate, _private;

beforeAll(async () => {
  const routes = await import('../functions/telegramRoutes.js');
  handleTelegramUpdate = routes.handleTelegramUpdate;
  _private = routes._private;
});

describe('telegramRoutes - Main Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore default stub implementations
    Object.values(spies).forEach(spy => {
      spy.mockClear();
    });
    spies.getSubscriptionByChat.mockResolvedValue(null);
    spies.getClientById.mockResolvedValue(null);
    spies.beginConsent.mockResolvedValue(null);
    spies.acceptConsent.mockResolvedValue(null);
    spies.rejectConsent.mockResolvedValue(null);
    spies.validateAndSaveContact.mockResolvedValue(null);
    spies.handleStartInvitation.mockResolvedValue(null);
    spies.requestPolicyReconsent.mockResolvedValue(null);
    spies.handlePrivacyCommand.mockResolvedValue(false);
    spies.handleAcceptedSession.mockResolvedValue(null);
    spies.promptMenu.mockResolvedValue(null);
    spies.handlePedidoCallback.mockResolvedValue(null);
    spies.findActiveTodayOrder.mockResolvedValue(null);
    spies.getOrderDetail.mockResolvedValue(null);
    spies.createOrderTrace.mockResolvedValue('trace_id');
    spies.updateOrderTrace.mockResolvedValue(null);
    spies.hasCurrentConsent.mockReturnValue(false);
    spies.answerCallback.mockResolvedValue(null);
    spies.deleteMessage.mockResolvedValue(null);
    spies.removeInlineKeyboard.mockResolvedValue(null);
    spies.sendMessage.mockResolvedValue(null);
    spies.todayInTimezone.mockReturnValue('2023-01-01');
    spies.isBusinessDay.mockReturnValue(true);
    spies.getState.mockResolvedValue(null);
    spies.setState.mockResolvedValue(null);
    spies.deleteState.mockResolvedValue(null);
  });

  describe('readUpdate', () => {
    it('debe leer update de callback_query', () => {
      const update = {
        callback_query: {
          id: 'cb_123',
          message: { chat: { id: 123 }, message_id: 456 },
          data: 'some_data',
          from: { id: 789, username: 'user1' }
        }
      };
      const res = _private.readUpdate(update);
      expect(res).toEqual({
        updateId: null,
        chatId: '123',
        messageId: 456,
        text: 'some_data',
        contactPhone: '',
        contactVerified: false,
        telegramUserId: '789',
        telegramUsername: 'user1',
        isCallback: true,
        callbackId: 'cb_123'
      });
    });

    it('debe leer update de mensaje normal', () => {
      const update = {
        message: {
          chat: { id: 123 },
          message_id: 456,
          text: 'hello',
          from: { id: 789, username: 'user1' }
        }
      };
      const res = _private.readUpdate(update);
      expect(res).toEqual({
        updateId: null,
        chatId: '123',
        messageId: 456,
        text: 'hello',
        contactPhone: '',
        contactVerified: false,
        telegramUserId: '789',
        telegramUsername: 'user1',
        isCallback: false,
        callbackId: ''
      });
    });

    it('debe retornar vacío si no es mensaje ni callback', () => {
      const res = _private.readUpdate({});
      expect(res).toEqual({
        updateId: null,
        chatId: '',
        messageId: null,
        text: '',
        contactPhone: '',
        contactVerified: false,
        telegramUserId: '',
        telegramUsername: '',
        isCallback: false,
        callbackId: ''
      });
    });
  });

  describe('parseStartToken', () => {
    it('debe parsear token de inicio', () => {
      expect(_private.parseStartToken('/start my_token')).toEqual({ isStart: true, token: 'my_token' });
      expect(_private.parseStartToken('/start')).toEqual({ isStart: true, token: null });
      expect(_private.parseStartToken('hello')).toBeNull();
    });
  });

  describe('handleTelegramUpdate', () => {
    it('debe abortar si no hay chatId', async () => {
      await handleTelegramUpdate({});
      expect(spies.answerCallback).not.toHaveBeenCalled();
    });

    it('debe responder callback_query si se proporciona callbackId', async () => {
      const update = {
        callback_query: {
          id: 'cb_123',
          message: { chat: { id: 123 }, message_id: 456 },
          data: 'some_data',
          from: { id: 789 }
        }
      };
      spies.getSubscriptionByChat.mockResolvedValue({ id: 1 });
      await handleTelegramUpdate(update);
      expect(spies.answerCallback).toHaveBeenCalledWith('cb_123');
    });

    it('debe procesar token de invitación start', async () => {
      const update = {
        message: {
          chat: { id: 123 },
          message_id: 456,
          text: '/start my_token',
          from: { id: 789 }
        }
      };
      await handleTelegramUpdate(update);
      expect(spies.handleStartInvitation).toHaveBeenCalledWith(expect.any(Object), 'my_token');
    });

    it('debe delegar comandos de privacidad', async () => {
      const update = {
        message: {
          chat: { id: 123 },
          message_id: 456,
          text: '/privacidad',
          from: { id: 789 }
        }
      };
      spies.getSubscriptionByChat.mockResolvedValue({ id: 1 });
      spies.handlePrivacyCommand.mockResolvedValue(true);

      await handleTelegramUpdate(update);
      expect(spies.handlePrivacyCommand).toHaveBeenCalled();
    });

    it('debe solicitar reconsentimiento si la versión de la política cambió', async () => {
      const update = {
        message: {
          chat: { id: 123 },
          message_id: 456,
          text: 'hello',
          from: { id: 789 }
        }
      };
      spies.getSubscriptionByChat.mockResolvedValue({ consent_status: 'accepted', id: 1 });
      spies.hasCurrentConsent.mockReturnValue(false); // versión obsoleta

      await handleTelegramUpdate(update);
      expect(spies.requestPolicyReconsent).toHaveBeenCalled();
    });

    it('debe manejar /start de usuario registrado desactivado', async () => {
      const update = {
        message: {
          chat: { id: 123 },
          message_id: 456,
          text: '/start',
          from: { id: 789 }
        }
      };
      spies.getSubscriptionByChat.mockResolvedValue({ id: 1, id_cliente: 456 });
      spies.getClientById.mockResolvedValue({ esta_activo: false });

      await handleTelegramUpdate(update);
      expect(spies.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('desactivada'), null, 'HTML');
    });

    it('debe manejar /start de usuario registrado activo', async () => {
      const update = {
        message: {
          chat: { id: 123 },
          message_id: 456,
          text: '/start',
          from: { id: 789 }
        }
      };
      spies.getSubscriptionByChat.mockResolvedValue({ id: 1, id_cliente: 456 });
      spies.getClientById.mockResolvedValue({ esta_activo: true });
      spies.hasCurrentConsent.mockReturnValue(true);

      await handleTelegramUpdate(update);
      expect(spies.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('suscrito'), null, 'HTML');
    });

    it('debe aceptar consentimiento vía callback', async () => {
      const update = {
        callback_query: {
          id: 'cb_123',
          message: { chat: { id: 123 }, message_id: 456 },
          data: 'consent:accept',
          from: { id: 789 }
        }
      };
      spies.getSubscriptionByChat.mockResolvedValue({ id: 1 });
      spies.getState.mockResolvedValue({ status: 'pending' });

      await handleTelegramUpdate(update);
      expect(spies.acceptConsent).toHaveBeenCalled();
    });

    it('debe rechazar consentimiento vía callback', async () => {
      const update = {
        callback_query: {
          id: 'cb_123',
          message: { chat: { id: 123 }, message_id: 456 },
          data: 'consent:reject',
          from: { id: 789 }
        }
      };
      spies.getSubscriptionByChat.mockResolvedValue({ id: 1 });
      spies.getState.mockResolvedValue({ status: 'pending' });

      await handleTelegramUpdate(update);
      expect(spies.rejectConsent).toHaveBeenCalled();
    });

    it('debe registrar contacto telefónico enviado', async () => {
      const update = {
        message: {
          chat: { id: 123 },
          message_id: 456,
          contact: { phone_number: '+593999999999' },
          from: { id: 789 }
        }
      };
      spies.getSubscriptionByChat.mockResolvedValue({ id: 1 });
      spies.getState.mockResolvedValue({ status: 'accepted_pending_phone' });

      await handleTelegramUpdate(update);
      expect(spies.validateAndSaveContact).toHaveBeenCalled();
    });

    it('debe manejar /cancelar o confirm:cancel', async () => {
      const update = {
        message: {
          chat: { id: 123 },
          message_id: 456,
          text: '/cancelar',
          from: { id: 789 }
        }
      };
      spies.getSubscriptionByChat.mockResolvedValue({ id: 1 });
      spies.hasCurrentConsent.mockReturnValue(true);

      await handleTelegramUpdate(update);
      expect(spies.deleteState).toHaveBeenCalledWith('session:123');
      expect(spies.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('cancelada'));
    });

    it('debe manejar /pedido cuando el usuario no tiene reserva activa hoy', async () => {
      const update = {
        message: {
          chat: { id: 123 },
          message_id: 456,
          text: '/pedido',
          from: { id: 789 }
        }
      };
      spies.getSubscriptionByChat.mockResolvedValue({ id: 1, id_cliente: 456 });
      spies.hasCurrentConsent.mockReturnValue(true);
      spies.findActiveTodayOrder.mockResolvedValue(null);

      await handleTelegramUpdate(update);
      expect(spies.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('No tienes una reserva registrada'));
    });

    it('debe manejar /pedido', async () => {
      const update = {
        message: {
          chat: { id: 123 },
          message_id: 456,
          text: '/pedido',
          from: { id: 789 }
        }
      };
      spies.getSubscriptionByChat.mockResolvedValue({ id: 1, id_cliente: 456 });
      spies.hasCurrentConsent.mockReturnValue(true);
      spies.findActiveTodayOrder.mockResolvedValue({ id_orden: 'order_123' });
      spies.getOrderDetail.mockResolvedValue({ id_orden: 'order_123' });

      await handleTelegramUpdate(update);
      expect(spies.sendMessage).toHaveBeenCalledWith('123', expect.any(String), expect.any(Object), 'HTML');
    });

    it('debe manejar /menu cuando el usuario tiene consentimiento activo', async () => {
      const update = {
        message: {
          chat: { id: 123 },
          message_id: 456,
          text: '/menu',
          from: { id: 789 }
        }
      };
      spies.getSubscriptionByChat.mockResolvedValue({ id: 1, id_cliente: 456 });
      spies.hasCurrentConsent.mockReturnValue(true);
      spies.isBusinessDay.mockReturnValue(true);
      spies.getClientById.mockResolvedValue({ esta_activo: true });
      spies.findActiveTodayOrder.mockResolvedValue(null);

      await handleTelegramUpdate(update);
      expect(spies.promptMenu).toHaveBeenCalled();
    });

    it('debe rechazar /menu si no tiene consentimiento', async () => {
      const update = {
        message: {
          chat: { id: 123 },
          message_id: 456,
          text: '/menu',
          from: { id: 789 }
        }
      };
      spies.getSubscriptionByChat.mockResolvedValue({ id: 1, id_cliente: 456 });
      spies.hasCurrentConsent.mockReturnValue(false);

      await handleTelegramUpdate(update);
      expect(spies.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('Tu cuenta no está activa o no has aceptado'));
      expect(spies.promptMenu).not.toHaveBeenCalled();
    });

    it('debe procesar callback de pedido', async () => {
      const update = {
        callback_query: {
          id: 'cb_123',
          message: { chat: { id: 123 }, message_id: 456 },
          data: 'pedido:can:order_123',
          from: { id: 789 }
        }
      };
      spies.getSubscriptionByChat.mockResolvedValue({ id: 1 });
      spies.hasCurrentConsent.mockReturnValue(true);

      await handleTelegramUpdate(update);
      expect(spies.handlePedidoCallback).toHaveBeenCalled();
    });

    it('debe iniciar el trace e invocar handleAcceptedSession para pedidos comunes', async () => {
      const update = {
        callback_query: {
          id: 'cb_123',
          message: { chat: { id: 123 }, message_id: 456 },
          data: 'tipo:ejecutivo',
          from: { id: 789 }
        }
      };
      spies.getSubscriptionByChat.mockResolvedValue({ id: 1, id_cliente: 456 });
      spies.hasCurrentConsent.mockReturnValue(true);
      spies.createOrderTrace.mockResolvedValue('trace_123');

      await handleTelegramUpdate(update);
      expect(spies.createOrderTrace).toHaveBeenCalled();
      expect(spies.handleAcceptedSession).toHaveBeenCalledWith(expect.any(Object), 'trace_123');
    });

    it('debe manejar /menu cuando ya existe una reserva activa para hoy', async () => {
      const update = {
        message: {
          chat: { id: 123 },
          message_id: 456,
          text: '/menu',
          from: { id: 789 }
        }
      };
      spies.getSubscriptionByChat.mockResolvedValue({ id: 1, id_cliente: 456 });
      spies.hasCurrentConsent.mockReturnValue(true);
      spies.isBusinessDay.mockReturnValue(true);
      spies.getClientById.mockResolvedValue({ esta_activo: true });
      spies.findActiveTodayOrder.mockResolvedValue({ id_orden: 'order_123', id_estado: 1 });
      spies.getOrderDetail.mockResolvedValue({ id_orden: 'order_123' });

      await handleTelegramUpdate(update);
      expect(spies.deleteState).toHaveBeenCalledWith('session:123');
      expect(spies.sendMessage).toHaveBeenCalledWith('123', expect.any(String), expect.any(Object), 'HTML');
      expect(spies.promptMenu).not.toHaveBeenCalled();
    });

    it('debe rechazar /menu si no es día hábil', async () => {
      const update = {
        message: {
          chat: { id: 123 },
          message_id: 456,
          text: '/menu',
          from: { id: 789 }
        }
      };
      spies.getSubscriptionByChat.mockResolvedValue({ id: 1, id_cliente: 456 });
      spies.hasCurrentConsent.mockReturnValue(true);
      spies.isBusinessDay.mockReturnValue(false);

      await handleTelegramUpdate(update);
      expect(spies.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('lunes a viernes'));
      expect(spies.promptMenu).not.toHaveBeenCalled();
    });

    it('debe rechazar /menu si el cliente vinculado está inactivo', async () => {
      const update = {
        message: {
          chat: { id: 123 },
          message_id: 456,
          text: '/menu',
          from: { id: 789 }
        }
      };
      spies.getSubscriptionByChat.mockResolvedValue({ id: 1, id_cliente: 456 });
      spies.hasCurrentConsent.mockReturnValue(true);
      spies.isBusinessDay.mockReturnValue(true);
      spies.getClientById.mockResolvedValue({ esta_activo: false });

      await handleTelegramUpdate(update);
      expect(spies.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('no esta activo'));
      expect(spies.promptMenu).not.toHaveBeenCalled();
    });

    it('debe atrapar error en handleAcceptedSession, actualizar trace y lanzar error', async () => {
      const update = {
        callback_query: {
          id: 'cb_123',
          message: { chat: { id: 123 }, message_id: 456 },
          data: 'tipo:ejecutivo',
          from: { id: 789 }
        }
      };
      spies.getSubscriptionByChat.mockResolvedValue({ id: 1, id_cliente: 456 });
      spies.hasCurrentConsent.mockReturnValue(true);
      spies.createOrderTrace.mockResolvedValue('trace_123');
      
      const testError = new Error('Session processing failed');
      spies.handleAcceptedSession.mockRejectedValue(testError);

      await expect(handleTelegramUpdate(update)).rejects.toThrow('Session processing failed');
      
      expect(spies.updateOrderTrace).toHaveBeenCalledWith('trace_123', expect.objectContaining({
        id_cliente: 456,
        subscription_id: 1,
        outcome: 'failed',
        error_message: 'Session processing failed'
      }));
    });

    it('debe ignorar callback si activeProcessing ya tiene el chat (race condition)', async () => {
      const update = {
        callback_query: {
          id: 'cb_123',
          message: { chat: { id: 123 }, message_id: 456 },
          data: 'tipo:ejecutivo',
          from: { id: 789 }
        }
      };
      spies.getSubscriptionByChat.mockResolvedValue({ id: 1, id_cliente: 456 });
      spies.hasCurrentConsent.mockReturnValue(true);
      spies.createOrderTrace.mockResolvedValue('trace_123');
      
      // We block the handleAcceptedSession to keep it in activeProcessing
      let resolveSession;
      const sessionPromise = new Promise(resolve => resolveSession = resolve);
      spies.handleAcceptedSession.mockImplementation(() => sessionPromise);

      // First call starts processing and gets blocked
      const firstCallPromise = handleTelegramUpdate(update);
      
      // Second call happens while first call is in activeProcessing
      await handleTelegramUpdate(update);
      
      // Resolve the first call to clean up
      resolveSession();
      await firstCallPromise;
      
      // It should only have called createOrderTrace ONCE (from the first call)
      // Wait, createOrderTrace is called BEFORE activeProcessing check!
      // So createOrderTrace is called twice, but handleAcceptedSession is called ONCE.
      expect(spies.createOrderTrace).toHaveBeenCalledTimes(2);
      expect(spies.handleAcceptedSession).toHaveBeenCalledTimes(1);
    });
  });
});
