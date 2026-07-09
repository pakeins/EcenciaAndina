process.env.SUPABASE_URL='http://localhost'; process.env.SUPABASE_SERVICE_ROLE_KEY='test'; process.env.SUPABASE_ANON_KEY='test';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const request = require('supertest');
const express = require('express');

const injectModule = (relPath, exportsObj) => {
  const filename = require.resolve(relPath);
  require.cache[filename] = { id: filename, filename, loaded: true, exports: exportsObj, children: [], paths: [] };
};

let mockSupabase;
let fakeClient;
let mockTelegramApi;
let mockTelegramConsent;

beforeAll(() => {
  mockSupabase = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: {
        id: 'sub123',
        id_cliente: 'cli123',
        chat_id: '111',
        consent_status: 'accepted',
        phone_normalized: '0999999999',
      }
    }),
    single: vi.fn().mockResolvedValue({ data: {} }),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
  };

  fakeClient = mockSupabase;

  mockTelegramApi = {
    answerCallback: vi.fn().mockResolvedValue(true),
    deleteMessage: vi.fn().mockResolvedValue(true),
    removeInlineKeyboard: vi.fn().mockResolvedValue(true),
    sendMessage: vi.fn().mockResolvedValue({ message_id: 123 }),
    sendPhoto: vi.fn().mockResolvedValue({ message_id: 124 }),
    telegramRequest: vi.fn().mockResolvedValue(true),
  };

  mockTelegramConsent = {
    claimInvitation: vi.fn().mockResolvedValue(true),
    consumeInvitation: vi.fn().mockResolvedValue(true),
    getConsentVersion: vi.fn().mockReturnValue('1.0'),
    getInvitationByToken: vi.fn().mockResolvedValue({ id: 1 }),
    getPrivacySettings: vi.fn().mockResolvedValue({ version: '1.0' }),
    hasCurrentConsent: vi.fn().mockResolvedValue(true),
    privacyText: 'Texto de privacidad',
    recordConsentEvent: vi.fn().mockResolvedValue(true),
  };

  injectModule('../config/supabase.js', { getAdminClient: () => fakeClient });
  injectModule('../services/telegramApi.js', mockTelegramApi);
  injectModule('../services/telegramConsent.js', mockTelegramConsent);
  injectModule('../services/telegramOrderTrace.js', {
    createOrderTrace: async () => 'trace-123',
    updateOrderTrace: async () => true,
  });

  delete require.cache[require.resolve('../routes/telegram.js')];
});

describe('Telegram Webhook & API', () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock behavior
    mockTelegramConsent.hasCurrentConsent.mockResolvedValue(true);
    mockTelegramConsent.getPrivacySettings.mockResolvedValue({ version: '1.0' });

    // For /start case where client is queried
    mockSupabase.maybeSingle.mockResolvedValue({
      data: {
        id: 'sub123',
        id_cliente: 'cli123',
        chat_id: '111',
        consent_status: 'accepted',
        phone_normalized: '0999999999',
      }
    });

    const telegramRouter = require('../routes/telegram.js');
    app = PatternApp || express();
    function PatternApp() {
      const a = express();
      a.use(express.json());
      a.use((req, res, next) => {
        req.headers['x-telegram-bot-api-secret-token'] = process.env.TELEGRAM_WEBHOOK_SECRET || 'secret';
        next();
      });
      a.use('/', telegramRouter);
      return a;
    }
    app = PatternApp();
  });

  it('debe responder 200/204 en /webhook (caso vacío)', async () => {
    const res = await request(app).post('/webhook').send({});
    expect([200, 204]).toContain(res.status);
  });

  it('debe procesar un mensaje de texto normal (start)', async () => {
    mockTelegramConsent.hasCurrentConsent.mockResolvedValue(false);
    const payload = { update_id: 1, message: { message_id: 1, from: { id: 111, username: 'testuser' }, chat: { id: 111 }, text: '/start' } };
    const res = await request(app).post('/webhook').send(payload);
    expect([200, 204]).toContain(res.status);
  });

  it('debe procesar una interacción con botones (callback_query)', async () => {
    mockTelegramConsent.hasCurrentConsent.mockResolvedValue(true);
    const payload = { update_id: 2, callback_query: { id: 'cb1', from: { id: 111, username: 'testuser' }, message: { message_id: 2, chat: { id: 111 } }, data: 'confirm:yes' } };
    const res = await request(app).post('/webhook').send(payload);
    expect([200, 204]).toContain(res.status);
  });
});
