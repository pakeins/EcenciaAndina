import { afterEach, describe, it } from 'vitest';
import request from 'supertest';
import app from '../../index.js';

const originalSecret = process.env.N8N_MENU_WEBHOOK_SECRET;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.N8N_MENU_WEBHOOK_SECRET;
  else process.env.N8N_MENU_WEBHOOK_SECRET = originalSecret;
});

describe('endpoint interno de limpieza de menus', () => {
  it('falla de forma cerrada si el secreto no esta configurado', async () => {
    delete process.env.N8N_MENU_WEBHOOK_SECRET;

    await request(app).post('/api/menu/system/limpiar-imagenes').send({}).expect(503);
  });

  it('rechaza una llamada programada con secreto incorrecto', async () => {
    process.env.N8N_MENU_WEBHOOK_SECRET = 'secret-test';

    await request(app)
      .post('/api/menu/system/limpiar-imagenes')
      .set('X-Eciencia-Webhook-Secret', 'otro-secret')
      .send({})
      .expect(401);
  });
});
