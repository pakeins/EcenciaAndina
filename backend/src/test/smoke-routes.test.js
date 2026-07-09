/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createRequire } from 'node:module';

let alimentosRouter;
let categoriasRouter;
let empleadosRouter;

const require = createRequire(import.meta.url);

let fakeClient;
const injectModule = (relPath, exportsObj) => {
  const filename = require.resolve(relPath);
  require.cache[filename] = { id: filename, filename, loaded: true, exports: exportsObj, children: [], paths: [] };
};

const makeClient = () => {
  class Q {
    constructor(table) {
      this.t = table;
    }
    select() { return this; }
    order() { return this; }
    maybeSingle() { return Promise.resolve({ data: null, error: null }); }
    single() { return Promise.resolve({ data: null, error: null }); }
    then(resolve, reject) {
      return Promise.resolve({ data: [], error: null }).then(resolve, reject);
    }
  }
  return {
    from: (t) => new Q(t),
  };
};

describe('Smoke tests for missing routes', () => {
  let app;

  beforeAll(async () => {
    fakeClient = makeClient();
    injectModule('../config/supabase.js', { getAdminClient: () => fakeClient });
    injectModule('../middlewares/authMiddleware.js', (req, res, next) => {
      req.user = { id: 'u1', rol: 'administrador' };
      next();
    });
    injectModule('../middlewares/roleMiddleware.js', () => (req, res, next) => next());

    vi.resetModules();
    alimentosRouter = (await import('../routes/alimentos.js')).default;
    categoriasRouter = (await import('../routes/categorias.js')).default;
    empleadosRouter = (await import('../routes/empleados.js')).default;

    app = express();
    app.use(express.json());
    app.use('/alimentos', alimentosRouter);
    app.use('/categorias', categoriasRouter);
    app.use('/empleados', empleadosRouter);
  });

  afterAll(() => {
    ['../config/supabase.js', '../middlewares/authMiddleware.js', '../middlewares/roleMiddleware.js'].forEach(p => {
      try { delete require.cache[require.resolve(p)]; } catch {}
    });
  });

  it('GET /alimentos/categorias responde 200', async () => {
    const res = await request(app).get('/alimentos/categorias');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /categorias responde 200', async () => {
    const res = await request(app).get('/categorias');
    expect(res.status).toBe(200);
  });

  it('GET /empleados responde 200', async () => {
    const res = await request(app).get('/empleados');
    expect(res.status).toBe(200);
  });
});
