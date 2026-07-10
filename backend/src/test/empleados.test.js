import request from 'supertest';
import express from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import empleadosRouter from '../routes/empleados';
import supabaseConfig from '../config/supabase';

vi.spyOn(supabaseConfig, 'getAdminClient');


const app = express();
app.use(express.json());
app.use('/empleados', empleadosRouter);

describe('Empleados Routes', () => {
  let mockSupabase;

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
      if (url.toString().includes('/auth/v1/user')) {
        return new Response(JSON.stringify({ id: 'admin1', email: 'admin@test.com' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.toString().includes('/rest/v1/empleados')) { return new Response(JSON.stringify([{ id: 'admin1', esta_activo: true, roles: { nombre_rol: 'administrador' } }]), { status: 200, headers: { 'Content-Type': 'application/json' } }); } return new Response(JSON.stringify([]), { status: 200 });
    });

    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 'admin1', esta_activo: true, roles: { nombre_rol: 'administrador' } },
        error: null
      }),
      auth: {
        admin: {
          createUser: vi.fn(),
          updateUserById: vi.fn()
        }
      }
    };
    supabaseConfig.getAdminClient.mockReturnValue(mockSupabase);
  });

  describe('GET /empleados', () => {
    it('debe retornar lista de empleados con status 200', async () => {
      mockSupabase.eq.mockResolvedValue({
        data: [{ id: 1, nombre: 'Juan' }],
        error: null,
      });

      const response = await request(app).get('/empleados').set('Authorization', 'Bearer token');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].nombre).toBe('Juan');
    });

    it('debe retornar 500 si hay error en la bd', async () => {
      mockSupabase.eq.mockResolvedValue({
        data: null,
        error: new Error('Error de BD'),
      });

      const response = await request(app).get('/empleados').set('Authorization', 'Bearer token');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /empleados', () => {
    it('debe crear un nuevo empleado con status 200', async () => {
      mockSupabase.auth.admin.createUser.mockResolvedValue({
        data: { user: { id: '2' } },
        error: null,
      });
      mockSupabase.single.mockResolvedValue({
        data: { id: '2', nombre: 'Maria' },
        error: null,
      });

      const response = await request(app)
        .post('/empleados')
        .set('Authorization', 'Bearer token')
        .send({
          nombre: 'Maria',
          apellidos: 'Gomez',
          correo: 'maria@test.com',
          roles_id: 1,
          password: 'pass'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id', '2');
    });
  });
});
