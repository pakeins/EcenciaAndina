import { beforeAll, describe, expect, it } from 'vitest';

let findEmployeeByUsername;

const makeAdminClient = (empleados) => ({
  from: () => ({
    select: () => ({
      limit: async () => ({ data: empleados, error: null }),
    }),
  }),
});

beforeAll(async () => {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';
  const authRouter = await import('../routes/auth.js');
  findEmployeeByUsername = authRouter.default._private.findEmployeeByUsername;
});

describe('login de empleados', () => {
  it('encuentra nombre_usuario sin depender de mayusculas', async () => {
    const empleado = await findEmployeeByUsername(
      makeAdminClient([{ nombre_usuario: 'Admin', correo: 'admin@example.com' }]),
      'admin'
    );

    expect(empleado).toEqual({ nombre_usuario: 'Admin', correo: 'admin@example.com' });
  });

  it('rechaza usuarios ambiguos al comparar sin mayusculas', async () => {
    const empleado = await findEmployeeByUsername(
      makeAdminClient([
        { nombre_usuario: 'Admin', correo: 'admin@example.com' },
        { nombre_usuario: 'admin', correo: 'otro@example.com' },
      ]),
      'admin'
    );

    expect(empleado).toBeNull();
  });
});
