import { describe, expect, it } from 'vitest';
import { normalizeRole, publicUserFromEmpleado } from '../services/authUser.js';

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
});
