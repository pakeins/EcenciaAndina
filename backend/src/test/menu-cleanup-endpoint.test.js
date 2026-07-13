import { afterEach, describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import app from '../../index.js';

vi.mock('../services/menuImageCleanup', () => ({
  cleanupOldMenuImages: vi.fn().mockResolvedValue({
    retentionDays: 14,
    cutoffDate: '2026-07-01',
    scanned: 10,
    protected: 5,
    deleted: 2,
    referencesCleared: 1,
  })
}));

const originalSecret = process.env.N8N_MENU_WEBHOOK_SECRET;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.N8N_MENU_WEBHOOK_SECRET;
  else process.env.N8N_MENU_WEBHOOK_SECRET = originalSecret;
});

describe('endpoint interno de limpieza de menus', () => {
  it('falla de forma cerrada si el secreto no esta configurado', async () => {
    delete process.env.N8N_MENU_WEBHOOK_SECRET;

    const res = await request(app).post('/api/menu/system/limpiar-imagenes').send({});
    expect(res.status).toBe(503);
  });

  it('rechaza una llamada programada con secreto incorrecto', async () => {
    process.env.N8N_MENU_WEBHOOK_SECRET = 'secret-test';

    const res = await request(app)
      .post('/api/menu/system/limpiar-imagenes')
      .set('X-Ecencia-Webhook-Secret', 'otro-secret')
      .send({});
    expect(res.status).toBe(401);
  });

  it('permite limpiar las imágenes con secreto válido', async () => {
    process.env.N8N_MENU_WEBHOOK_SECRET = 'secret-test';

    const res = await request(app)
      .post('/api/menu/system/limpiar-imagenes')
      .set('X-Ecencia-Webhook-Secret', 'secret-test')
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.mensaje).toContain('Limpieza de imagenes ejecutada');
  });
});
