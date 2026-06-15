import { beforeAll, describe, expect, it, vi } from 'vitest';

let findEmployeeByUsername;
let requestPasswordReset;
let PASSWORD_RESET_RESPONSE;

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
  requestPasswordReset = authRouter.default._private.requestPasswordReset;
  PASSWORD_RESET_RESPONSE = authRouter.default._private.PASSWORD_RESET_RESPONSE;
});

const makeRecoveryAdminClient = (employee) => ({
  from: () => ({
    select: () => ({
      ilike: () => ({
        maybeSingle: async () => ({ data: employee, error: null }),
      }),
    }),
  }),
});

describe('recuperacion de contrasena', () => {
  it.each([null, { correo: 'inactive@example.com', esta_activo: false }])(
    'responde igual sin revelar cuentas inexistentes o inactivas',
    async (employee) => {
      const resetPasswordForEmail = vi.fn();
      const result = await requestPasswordReset({
        email: 'user@example.com',
        adminClient: makeRecoveryAdminClient(employee),
        authClient: { auth: { resetPasswordForEmail } },
        redirectTo: 'https://app.example.com/login',
      });

      expect(result).toBe(PASSWORD_RESET_RESPONSE);
      expect(resetPasswordForEmail).not.toHaveBeenCalled();
    },
  );

  it('envia el enlace para una cuenta activa manteniendo la respuesta generica', async () => {
    const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: null });
    const result = await requestPasswordReset({
      email: 'user@example.com',
      adminClient: makeRecoveryAdminClient({
        correo: 'user@example.com',
        esta_activo: true,
      }),
      authClient: { auth: { resetPasswordForEmail } },
      redirectTo: 'https://app.example.com/login',
    });

    expect(result).toBe(PASSWORD_RESET_RESPONSE);
    expect(resetPasswordForEmail).toHaveBeenCalledWith(
      'user@example.com',
      { redirectTo: 'https://app.example.com/login' },
    );
  });
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
