import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../../index.js';

const originalSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.TELEGRAM_WEBHOOK_SECRET;
  else process.env.TELEGRAM_WEBHOOK_SECRET = originalSecret;
});

describe('Telegram webhook', () => {
  it('rechaza requests sin secret token correcto', async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = 'secret-test';

    const sinToken = await request(app)
      .post('/api/telegram/webhook')
      .send({ update_id: 1 });
    expect(sinToken.status).toBe(401);

    const tokenIncorrecto = await request(app)
      .post('/api/telegram/webhook')
      .set('X-Telegram-Bot-Api-Secret-Token', 'otro')
      .send({ update_id: 1 });
    expect(tokenIncorrecto.status).toBe(401);
  });
});
