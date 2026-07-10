import request from 'supertest';
import express from 'express';
import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest';
import supabaseConfig from '../config/supabase';

let empleadosRouter;
let forceDbError = false;
let fetchSpy;

beforeAll(async () => {
  const resolvedPath = require.resolve('../routes/empleados.js');
  delete require.cache[resolvedPath];
  empleadosRouter = (await import('../routes/empleados.js')).default;
});

const app = express();
app.use(express.json());
app.use('/empleados', (req, res, next) => empleadosRouter(req, res, next));

describe('Empleados Routes', () => {
  beforeEach(() => {
    forceDbError = false;

    fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url, options) => {
      const urlStr = url.toString();
      const method = options?.method || 'GET';

      if (urlStr.includes('/auth/v1/user')) {
        return new Response(JSON.stringify({ id: 'admin1', email: 'admin@test.com' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (urlStr.includes('/rest/v1/empleados')) {
        if (forceDbError) {
          return new Response(JSON.stringify({ message: 'DB Error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }
        
        // Match resolveEmpleado query
        if (urlStr.includes('select=id%2Cesta_activo%2Croles%28nombre_rol%29') && urlStr.includes('id=eq.')) {
          return new Response(JSON.stringify([{ id: 'admin1', esta_activo: true, roles: { nombre_rol: 'administrador' } }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        // Duplicate checks or main GET
        if (method === 'GET') {
          // If duplicate check (checking correo/nombre_usuario)
          if (urlStr.includes('or=')) {
            return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
          // Main list GET
          return new Response(JSON.stringify([{ id: 'emp-1', nombre: 'Juan', roles: { nombre_rol: 'caja' } }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        if (method === 'POST') {
          return new Response(JSON.stringify({ id: 'new-emp-id', nombre: 'Maria' }), { status: 201, headers: { 'Content-Type': 'application/json' } });
        }
      }

      if (urlStr.includes('/auth/v1/admin/users')) {
        return new Response(JSON.stringify({ user: { id: 'new-emp-id' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify([]), { status: 200 });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /empleados', () => {
    it('debe retornar lista de empleados con status 200', async () => {
      const response = await request(app).get('/empleados').set('Authorization', 'Bearer token');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].nombre).toBe('Juan');
    });

    it('debe retornar 500 si hay error en la bd', async () => {
      forceDbError = true;

      const response = await request(app).get('/empleados').set('Authorization', 'Bearer token');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /empleados', () => {
    it('debe crear un nuevo empleado con status 200', async () => {
      const response = await request(app)
        .post('/empleados')
        .set('Authorization', 'Bearer token')
        .send({
          nombre: 'Maria',
          apellido: 'Gomez',
          correo: 'maria@test.com',
          id_rol: 1,
          password: 'pass',
          nombre_usuario: 'Maria'
        });

      if (response.status !== 201) {
        console.log('Error creating employee:', response.body);
      }
      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id', 'new-emp-id');
    });
  });
});
