 
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import authRouter from '../routes/auth.js';

describe('Rutas HTTP de Auth', () => {
  let app;
  let fetchSpy;

  const jsonResponse = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  const EMPLEADO_ADMIN = {
    id: '11111111-1111-4111-8111-111111111111',
    nombre: 'Admin',
    apellido: 'Test',
    nombre_usuario: 'admin',
    correo: 'admin@test.com',
    esta_activo: true,
    roles: { nombre_rol: 'administrador' },
  };

  const EMPLEADO_INACTIVO = {
    ...EMPLEADO_ADMIN,
    id: '22222222-2222-4222-8222-222222222222',
    correo: 'inactive@test.com',
    esta_activo: false,
  };

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);

    fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url, options) => {
      const urlStr = url.toString();
      const method = options?.method || 'GET';
      let body = null;
      try {
        if (options?.body) body = JSON.parse(options.body);
      } catch { /* ignore */ }

      // --- Supabase Auth (Respuestas crudas del servidor de Supabase) ---
      if (urlStr.includes('/auth/v1/token') && urlStr.includes('grant_type=password')) {
        if (body?.email === 'admin@test.com' && body?.password === 'correctpass') {
          return jsonResponse({
            access_token: 'valid-access-token',
            refresh_token: 'valid-refresh-token',
            expires_in: 3600,
            token_type: 'bearer',
            user: {
              id: '11111111-1111-4111-8111-111111111111',
              email: 'admin@test.com',
              user_metadata: { rol: 'caja', esta_activo: true }
            }
          });
        }
        if (body?.email === 'inactive@test.com' && body?.password === 'correctpass') {
          return jsonResponse({
            access_token: 'inactive-access-token',
            refresh_token: 'inactive-refresh-token',
            expires_in: 3600,
            token_type: 'bearer',
            user: {
              id: '22222222-2222-4222-8222-222222222222',
              email: 'inactive@test.com',
              user_metadata: {}
            }
          });
        }
        return jsonResponse({ error: 'invalid_grant', error_description: 'Invalid login credentials' }, 400);
      }

      if (urlStr.includes('/auth/v1/token') && urlStr.includes('grant_type=refresh_token')) {
        if (body?.refresh_token === 'valid-refresh-token') {
          return jsonResponse({
            access_token: 'new-access-token',
            refresh_token: 'new-refresh-token',
            expires_in: 3600,
            token_type: 'bearer',
            user: { id: '11111111-1111-4111-8111-111111111111' }
          });
        }
        return jsonResponse({ error: 'invalid_grant', error_description: 'Invalid refresh token' }, 400);
      }

      if (urlStr.includes('/auth/v1/recover')) {
        return jsonResponse({});
      }

      // get user for authMiddleware
      if (urlStr.includes('/auth/v1/user') && method === 'GET') {
        const authHeader = options.headers?.Authorization || options.headers?.authorization;
        if (authHeader === 'Bearer valid-access-token') {
          return jsonResponse({ id: '11111111-1111-4111-8111-111111111111', email: 'admin@test.com' });
        }
        return jsonResponse({ error: 'Unauthorized' }, 401);
      }

      // updateUserById (admin)
      if (urlStr.includes('/auth/v1/admin/users/')) {
        return jsonResponse({ id: '11111111-1111-4111-8111-111111111111' });
      }

      // --- Supabase PostgREST (Base de datos) ---
      if (urlStr.includes('/rest/v1/empleados')) {
        let acceptHeader = '';
        if (options.headers && typeof options.headers.get === 'function') {
          acceptHeader = options.headers.get('accept') || '';
        } else if (options.headers) {
          acceptHeader = options.headers.Accept || options.headers.accept || '';
        }
        const isSingle = acceptHeader.includes('application/vnd.pgrst.object+json');
        const returnData = (data) => jsonResponse(isSingle && Array.isArray(data) ? data[0] : data);

        if (urlStr.includes('nombre_usuario=eq.admin')) {
          return returnData([EMPLEADO_ADMIN]);
        }
        if (urlStr.includes('nombre_usuario=eq.unknown')) {
          return jsonResponse(isSingle ? { code: 'PGRST116', message: 'Not found' } : [], isSingle ? 406 : 200);
        }
        if (urlStr.includes('id=eq.11111111-1111-4111-8111-111111111111') || urlStr.includes('correo=eq.admin@test.com')) {
          return returnData([EMPLEADO_ADMIN]);
        }
        if (urlStr.includes('id=eq.22222222-2222-4222-8222-222222222222') || urlStr.includes('correo=eq.inactive@test.com')) {
          return returnData([EMPLEADO_INACTIVO]);
        }
        if (urlStr.includes('correo=ilike.admin')) {
          return jsonResponse(EMPLEADO_ADMIN);
        }
        if (urlStr.includes('correo=ilike.inactive')) {
          return jsonResponse(EMPLEADO_INACTIVO);
        }
        if (urlStr.includes('correo=ilike.unknown')) {
          return jsonResponse(null); // maybeSingle returns empty text/null if not found
        }
        // Fallback for empty/others
        return jsonResponse([]);
      }

      return jsonResponse({}, 404);
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.resetModules();
  });

  // ─── POST /login ─────────────────────────────────────────────────────

  describe('POST /login', () => {
    it('retorna 400 si falta identificador o password', async () => {
      const res = await request(app).post('/api/auth/login').send({});
      expect(res.status).toBe(400);
      expect(res.body.mensaje).toMatch(/obligatorios/i);
    });

    it('retorna 400 si falta password', async () => {
      const res = await request(app).post('/api/auth/login').send({ identificador: 'admin' });
      expect(res.status).toBe(400);
    });

    it('login exitoso con correo electronico', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ identificador: 'admin@test.com', password: 'correctpass' });

      expect(res.status).toBe(200);
      expect(res.body.token).toBe('valid-access-token');
      expect(res.body.user.nombre).toBe('Admin');
    });

    it('login exitoso con nombre de usuario', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ identificador: 'admin', password: 'correctpass' });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
    });

    it('retorna 401 si el usuario no existe en la BD (nombre_usuario)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ identificador: 'unknown', password: 'correctpass' });

      expect(res.status).toBe(401);
      expect(res.body.mensaje).toMatch(/no encontrado/i);
    });

    it('retorna 401 si las credenciales de Supabase Auth son invalidas', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ identificador: 'admin@test.com', password: 'wrongpass' });

      expect(res.status).toBe(401);
      expect(res.body.mensaje).toMatch(/inv[aá]lidas/i);
    });

    it('retorna 403 si el empleado esta desactivado', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ identificador: 'inactive@test.com', password: 'correctpass' });

      expect(res.status).toBe(403);
      expect(res.body.mensaje).toMatch(/desactivad/i);
    });
  });

  // ─── POST /refresh ───────────────────────────────────────────────────

  describe('POST /refresh', () => {
    it('retorna 400 si no se envia refresh_token', async () => {
      const res = await request(app).post('/api/auth/refresh').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/obligatorio/i);
    });

    it('renueva la sesion con un refresh_token valido', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refresh_token: 'valid-refresh-token' });

      expect(res.status).toBe(200);
      expect(res.body.token).toBe('new-access-token');
      expect(res.body.refresh_token).toBe('new-refresh-token');
    });



    it('retorna 401 si el refresh_token es invalido o expirado', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refresh_token: 'expired-token' });

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/expirada/i);
    });
  });

  // ─── POST /forgot-password ───────────────────────────────────────────

  describe('POST /forgot-password', () => {
    it('retorna 400 si no se envia correo', async () => {
      const res = await request(app).post('/api/auth/forgot-password').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/obligatorio/i);
    });

    it('retorna respuesta generica sin revelar si el correo existe', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ correo: 'admin@test.com' });

      expect(res.status).toBe(200);
      expect(res.body.mensaje).toMatch(/enlace/i);
    });

    it('retorna respuesta generica incluso si el correo no existe', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ correo: 'unknown@test.com' });

      expect(res.status).toBe(200);
      expect(res.body.mensaje).toMatch(/enlace/i);
    });
  });

  // ─── GET /datos-privados ─────────────────────────────────────────────

  describe('GET /datos-privados', () => {
    it('retorna datos del usuario autenticado', async () => {
      const res = await request(app)
        .get('/api/auth/datos-privados')
        .set('Authorization', 'Bearer valid-access-token');

      expect(res.status).toBe(200);
      expect(res.body.mensaje).toBe('Zona segura');
      expect(res.body.usuario_autenticado).toBe('admin@test.com');
    });
  });

  // ─── Tests para helpers privados ───────────────────────────────────────

  describe('Helpers privados', () => {
    it('findEmployeeByUsername encuentra el empleado correcto', async () => {
      const adminClient = {
        from: () => ({
          select: () => ({
            limit: async () => ({
              data: [
                { nombre_usuario: 'Admin', correo: 'admin@test.com' },
                { nombre_usuario: 'Otro', correo: 'otro@test.com' }
              ],
              error: null
            })
          })
        })
      };
      
      const { findEmployeeByUsername } = authRouter._private;
      const result = await findEmployeeByUsername(adminClient, 'admin');
      expect(result).toEqual({ nombre_usuario: 'Admin', correo: 'admin@test.com' });
      
      const notFound = await findEmployeeByUsername(adminClient, 'unknown');
      expect(notFound).toBeNull();
    });

    it('requestPasswordReset devuelve respuesta generica si no existe o esta inactivo', async () => {
      const { requestPasswordReset, PASSWORD_RESET_RESPONSE } = authRouter._private;
      const adminClient = {
        from: () => ({
          select: () => ({
            ilike: () => ({
              maybeSingle: async () => ({
                data: null,
                error: null
              })
            })
          })
        })
      };
      const authClient = { auth: { resetPasswordForEmail: vi.fn() } };
      
      const result = await requestPasswordReset({ email: 'x@x.com', adminClient, authClient, redirectTo: '/' });
      expect(result).toEqual(PASSWORD_RESET_RESPONSE);
      expect(authClient.auth.resetPasswordForEmail).not.toHaveBeenCalled();
    });
  });
});
