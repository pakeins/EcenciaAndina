process.env.SUPABASE_URL='http://localhost'; process.env.SUPABASE_SERVICE_ROLE_KEY='test'; process.env.SUPABASE_ANON_KEY='test';
import { describe, it, expect, vi, beforeEach } from 'vitest';
const request = require('supertest');
const express = require('express');

vi.mock('../config/supabase');
vi.mock('../services/telegramApi');
vi.mock('../services/telegramConsent');

const telegramRouter = require('../routes/telegram');
const telegramApi = require('../services/telegramApi');
const telegramConsent = require('../services/telegramConsent');
const supabase = require('../config/supabase');

describe('Telegram Webhook & API', () => {
  let app;
  let mockSupabase;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
      single: vi.fn().mockResolvedValue({ data: {} }),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
    };

    supabase.getAdminClient.mockReturnValue(mockSupabase);

    telegramApi.sendMessage.mockResolvedValue({ message_id: 123 });
    telegramApi.sendPhoto.mockResolvedValue({ message_id: 124 });
    telegramApi.deleteMessage.mockResolvedValue(true);
    telegramApi.answerCallback.mockResolvedValue(true);

    telegramConsent.getConsentVersion.mockReturnValue('1.0');
    telegramConsent.hasCurrentConsent.mockResolvedValue(true);
    telegramConsent.getPrivacySettings.mockResolvedValue({ version: '1.0' });
    telegramConsent.claimInvitation.mockResolvedValue(true);
    telegramConsent.consumeInvitation.mockResolvedValue(true);
    telegramConsent.getInvitationByToken.mockResolvedValue({ id: 1 });
    telegramConsent.recordConsentEvent.mockResolvedValue(true);

    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.headers['x-telegram-bot-api-secret-token'] = process.env.TELEGRAM_WEBHOOK_SECRET || 'secret';
      next();
    });
    app.use('/', telegramRouter);
  });

  it('debe responder 200/204 en /webhook (caso vacío)', async () => {
    const res = await request(app).post('/webhook').send({});
    expect([200, 204]).toContain(res.status);
  });

  it('debe procesar un mensaje de texto normal (start)', async () => {
    telegramConsent.hasCurrentConsent.mockResolvedValue(false);
    const payload = { update_id: 1, message: { message_id: 1, from: { id: 111, username: 'testuser' }, chat: { id: 111 }, text: '/start' } };
    const res = await request(app).post('/webhook').send(payload);
    expect([200, 204]).toContain(res.status);
  });

  it('debe procesar una interacción con botones (callback_query)', async () => {
    telegramConsent.hasCurrentConsent.mockResolvedValue(true);
    const payload = { update_id: 2, callback_query: { id: 'cb1', from: { id: 111, username: 'testuser' }, message: { message_id: 2, chat: { id: 111 } }, data: 'confirm:yes' } };
    const res = await request(app).post('/webhook').send(payload);
    expect([200, 204]).toContain(res.status);
  });
});
