import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import express from 'express';
import request from 'supertest';

const require = createRequire(import.meta.url);

let fakeClient;
let app;

// Cliente Supabase falso: controla si la categoria existe.
const makeClient = ({ category }) => ({
  from(table) {
    if (table === 'categorias_menu') {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: category, error: null }),
      };
      return q;
    }
    // alimentos
    let inserting = false;
    let rows = null;
    const q = {
      select: () => q,
      eq: () => q,
      insert: (inserted) => { inserting = true; rows = inserted; return q; },
      single: async () => {
        if (inserting) {
          const row = rows[0];
          return {
            data: {
              id_alimento: 99,
              nombre_alimento: row.nombre_alimento,
              id_categoria_menu: row.id_categoria_menu,
              categorias_menu: { nombre_categoria: category?.nombre_categoria || 'Bebidas' },
            },
            error: null,
          };
        }
        return { data: null, error: { message: 'No rows' } };
      },
    };
    return q;
  },
});

const injectModule = (relPath, exportsObj) => {
  const filename = require.resolve(relPath);
  require.cache[filename] = { id: filename, filename, loaded: true, exports: exportsObj, children: [], paths: [] };
};

beforeAll(() => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

  injectModule('../config/supabase.js', {
    getAdminClient: () => fakeClient,
    supabase: {
      auth: { getUser: async () => ({ data: { user: { id: 'admin-1', email: 'admin@example.com' } }, error: null }) },
    },
  });
  injectModule('../services/authUser.js', {
    findEmpleadoForAuthUser: async () => ({ id_empleado: 'e1', esta_activo: true }),
    publicUserFromEmpleado: () => ({ id: 'admin-1', nombre: 'Admin' }),
    roleFromEmpleado: () => 'administrador',
  });

  ['../middlewares/authMiddleware.js', '../routes/alimentos.js'].forEach((relPath) => {
    try { delete require.cache[require.resolve(relPath)]; } catch { /* noop */ }
  });

  const alimentosRouter = require('../routes/alimentos.js');
  app = express();
  app.use(express.json());
  app.use('/api/alimentos', alimentosRouter);
});

afterAll(() => {
  ['../config/supabase.js', '../services/authUser.js', '../middlewares/authMiddleware.js', '../routes/alimentos.js']
    .forEach((relPath) => { try { delete require.cache[require.resolve(relPath)]; } catch { /* noop */ } });
});

const auth = (req) => req.set('Authorization', 'Bearer test-token');

describe('POST /api/alimentos', () => {
  beforeEach(() => {
    fakeClient = makeClient({ category: { id_categoria_menu: 5, nombre_categoria: 'Bebidas' } });
  });

  it('crea un alimento cuando la categoria existe', async () => {
    const response = await auth(
      request(app).post('/api/alimentos').send({ id_categoria: 5, nombre: 'Jugo de Mora' }),
    );

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ id: 99, nombre: 'Jugo de Mora', id_categoria: 5 });
  });

  it('rechaza con 400 y mensaje claro cuando la categoria no existe', async () => {
    fakeClient = makeClient({ category: null });

    const response = await auth(
      request(app).post('/api/alimentos').send({ id_categoria: 123, nombre: 'Jugo de Mora' }),
    );

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/categoria de menu no existe/i);
  });

  it('rechaza con 400 de validacion cuando la categoria no es positiva', async () => {
    const response = await auth(
      request(app).post('/api/alimentos').send({ id_categoria: 0, nombre: 'Jugo de Mora' }),
    );

    expect(response.status).toBe(400);
  });
});
