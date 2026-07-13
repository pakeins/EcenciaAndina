process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

import request from 'supertest';
import express from 'express';
import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest';

const mockAdminId = 'f6321bf4-3eb3-4bf0-967a-1234567890ab';
const mockEmpId = 'a1234567-1234-1234-1234-1234567890cd';
const nonExistentId = '00000000-0000-0000-0000-000000000000';

let empleadosRouter;
let forceDbError = false;
let forceAuthError = false;
let fetchSpy;
let simulateDuplicateCorreo = false;
let simulateDuplicateUsername = false;

import empleadosRouter from '../routes/empleados.js';
const app = express();
app.use(express.json());
app.use('/empleados', (req, res, next) => empleadosRouter(req, res, next));

describe('Empleados Routes', () => {
  beforeEach(() => {
    forceDbError = false;
    forceAuthError = false;
    simulateDuplicateCorreo = false;
    simulateDuplicateUsername = false;

    fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url, options) => {
      const urlStr = url.toString();
      const method = options?.method || 'GET';
      const bodyText = options?.body ? String(options.body) : '';
      const headers = options?.headers || {};
      
      let accept = '';
      if (headers && typeof headers.get === 'function') {
        accept = headers.get('accept') || headers.get('Accept') || '';
      } else if (headers) {
        accept = headers.Accept || headers.accept || '';
      }
      const isSingle = accept.includes('vnd.pgrst.object');

      // Mock user authorization middleware resolved employee check
      if (urlStr.includes('/auth/v1/user')) {
        return new Response(JSON.stringify({ id: mockAdminId, email: 'admin@test.com' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      
      if (urlStr.includes('/rest/v1/empleados')) {
        const isMiddlewareCheck = urlStr.includes('select=id%2Cesta_activo%2Croles%28nombre_rol%29');
        if (forceDbError && !isMiddlewareCheck) {
          return new Response(JSON.stringify({ message: 'DB Error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }
        
        // Match resolveEmpleado query in middleware
        if (urlStr.includes('select=id%2Cesta_activo%2Croles%28nombre_rol%29') && urlStr.includes(`id=eq.${mockAdminId}`)) {
          const middlewareUser = { id: mockAdminId, esta_activo: true, roles: { nombre_rol: 'administrador' } };
          const responseBody = isSingle ? middlewareUser : [middlewareUser];
          return new Response(JSON.stringify(responseBody), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        if (method === 'GET') {
          // If select correo (for password reset)
          if (urlStr.includes('select=correo') && !urlStr.includes('nombre_usuario')) {
            if (urlStr.includes(`id=eq.${nonExistentId}`)) {
              // Empleado no encontrado para .single()
              return new Response(JSON.stringify({ error: 'No rows found' }), { status: 406, headers: { 'Content-Type': 'application/json' } });
            }
            const empCorreo = { correo: 'maria@test.com' };
            const responseBody = isSingle ? empCorreo : [empCorreo];
            return new Response(JSON.stringify(responseBody), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
          // Main profile GET or duplicate check
          if (urlStr.includes('or=')) {
            if (simulateDuplicateCorreo) {
              return new Response(JSON.stringify([{ correo: 'maria@test.com', nombre_usuario: 'Maria' }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }
            if (simulateDuplicateUsername) {
              return new Response(JSON.stringify([{ nombre_usuario: 'Maria' }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }
            return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
          // Main list GET or perfil GET
          const profileData = { id: mockAdminId, nombre: 'Juan', apellido: 'Perez', correo: 'admin@test.com', nombre_usuario: 'Juan', id_rol: 1, esta_activo: true, roles: { nombre_rol: 'administrador' } };
          const responseBody = isSingle ? profileData : [profileData];
          return new Response(JSON.stringify(responseBody), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        if (method === 'POST') {
          const createdEmp = { id: mockEmpId, nombre: 'Maria' };
          const responseBody = isSingle ? createdEmp : [createdEmp];
          return new Response(JSON.stringify(responseBody), { status: 201, headers: { 'Content-Type': 'application/json' } });
        }

        if (method === 'PATCH' || method === 'PUT') {
          const updatedEmp = { id: mockAdminId, nombre: 'Juan', apellido: 'Perez', correo: 'admin@test.com', nombre_usuario: 'Juan', id_rol: 1, esta_activo: true, roles: { nombre_rol: 'administrador' } };
          const responseBody = isSingle ? updatedEmp : [updatedEmp];
          return new Response(JSON.stringify(responseBody), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
      }

      if (urlStr.includes('/auth/v1/token')) {
        // signInWithPassword
        const body = JSON.parse(bodyText);
        if (body.password === 'wrong-pass') {
          return new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({
          access_token: 'fake-token',
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'fake-refresh',
          user: { id: mockAdminId, email: 'admin@test.com' }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (urlStr.includes('/auth/v1/recover')) {
        if (forceAuthError) {
          return new Response(JSON.stringify({ error: 'recover_error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      }

      if (urlStr.includes('/auth/v1/admin/users')) {
        if (forceAuthError) {
          return new Response(JSON.stringify({ error: { message: 'auth_admin_error' } }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({ user: { id: mockEmpId } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
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
    it('debe crear un nuevo empleado con status 201', async () => {
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

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id', mockEmpId);
    });

    it('debe retornar 400 si el correo o nombre_usuario ya esta en uso', async () => {
      simulateDuplicateCorreo = true;

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

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('El correo electrónico ya está registrado.');
    });

    it('debe retornar 400 si el nombre de usuario ya está en uso', async () => {
      simulateDuplicateUsername = true;

      const response = await request(app)
        .post('/empleados')
        .set('Authorization', 'Bearer token')
        .send({
          nombre: 'Maria',
          apellido: 'Gomez',
          correo: 'different@test.com',
          id_rol: 1,
          password: 'pass',
          nombre_usuario: 'Maria'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('El nombre de usuario ya está en uso.');
    });
  });

  describe('GET /empleados/perfil', () => {
    it('debe obtener el perfil del usuario autenticado', async () => {
      const response = await request(app).get('/empleados/perfil').set('Authorization', 'Bearer token');

      expect(response.status).toBe(200);
      expect(response.body.nombre).toBe('Juan');
      expect(response.body.roles.nombre_rol).toBe('administrador');
    });

    it('debe retornar 500 si hay error de bd', async () => {
      forceDbError = true;
      const response = await request(app).get('/empleados/perfil').set('Authorization', 'Bearer token');
      expect(response.status).toBe(500);
    });
  });

  describe('PUT /empleados/perfil', () => {
    it('debe actualizar el perfil del usuario autenticado', async () => {
      const response = await request(app)
        .put('/empleados/perfil')
        .set('Authorization', 'Bearer token')
        .send({ nombre: 'Juan', apellido: 'Perez', nombre_usuario: 'Juan' });

      expect(response.status).toBe(200);
      expect(response.body.mensaje).toBe('Perfil actualizado exitosamente');
    });

    it('debe retornar 500 si falla la bd o el auth', async () => {
      forceDbError = true;
      const response = await request(app)
        .put('/empleados/perfil')
        .set('Authorization', 'Bearer token')
        .send({ nombre: 'Juan', apellido: 'Perez', nombre_usuario: 'Juan' });

      expect(response.status).toBe(500);
    });
  });

  describe('PUT /empleados/perfil/password', () => {
    it('debe cambiar la contraseña validando la anterior', async () => {
      const response = await request(app)
        .put('/empleados/perfil/password')
        .set('Authorization', 'Bearer token')
        .send({ currentPassword: 'old-password', newPassword: 'new-password' });

      expect(response.status).toBe(200);
      expect(response.body.mensaje).toBe('Contraseña actualizada correctamente');
    });

    it('debe retornar 401 si la contraseña actual es incorrecta', async () => {
      const response = await request(app)
        .put('/empleados/perfil/password')
        .set('Authorization', 'Bearer token')
        .send({ currentPassword: 'wrong-pass', newPassword: 'new-password' });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('La contraseña actual es incorrecta');
    });

    it('debe retornar 500 si falla el update administrativo', async () => {
      forceAuthError = true;
      const response = await request(app)
        .put('/empleados/perfil/password')
        .set('Authorization', 'Bearer token')
        .send({ currentPassword: 'old-password', newPassword: 'new-password' });

      expect(response.status).toBe(500);
    });
  });

  describe('POST /empleados/:id/reset-password', () => {
    it('debe enviar enlace de restablecimiento', async () => {
      const response = await request(app).post(`/empleados/${mockEmpId}/reset-password`).set('Authorization', 'Bearer token');

      expect(response.status).toBe(200);
      expect(response.body.mensaje).toContain('Enlace de restablecimiento enviado');
    });

    it('debe retornar 404 si el empleado no existe', async () => {
      const response = await request(app).post(`/empleados/${nonExistentId}/reset-password`).set('Authorization', 'Bearer token');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Empleado no encontrado');
    });

    it('debe retornar 500 si falla el envío', async () => {
      forceAuthError = true;
      const response = await request(app).post(`/empleados/${mockEmpId}/reset-password`).set('Authorization', 'Bearer token');

      expect(response.status).toBe(500);
    });
  });

  describe('PUT /empleados/:id/estado', () => {
    it('debe actualizar el estado de activacion del empleado', async () => {
      const response = await request(app)
        .put(`/empleados/${mockEmpId}/estado`)
        .set('Authorization', 'Bearer token')
        .send({ esta_activo: true });

      expect(response.status).toBe(200);
      expect(response.body.esta_activo).toBe(true);
    });

    it('debe retornar 500 si hay error', async () => {
      forceDbError = true;
      const response = await request(app)
        .put(`/empleados/${mockEmpId}/estado`)
        .set('Authorization', 'Bearer token')
        .send({ esta_activo: false });

      expect(response.status).toBe(500);
    });
  });

  describe('PUT /empleados/:id', () => {
    it('debe actualizar datos generales del empleado', async () => {
      const response = await request(app)
        .put(`/empleados/${mockEmpId}`)
        .set('Authorization', 'Bearer token')
        .send({ nombre: 'Juan', apellido: 'Perez', nombre_usuario: 'Juan', id_rol: 1 });

      expect(response.status).toBe(200);
    });

    it('debe retornar 500 si hay error', async () => {
      forceDbError = true;
      const response = await request(app)
        .put(`/empleados/${mockEmpId}`)
        .set('Authorization', 'Bearer token')
        .send({ nombre: 'Juan', apellido: 'Perez', nombre_usuario: 'Juan', id_rol: 1 });

      expect(response.status).toBe(500);
    });
  });

  describe('PUT /empleados/:id/password', () => {
    it('debe cambiar la contraseña administrativamente', async () => {
      const response = await request(app)
        .put(`/empleados/${mockEmpId}/password`)
        .set('Authorization', 'Bearer token')
        .send({ password: 'new-pass' });

      expect(response.status).toBe(200);
      expect(response.body.mensaje).toBe('Contraseña actualizada correctamente');
    });

    it('debe retornar 500 en caso de fallo', async () => {
      forceAuthError = true;
      const response = await request(app)
        .put(`/empleados/${mockEmpId}/password`)
        .set('Authorization', 'Bearer token')
        .send({ password: 'new-pass' });

      expect(response.status).toBe(500);
    });
  });

  describe('PUT /empleados/perfil/recovery-password', () => {
    it('debe restablecer contraseña con token de recuperación', async () => {
      const response = await request(app)
        .put('/empleados/perfil/recovery-password')
        .set('Authorization', 'Bearer token')
        .send({ password: 'recovery-pass' });

      expect(response.status).toBe(200);
      expect(response.body.mensaje).toBe('Contraseña recuperada exitosamente');
    });

    it('debe retornar 500 en caso de fallo', async () => {
      forceAuthError = true;
      const response = await request(app)
        .put('/empleados/perfil/recovery-password')
        .set('Authorization', 'Bearer token')
        .send({ password: 'recovery-pass' });

      expect(response.status).toBe(500);
    });
  });
});
