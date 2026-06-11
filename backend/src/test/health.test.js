import { describe, expect, it } from 'vitest';
import app from '../../index.js';

const { checkDatabaseConnection } = app._private;

describe('health check de Supabase', () => {
  it('crea un cliente administrativo fresco para comprobar la conexion', async () => {
    let clientsCreated = 0;
    const createClient = () => {
      clientsCreated += 1;
      return {
        from: () => ({
          select: () => ({
            limit: async () => ({ error: null }),
          }),
        }),
      };
    };

    await checkDatabaseConnection(createClient);
    await checkDatabaseConnection(createClient);

    expect(clientsCreated).toBe(2);
  });

  it('propaga los errores devueltos por Supabase', async () => {
    const expectedError = new Error('database unavailable');
    const createClient = () => ({
      from: () => ({
        select: () => ({
          limit: async () => ({ error: expectedError }),
        }),
      }),
    });

    await expect(checkDatabaseConnection(createClient)).rejects.toBe(expectedError);
  });
});
