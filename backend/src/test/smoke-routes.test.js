import { describe, it, expect, vi, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';

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

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const injectModule = (relPath, exportsObj) => {
  const filename = require.resolve(relPath);
  require.cache[filename] = {
    id: filename,
    filename,
    loaded: true,
    exports: exportsObj,
    children: [],
    paths: []
  };
};

const mocks = {
  fakeClient: makeClient()
};

injectModule('../config/supabase.js', {
  supabase: mocks.fakeClient,
  getAdminClient: () => mocks.fakeClient
});

injectModule('../middlewares/authMiddleware.js', (req, res, next) => {
  req.user = { id: 'u1', rol: 'administrador' };
  next();
});

injectModule('../middlewares/roleMiddleware.js', () => {
  return (req, res, next) => next();
});

const alimentosRouter = require('../routes/alimentos.js');
const categoriasRouter = require('../routes/categorias.js');
const empleadosRouter = require('../routes/empleados.js');

describe('Smoke tests for missing routes', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/alimentos', alimentosRouter);
    app.use('/categorias', categoriasRouter);
    app.use('/empleados', empleadosRouter);
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
