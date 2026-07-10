import request from 'supertest';
import express from 'express';
import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest';
import supabaseConfig from '../config/supabase';

// Mock validacion
vi.mock('../validation/eciencia', () => ({
  parseBody: vi.fn((schema, body) => body),
  schemas: {
    alimento: {},
    categoriaMenu: {}
  },
  sendValidationError: vi.fn(() => false)
}));

let alimentosRouter;
let forceDbError = false;
let fetchSpy;

beforeAll(async () => {
  const resolvedPath = require.resolve('../routes/alimentos.js');
  delete require.cache[resolvedPath];
  alimentosRouter = (await import('../routes/alimentos.js')).default;
});

const app = express();
app.use(express.json());
app.use('/alimentos', (req, res, next) => alimentosRouter(req, res, next));

describe('Alimentos Routes', () => {
  beforeEach(() => {
    forceDbError = false;

    fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url, options) => {
      const urlStr = url.toString();
      const method = options?.method || 'GET';

      if (urlStr.includes('/auth/v1/user')) {
        return new Response(JSON.stringify({ id: 'admin1', email: 'admin@test.com' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (urlStr.includes('/rest/v1/empleados')) {
        return new Response(JSON.stringify([{ id: 'admin1', esta_activo: true, roles: { nombre_rol: 'administrador' } }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (forceDbError) {
        return new Response(JSON.stringify({ message: 'DB Error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }

      if (urlStr.includes('/rest/v1/categorias_menu')) {
        if (method === 'GET') {
          return new Response(JSON.stringify([{ id_categoria_menu: 1, nombre_categoria: 'Sopa' }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (method === 'POST') {
          return new Response(JSON.stringify({ id_categoria_menu: 2, nombre_categoria: 'Segundo' }), { status: 201, headers: { 'Content-Type': 'application/json' } });
        }
        if (method === 'DELETE') {
          return new Response(JSON.stringify([{}]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
      }

      if (urlStr.includes('/rest/v1/alimentos')) {
        if (method === 'GET' || method === 'HEAD') {
          if (urlStr.includes('id_categoria_menu=eq.1')) {
            return new Response(JSON.stringify([]), {
              status: 200,
              headers: {
                'Content-Range': '0-0/1',
                'Content-Type': 'application/json'
              }
            });
          }
          if (urlStr.includes('id_categoria_menu=eq.2')) {
            return new Response(JSON.stringify([]), {
              status: 200,
              headers: {
                'Content-Range': '0-0/0',
                'Content-Type': 'application/json'
              }
            });
          }
          return new Response(JSON.stringify([{ id_alimento: 1, nombre_alimento: 'Pollo', id_categoria_menu: 1 }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /alimentos/categorias', () => {
    it('debe retornar lista de categorias', async () => {
      const response = await request(app).get('/alimentos/categorias').set('Authorization', 'Bearer token');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].nombre_categoria).toBe('Sopa');
    });
  });

  describe('POST /alimentos/categorias', () => {
    it('debe crear una nueva categoria', async () => {
      const response = await request(app)
        .post('/alimentos/categorias')
        .set('Authorization', 'Bearer token')
        .send({ nombre_categoria: 'Segundo' });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id_categoria_menu', 2);
    });
  });

  describe('DELETE /alimentos/categorias/:id', () => {
    it('debe eliminar una categoria si no tiene alimentos asociados', async () => {
      // id 2 returns count 0 (see mock logic Content-Range: 0-0/0)
      const response = await request(app).delete('/alimentos/categorias/2').set('Authorization', 'Bearer token');

      expect(response.status).toBe(200);
      expect(response.body.mensaje).toBe('Categoria eliminada correctamente.');
    });

    it('debe retornar 409 si la categoria tiene alimentos asociados', async () => {
      // id 1 returns count 1 (see mock logic Content-Range: 0-0/1)
      const response = await request(app).delete('/alimentos/categorias/1').set('Authorization', 'Bearer token');

      expect(response.status).toBe(409);
      expect(response.body.error).toMatch(/No se puede eliminar la categoria porque tiene alimentos asociados/);
    });
  });

  describe('GET /alimentos', () => {
    it('debe retornar todos los alimentos', async () => {
      const response = await request(app).get('/alimentos').set('Authorization', 'Bearer token');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].nombre).toBe('Pollo');
    });
  });
});
