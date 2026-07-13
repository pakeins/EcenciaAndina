import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// ─── injectModule ────────────────────────────────────────────────────────────
const injectModule = (relPath, exportsObj) => {
  const filename = require.resolve(relPath);
  require.cache[filename] = {
    id: filename,
    filename,
    loaded: true,
    exports: exportsObj,
    children: [],
    paths: [],
  };
};

// ─── Mocks de dependencias CJS ───────────────────────────────────────────────
const fakeCleanupResult = {
  retentionDays: 14,
  cutoffDate: '2026-07-01',
  scanned: 10,
  protected: 5,
  deleted: 2,
  referencesCleared: 1,
};

injectModule('../config/supabase.js', {
  getAdminClient: () => ({ from: () => ({ select: () => ({ data: [], error: null }) }) }),
});

injectModule('../services/menuImageCleanup.js', {
  cleanupOldMenuImages: async () => fakeCleanupResult,
});

injectModule('../middlewares/authMiddleware.js', (req, _res, next) => {
  req.user = { id: 'u1', email: 'admin@example.com', rol: 'administrador' };
  next();
});

injectModule('../middlewares/roleMiddleware.js', () => (_req, _res, next) => next());

// ─── Cargar router DESPUÉS de los mocks ──────────────────────────────────────
const menuRouter = require('../routes/menu.js');

// ─── App mínima ──────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use('/api/menu', menuRouter);

// ─── Setup de env ────────────────────────────────────────────────────────────
const originalSecret = process.env.N8N_MENU_WEBHOOK_SECRET;

beforeAll(() => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  process.env.N8N_MENU_WEBHOOK_SECRET = 'secret-test';
});

afterAll(() => {
  if (originalSecret === undefined) delete process.env.N8N_MENU_WEBHOOK_SECRET;
  else process.env.N8N_MENU_WEBHOOK_SECRET = originalSecret;
});

// ─── Tests ───────────────────────────────────────────────────────────────────
describe('endpoint interno de limpieza de menus', () => {
  it('falla de forma cerrada si el secreto no esta configurado', async () => {
    delete process.env.N8N_MENU_WEBHOOK_SECRET;
    const res = await request(app).post('/api/menu/system/limpiar-imagenes').send({});
    expect(res.status).toBe(503);
    process.env.N8N_MENU_WEBHOOK_SECRET = 'secret-test';
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
