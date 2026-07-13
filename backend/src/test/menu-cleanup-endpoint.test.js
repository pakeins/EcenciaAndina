import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import request from 'supertest';

const require = createRequire(import.meta.url);

const injectModule = (relPath, exportsObj) => {
  const filename = require.resolve(relPath);
  require.cache[filename] = { id: filename, filename, loaded: true, exports: exportsObj, children: [], paths: [] };
};

let app;
const originalSecret = process.env.N8N_MENU_WEBHOOK_SECRET;

beforeAll(() => {
  process.env.N8N_MENU_WEBHOOK_SECRET = 'secret-test';

  // Mockear el servicio ANTES de requerir app para inyectarlo en CJS
  injectModule('../services/menuImageCleanup.js', {
    cleanupOldMenuImages: async () => ({
      retentionDays: 14,
      cutoffDate: '2026-07-01',
      scanned: 10,
      protected: 5,
      deleted: 2,
      referencesCleared: 1,
    })
  });

  app = require('../../index.js');
});

afterAll(() => {
  if (originalSecret === undefined) delete process.env.N8N_MENU_WEBHOOK_SECRET;
  else process.env.N8N_MENU_WEBHOOK_SECRET = originalSecret;
  
  try { delete require.cache[require.resolve('../services/menuImageCleanup.js')]; } catch { /* ignore */ }
  try { delete require.cache[require.resolve('../../index.js')]; } catch { /* ignore */ }
});

describe('endpoint interno de limpieza de menus', () => {
  it('falla de forma cerrada si el secreto no esta configurado', async () => {
    delete process.env.N8N_MENU_WEBHOOK_SECRET;
    const res = await request(app).post('/api/menu/system/limpiar-imagenes').send({});
    expect(res.status).toBe(503);
    process.env.N8N_MENU_WEBHOOK_SECRET = 'secret-test'; // restore para el resto
  });

  it('rechaza una llamada programada con secreto incorrecto', async () => {
    const res = await request(app)
      .post('/api/menu/system/limpiar-imagenes')
      .set('X-Ecencia-Webhook-Secret', 'otro-secret')
      .send({});
    expect(res.status).toBe(401);
  });

  it('permite limpiar las imágenes con secreto válido', async () => {
    const res = await request(app)
      .post('/api/menu/system/limpiar-imagenes')
      .set('X-Ecencia-Webhook-Secret', 'secret-test')
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.mensaje).toContain('Limpieza de imagenes ejecutada');
  });
});
