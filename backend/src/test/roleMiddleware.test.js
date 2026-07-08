import { describe, it, expect, vi } from 'vitest';
import roleMiddleware from '../middlewares/roleMiddleware.js';

describe('roleMiddleware', () => {
  it('retorna 401 si no hay usuario autenticado (req.user no existe)', () => {
    const middleware = roleMiddleware(['Admin']);
    const req = {};
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const next = vi.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Usuario no autenticado.' });
    expect(next).not.toHaveBeenCalled();
  });

  it('retorna 403 si el usuario no tiene rol asignado', () => {
    const middleware = roleMiddleware(['Admin']);
    const req = { user: { id: 1 } };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const next = vi.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Acceso denegado. No tienes permisos suficientes para esta acción.' });
    expect(next).not.toHaveBeenCalled();
  });

  it('retorna 403 si el rol del usuario no está permitido', () => {
    const middleware = roleMiddleware(['Admin', 'Gerente']);
    const req = { user: { id: 1, rol: 'Cajero' } };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const next = vi.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Acceso denegado. No tienes permisos suficientes para esta acción.' });
    expect(next).not.toHaveBeenCalled();
  });

  it('llama a next() si el rol del usuario está permitido', () => {
    const middleware = roleMiddleware(['Admin', 'Gerente']);
    const req = { user: { id: 1, rol: 'Gerente' } };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});
