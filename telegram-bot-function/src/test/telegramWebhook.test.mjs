import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

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

const telegramRoutes = require('../functions/telegramRoutes');

vi.spyOn(telegramRoutes, 'handleTelegramUpdate').mockImplementation(() => Promise.resolve());

// Load the webhook script to register handler
beforeAll(async () => {
  await import('../functions/telegramWebhook.js');
});

const makeMockRequest = (secretHeader, body = {}) => {
  return {
    headers: {
      get: (headerName) => {
        if (headerName === 'x-telegram-bot-api-secret-token') return secretHeader;
        return null;
      }
    },
    json: async () => body
  };
};

const makeMockContext = () => ({
  warn: vi.fn(),
  error: vi.fn(),
  log: vi.fn()
});

describe('telegramWebhook Azure Function', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TELEGRAM_WEBHOOK_SECRET = 'my-telegram-secret';
  });

  it('debe retornar 401 si no está autorizado', async () => {
    const handler = registeredHandlers['telegramWebhook'];
    const req = makeMockRequest('wrong-secret');
    const ctx = makeMockContext();
    
    const res = await handler(req, ctx);
    expect(res.status).toBe(401);
    expect(res.body).toBe('Unauthorized');
    expect(ctx.warn).toHaveBeenCalledWith('Telegram webhook no autorizado.');
  });

  it('debe procesar el webhook correctamente con 200 OK', async () => {
    const handler = registeredHandlers['telegramWebhook'];
    const req = makeMockRequest('my-telegram-secret', { update_id: 12345, message: { text: 'hi' } });
    const ctx = makeMockContext();

    const res = await handler(req, ctx);
    expect(res.status).toBe(200);
    expect(res.body).toBe('OK');
    expect(telegramRoutes.handleTelegramUpdate).toHaveBeenCalledWith({ update_id: 12345, message: { text: 'hi' } });
  });

  it('debe retornar 500 en caso de error de procesamiento', async () => {
    telegramRoutes.handleTelegramUpdate.mockRejectedValue(new Error('Process failed'));
    const handler = registeredHandlers['telegramWebhook'];
    const req = makeMockRequest('my-telegram-secret', { update_id: 12345 });
    const ctx = makeMockContext();

    const res = await handler(req, ctx);
    expect(res.status).toBe(500);
    expect(res.body).toBe('Process failed');
    expect(ctx.error).toHaveBeenCalled();
  });
});
