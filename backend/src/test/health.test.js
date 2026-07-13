import { describe, expect, it } from 'vitest';
import app from '../../index.js';
import request from 'supertest';

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

describe('Rutas base de index.js', () => {
  it('GET / responde con mensaje de funcionamiento', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Backend funcionando');
  });

  it('middleware de error maneja "Origen no permitido por CORS"', async () => {
    const res = await request(app).get('/api/check-db').set('Origin', 'http://malicioso.com');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Origen no permitido por CORS');
  });
});
