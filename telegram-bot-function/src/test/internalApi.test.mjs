import { describe, it, expect, vi, beforeEach } from 'vitest';

const registeredHandlers = {};

// Override require.cache for @azure/functions to intercept app.http calls
const azureMock = {
  app: {
    http: (name, options) => {
      registeredHandlers[name] = options.handler;
    }
  }
};

require.cache[require.resolve('@azure/functions')] = {
  id: require.resolve('@azure/functions'),
  filename: require.resolve('@azure/functions'),
  loaded: true,
  exports: azureMock
};

const telegramApi = require('../services/telegramApi');
const telegramConsent = require('../services/telegramConsent');

vi.spyOn(telegramApi, 'sendMessage').mockResolvedValue('sent_ok');
vi.spyOn(telegramConsent, 'createInvitation').mockResolvedValue({ onboardingUrl: 'url123' });
vi.spyOn(telegramConsent, 'recordConsentEvent').mockResolvedValue();
vi.spyOn(telegramConsent, 'getConsentVersion').mockReturnValue('v1.0');
vi.spyOn(telegramConsent, 'privacyText').mockReturnValue('privacy text content');

// Load the routes to register handlers (which will now use our cache-mocked @azure/functions)
require('../functions/internalApi');

const makeMockRequest = (secret, body = {}) => {
  return {
    headers: {
      get: (headerName) => {
        if (headerName === 'x-internal-secret') return secret;
        return null;
      }
    },
    json: async () => body
  };
};

const makeMockContext = () => ({
  error: vi.fn(),
  log: vi.fn()
});

describe('internalApi Azure Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_API_SECRET = 'my-secret';
  });

  describe('Authorization check', () => {
    it('debe retornar 401 si no está autorizado', async () => {
      const handler = registeredHandlers['internalSendMessage'];
      const req = makeMockRequest('wrong-secret');
      const res = await handler(req, makeMockContext());
      expect(res.status).toBe(401);
      expect(res.body).toBe('Unauthorized');
    });
  });

  describe('internalSendMessage', () => {
    it('debe enviar mensaje exitosamente', async () => {
      const handler = registeredHandlers['internalSendMessage'];
      const req = makeMockRequest('my-secret', {
        chatId: '123',
        message: 'hello',
        options: { reply_markup: {} },
        parseMode: 'HTML'
      });
      const res = await handler(req, makeMockContext());
      expect(res.status).toBe(200);
      expect(res.jsonBody).toEqual({ success: true, result: 'sent_ok' });
      expect(telegramApi.sendMessage).toHaveBeenCalledWith('123', 'hello', { reply_markup: {} }, 'HTML');
    });

    it('debe manejar errores y retornar 500', async () => {
      telegramApi.sendMessage.mockRejectedValue(new Error('Send failed'));
      const handler = registeredHandlers['internalSendMessage'];
      const req = makeMockRequest('my-secret', { chatId: '123' });
      const ctx = makeMockContext();
      
      const res = await handler(req, ctx);
      expect(res.status).toBe(500);
      expect(res.jsonBody.error).toBe('Send failed');
      expect(ctx.error).toHaveBeenCalled();
    });
  });

  describe('internalCreateInvitation', () => {
    it('debe crear invitación', async () => {
      const handler = registeredHandlers['internalCreateInvitation'];
      const req = makeMockRequest('my-secret', { idCliente: 456, adminId: 'admin_1' });
      const res = await handler(req, makeMockContext());
      expect(res.status).toBe(200);
      expect(res.jsonBody).toEqual({ onboardingUrl: 'url123' });
      expect(telegramConsent.createInvitation).toHaveBeenCalledWith(456, 'admin_1');
    });

    it('debe retornar 500 en caso de error', async () => {
      telegramConsent.createInvitation.mockRejectedValue(new Error('Creation failed'));
      const handler = registeredHandlers['internalCreateInvitation'];
      const req = makeMockRequest('my-secret', { idCliente: 456 });
      const ctx = makeMockContext();

      const res = await handler(req, ctx);
      expect(res.status).toBe(500);
      expect(res.jsonBody.error).toBe('Creation failed');
      expect(ctx.error).toHaveBeenCalled();
    });
  });

  describe('internalRecordConsentEvent', () => {
    it('debe registrar evento de consentimiento', async () => {
      const handler = registeredHandlers['internalRecordConsentEvent'];
      const req = makeMockRequest('my-secret', { eventType: 'test_event' });
      const res = await handler(req, makeMockContext());
      expect(res.status).toBe(200);
      expect(res.jsonBody).toEqual({ success: true });
      expect(telegramConsent.recordConsentEvent).toHaveBeenCalledWith({ eventType: 'test_event' });
    });

    it('debe retornar 500 en caso de error', async () => {
      telegramConsent.recordConsentEvent.mockRejectedValue(new Error('Save failed'));
      const handler = registeredHandlers['internalRecordConsentEvent'];
      const req = makeMockRequest('my-secret', {});
      const ctx = makeMockContext();

      const res = await handler(req, ctx);
      expect(res.status).toBe(500);
      expect(res.jsonBody.error).toBe('Save failed');
      expect(ctx.error).toHaveBeenCalled();
    });
  });

  describe('internalGetConstants', () => {
    it('debe retornar constantes', async () => {
      const handler = registeredHandlers['internalGetConstants'];
      const req = makeMockRequest('my-secret');
      const res = await handler(req, makeMockContext());
      expect(res.status).toBe(200);
      expect(res.jsonBody).toEqual({
        consentVersion: 'v1.0',
        privacyText: 'privacy text content'
      });
    });
  });
});
