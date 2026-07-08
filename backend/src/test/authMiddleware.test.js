import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import authMiddleware from '../middlewares/authMiddleware';

describe('authMiddleware', () => {
  let req;
  let res;
  let next;
  let fetchSpy;

  beforeEach(() => {
    req = { headers: {} };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    next = vi.fn();
    
    // Mock global fetch for Supabase calls
    fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url, options) => {
      const urlStr = url.toString();
      
      // 1. auth.getUser endpoint
      if (urlStr.includes('/auth/v1/user')) {
        const token = options.headers.Authorization || options.headers.authorization;
        if (token === 'Bearer token-invalido') {
          return new Response(JSON.stringify({ code: 401, msg: 'Invalid token' }), { status: 401 });
        }
        return new Response(JSON.stringify({
          id: 'user-id',
          email: 'test@test.com'
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }

      // 2. adminClient empleados query (id)
      if (urlStr.includes('/rest/v1/empleados') && urlStr.includes('id=eq.user-id')) {
        if (req.headers['x-mock-state'] === 'not-found') {
          return new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        if (req.headers['x-mock-state'] === 'inactive') {
          return new Response(JSON.stringify([{ id: 'emp-id', esta_activo: false }]), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        if (req.headers['x-mock-state'] === 'admin') {
          return new Response(JSON.stringify([{ id: 'emp-id', esta_activo: true, roles: { nombre_rol: 'super admin' } }]), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        if (req.headers['x-mock-state'] === 'cajero') {
          return new Response(JSON.stringify([{ id: 'emp-id', esta_activo: true, roles: [{ nombre_rol: 'Cajero' }] }]), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        if (req.headers['x-mock-state'] === 'db-error') {
          return new Response(JSON.stringify({ message: 'DB Error' }), { status: 500, headers: { 'content-type': 'application/json' } });
        }
      }

      // 3. adminClient empleados query (email fallback)
      if (urlStr.includes('/rest/v1/empleados') && urlStr.includes('correo=eq.test%40test.com')) {
        if (req.headers['x-mock-state'] === 'db-error') {
          return new Response(JSON.stringify({ message: 'DB Error' }), { status: 500, headers: { 'content-type': 'application/json' } });
        }
        return new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } });
      }

      return new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('retorna 401 si no hay header de autorizacion', async () => {
    await authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'No Autorizado. Falta el Token.' });
    expect(next).not.toHaveBeenCalled();
  });

  it('retorna 401 si el token es invalido', async () => {
    req.headers.authorization = 'Bearer token-invalido';

    await authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Token invalido o expirado.' });
  });

  it('retorna 403 si el empleado no esta registrado (ni por id ni por fallback correo)', async () => {
    req.headers.authorization = 'Bearer token-valido';
    req.headers['x-mock-state'] = 'not-found';

    await authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Empleado no registrado o sin rol asignado.' });
  });

  it('retorna 403 si el empleado esta desactivado', async () => {
    req.headers.authorization = 'Bearer token-valido';
    req.headers['x-mock-state'] = 'inactive';

    await authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Su cuenta ha sido desactivada.' });
  });

  it('inyecta req.user y llama next si el token y el empleado son validos (rol Admin)', async () => {
    req.headers.authorization = 'Bearer token-valido';
    req.headers['x-mock-state'] = 'admin';

    await authMiddleware(req, res, next);
    
    expect(req.user).toBeDefined();
    expect(req.user.rol).toBe('administrador');
    expect(req.user.empleado_id).toBe('emp-id');
    expect(next).toHaveBeenCalled();
  });

  it('maneja el rol "caja" correctamente', async () => {
    req.headers.authorization = 'Bearer token-valido';
    req.headers['x-mock-state'] = 'cajero';

    await authMiddleware(req, res, next);
    expect(req.user.rol).toBe('caja');
    expect(next).toHaveBeenCalled();
  });

  it('retorna 500 si ocurre un error inesperado (ej. base de datos falla)', async () => {
    req.headers.authorization = 'Bearer token-valido';
    req.headers['x-mock-state'] = 'db-error';

    await authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Error interno verificando la autenticacion.' });
  });
});
