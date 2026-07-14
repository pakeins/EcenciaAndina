import { describe, expect, it, vi } from 'vitest';
import {
  normalizeRole,
  publicUserFromEmpleado,
  roleFromEmpleado,
  findEmpleadoForAuthUser,
  syncAppMetadata,
} from '../services/authUser.js';

describe('normalizeRole', () => {
  it('mapea variantes administrativas a "administrador"', () => {
    for (const role of ['admin', 'Admin', 'administrador', 'Administrativo', 'Super Admin', 'ADMINISTRADOR']) {
      expect(normalizeRole(role)).toBe('administrador');
    }
  });

  it('mapea el resto de roles a "caja"', () => {
    for (const role of ['Empleado', 'cajero', 'caja', '', undefined]) {
      expect(normalizeRole(role)).toBe('caja');
    }
  });
});

describe('roleFromEmpleado', () => {
  it('extrae el rol de un objeto con roles como objeto', () => {
    expect(roleFromEmpleado({ roles: { nombre_rol: 'Admin' } })).toBe('administrador');
  });

  it('extrae el rol de un objeto con roles como array', () => {
    expect(roleFromEmpleado({ roles: [{ nombre_rol: 'cajero' }] })).toBe('caja');
  });

  it('retorna caja si no hay roles', () => {
    expect(roleFromEmpleado({})).toBe('caja');
    expect(roleFromEmpleado(null)).toBe('caja');
    expect(roleFromEmpleado(undefined)).toBe('caja');
  });

  it('usa Roles (mayuscula) como fallback', () => {
    expect(roleFromEmpleado({ Roles: { nombre_rol: 'administrador' } })).toBe('administrador');
  });
});

describe('publicUserFromEmpleado', () => {
  it('deriva rol administrador desde el rol embebido "Super Admin"', () => {
    const empleado = {
      id: 'uuid-1',
      nombre: 'Admin',
      apellido: 'General',
      nombre_usuario: 'ADMINISTRADOR',
      roles: { nombre_rol: 'Super Admin' },
    };
    expect(publicUserFromEmpleado(empleado, 'admin@example.com').rol).toBe('administrador');
  });

  it('usa el rol pre-existente del empleado si esta disponible', () => {
    const empleado = {
      id: 'uuid-2',
      nombre: 'Test',
      apellido: 'User',
      nombre_usuario: 'testuser',
      rol: 'administrador',
    };
    const result = publicUserFromEmpleado(empleado, 'test@example.com');
    expect(result.rol).toBe('administrador');
    expect(result.id).toBe('uuid-2');
    expect(result.email).toBe('test@example.com');
  });
});

describe('findEmpleadoForAuthUser', () => {
  const makeClient = ({ byId, byEmail }) => ({
    from: () => ({
      select: () => ({
        eq: (field, _value) => ({
          limit: async () => {
            if (field === 'id') return byId;
            if (field === 'correo') return byEmail;
            return { data: [], error: null };
          },
        }),
      }),
    }),
  });

  it('encuentra un empleado por su ID de auth', async () => {
    const empleado = { id: 'uid-1', nombre: 'Test' };
    const client = makeClient({
      byId: { data: [empleado], error: null },
      byEmail: { data: [], error: null },
    });

    const result = await findEmpleadoForAuthUser(client, { id: 'uid-1', email: 'test@x.com' });
    expect(result).toEqual(empleado);
  });

  it('hace fallback por correo si no encuentra por ID', async () => {
    const empleado = { id: 'uid-1', nombre: 'Fallback' };
    const client = makeClient({
      byId: { data: [], error: null },
      byEmail: { data: [empleado], error: null },
    });

    const result = await findEmpleadoForAuthUser(client, { id: 'uid-1', email: 'test@x.com' });
    expect(result).toEqual(empleado);
  });

  it('retorna null si no encuentra por ninguno de los dos metodos', async () => {
    const client = makeClient({
      byId: { data: [], error: null },
      byEmail: { data: [], error: null },
    });

    const result = await findEmpleadoForAuthUser(client, { id: 'uid-1', email: 'test@x.com' });
    expect(result).toBeNull();
  });

  it('lanza error si la consulta por ID falla', async () => {
    const client = makeClient({
      byId: { data: null, error: new Error('DB Error') },
      byEmail: { data: [], error: null },
    });

    await expect(findEmpleadoForAuthUser(client, { id: 'uid-1', email: 'test@x.com' }))
      .rejects.toThrow('DB Error');
  });

  it('lanza error si la consulta fallback por correo falla', async () => {
    const client = makeClient({
      byId: { data: [], error: null },
      byEmail: { data: null, error: new Error('Fallback Error') },
    });

    await expect(findEmpleadoForAuthUser(client, { id: 'uid-1', email: 'test@x.com' }))
      .rejects.toThrow('Fallback Error');
  });

  it('no hace fallback si no tiene email el authUser', async () => {
    const client = makeClient({
      byId: { data: null, error: null },
      byEmail: { data: [{ id: 'uid-1' }], error: null },
    });

    const result = await findEmpleadoForAuthUser(client, { id: 'uid-1' });
    expect(result).toBeNull();
  });
});

describe('syncAppMetadata', () => {
  it('actualiza metadata si el rol es diferente', async () => {
    const updateUserById = vi.fn().mockResolvedValue({});
    const client = { auth: { admin: { updateUserById } } };

    const authUser = { id: 'uid-1', app_metadata: { rol: 'caja', esta_activo: true } };
    const empleado = { roles: { nombre_rol: 'administrador' }, esta_activo: true };

    await syncAppMetadata(client, authUser, empleado);

    expect(updateUserById).toHaveBeenCalledWith('uid-1', {
      app_metadata: { rol: 'administrador', esta_activo: true },
    });
  });

  it('actualiza metadata si esta_activo cambio', async () => {
    const updateUserById = vi.fn().mockResolvedValue({});
    const client = { auth: { admin: { updateUserById } } };

    const authUser = { id: 'uid-1', app_metadata: { rol: 'caja', esta_activo: true } };
    const empleado = { roles: { nombre_rol: 'cajero' }, esta_activo: false };

    await syncAppMetadata(client, authUser, empleado);

    expect(updateUserById).toHaveBeenCalledWith('uid-1', {
      app_metadata: { rol: 'caja', esta_activo: false },
    });
  });

  it('no actualiza si la metadata ya coincide', async () => {
    const updateUserById = vi.fn();
    const client = { auth: { admin: { updateUserById } } };

    const authUser = { id: 'uid-1', app_metadata: { rol: 'caja', esta_activo: true } };
    const empleado = { roles: { nombre_rol: 'cajero' }, esta_activo: true };

    await syncAppMetadata(client, authUser, empleado);

    expect(updateUserById).not.toHaveBeenCalled();
  });

  it('maneja app_metadata undefined/vacio', async () => {
    const updateUserById = vi.fn().mockResolvedValue({});
    const client = { auth: { admin: { updateUserById } } };

    const authUser = { id: 'uid-1' }; // no app_metadata
    const empleado = { roles: { nombre_rol: 'admin' }, esta_activo: true };

    await syncAppMetadata(client, authUser, empleado);

    expect(updateUserById).toHaveBeenCalledWith('uid-1', {
      app_metadata: { rol: 'administrador', esta_activo: true },
    });
  });
});
