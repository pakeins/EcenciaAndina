import request from 'supertest';
import express from 'express';
import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest';
import supabaseConfig from '../config/supabase';

vi.mock('../validation/ecencia', () => ({
  parseBody: vi.fn((schema, body) => body),
  schemas: {
    categoriaProducto: {}
  },
  sendValidationError: vi.fn((res, error) => { if (error.isValidationError) { res.status(400).json({ error: 'Validation Error' }); return true; } return false; })
}));

import categoriasRouter from '../routes/categorias.js';
let forceDbError = false;
let fetchSpy;



const app = express();
app.use(express.json());
app.use('/categorias', (req, res, next) => categoriasRouter(req, res, next));

describe('Categorias Routes', () => {
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

      if (urlStr.includes('/rest/v1/categorias_productos')) {
        if (method === 'GET') {
          return new Response(JSON.stringify([{ id_categoria: 1, nombre_categoria: 'Postres' }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (method === 'POST') {
          return new Response(JSON.stringify({ id_categoria: 2, nombre_categoria: 'Bebidas' }), { status: 201, headers: { 'Content-Type': 'application/json' } });
        }
        if (method === 'PATCH') {
          return new Response(JSON.stringify({ id_categoria: 1, nombre_categoria: 'Snacks' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /categorias', () => {
    it('debe retornar todas las categorias', async () => {
      const response = await request(app).get('/categorias').set('Authorization', 'Bearer token');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].nombre_categoria).toBe('Postres');
    });

    it('debe retornar error 500 si la bd falla', async () => {
      forceDbError = true;

      const response = await request(app).get('/categorias').set('Authorization', 'Bearer token');

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('DB Error');
    });
  });

  describe('POST /categorias', () => {
    it('debe crear categoria exitosamente', async () => {
      const response = await request(app)
        .post('/categorias')
        .set('Authorization', 'Bearer token')
        .send({ nombre_categoria: 'Bebidas' });

      expect(response.status).toBe(201);
      expect(response.body.nombre_categoria).toBe('Bebidas');
    });

    it('debe retornar error 500 en fallo db', async () => {
      forceDbError = true;

      const response = await request(app)
        .post('/categorias')
        .set('Authorization', 'Bearer token')
        .send({ nombre_categoria: 'Bebidas' });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('DB Error');
    });

    it('debe retornar error 400 de validacion', async () => {
      const { parseBody } = await import('../validation/ecencia');
      parseBody.mockImplementationOnce(() => {
        const err = new Error('Invalid');
        err.isValidationError = true;
        throw err;
      });

      const response = await request(app)
        .post('/categorias')
        .set('Authorization', 'Bearer token')
        .send({ nombre_categoria: '' });

      console.log(response.body); expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/Invalid input/);
    });
  });

  describe('PUT /categorias/:id', () => {
    it('debe actualizar categoria', async () => {
      const response = await request(app)
        .put('/categorias/1')
        .set('Authorization', 'Bearer token')
        .send({ nombre_categoria: 'Snacks' });

      expect(response.status).toBe(200);
      expect(response.body.nombre_categoria).toBe('Snacks');
    });

    it('debe retornar error 500 en fallo db', async () => {
      forceDbError = true;

      const response = await request(app)
        .put('/categorias/1')
        .set('Authorization', 'Bearer token')
        .send({ nombre_categoria: 'Snacks' });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('DB Error');
    });

    it('debe retornar error 400 de validacion al actualizar', async () => {
      const { parseBody } = await import('../validation/ecencia');
      parseBody.mockImplementationOnce(() => {
        const err = new Error('Invalid');
        err.isValidationError = true;
        throw err;
      });

      const response = await request(app)
        .put('/categorias/1')
        .set('Authorization', 'Bearer token')
        .send({ nombre_categoria: '' });

      console.log(response.body); expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/Invalid input/);
    });
  });
});
