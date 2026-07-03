import { afterEach, describe, expect, it } from 'vitest';
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

    const response = await request(app).post('/api/menu/system/limpiar-imagenes').send({});

    expect(response.status).toBe(503);
    expect(response.body.error).toBe('El endpoint interno no esta configurado.');
  });

  it('rechaza una llamada programada con secreto incorrecto', async () => {
    process.env.N8N_MENU_WEBHOOK_SECRET = 'secret-test';

    const response = await request(app)
      .post('/api/menu/system/limpiar-imagenes')
      .set('X-Eciencia-Webhook-Secret', 'otro-secret')
      .send({});

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Endpoint interno no autorizado.');
  });

  it('protege la expiracion de menu activo con el mismo secreto interno', async () => {
    process.env.N8N_MENU_WEBHOOK_SECRET = 'secret-test';

    const response = await request(app)
      .post('/api/menu/system/expirar-activo')
      .set('X-Eciencia-Webhook-Secret', 'otro-secret')
      .send({});

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Endpoint interno no autorizado.');
  });

  it('protege el cierre automatico de reservas antes de tocar datos', async () => {
    delete process.env.N8N_MENU_WEBHOOK_SECRET;

    const missingSecretResponse = await request(app).post('/api/ordenes/system/cerrar-reservas').send({});
    expect(missingSecretResponse.status).toBe(503);
    expect(missingSecretResponse.body.error).toBe('El endpoint interno no esta configurado.');

    process.env.N8N_MENU_WEBHOOK_SECRET = 'secret-test';

    const wrongSecretResponse = await request(app)
      .post('/api/ordenes/system/cerrar-reservas')
      .set('X-Eciencia-Webhook-Secret', 'otro-secret')
      .send({});

    expect(wrongSecretResponse.status).toBe(401);
    expect(wrongSecretResponse.body.error).toBe('Endpoint interno no autorizado.');
  });
});
