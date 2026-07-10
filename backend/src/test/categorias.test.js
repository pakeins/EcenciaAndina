import request from 'supertest';
import express from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import categoriasRouter from '../routes/categorias';
import supabaseConfig from '../config/supabase';

vi.spyOn(supabaseConfig, 'getAdminClient');


vi.mock('../validation/eciencia', () => ({
  parseBody: vi.fn((schema, body) => body),
  schemas: {
    categoriaProducto: {}
  },
  sendValidationError: vi.fn(() => false)
}));

const app = express();
app.use(express.json());
app.use('/categorias', categoriasRouter);

describe('Categorias Routes', () => {
  let mockSupabase;

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
      console.log('FETCH URL:', url); if (url.toString().includes('/auth/v1/user')) { console.log('MATCHED USER');
        return new Response(JSON.stringify({ id: 'admin1', email: 'admin@test.com' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.toString().includes('/rest/v1/empleados')) { return new Response(JSON.stringify([{ id: 'admin1', esta_activo: true, roles: { nombre_rol: 'administrador' } }]), { status: 200, headers: { 'Content-Type': 'application/json' } }); } return new Response(JSON.stringify([]), { status: 200 });
    });

    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 'admin1', esta_activo: true, roles: { nombre_rol: 'administrador' } },
        error: null
      }),
    };
    supabaseConfig.getAdminClient.mockReturnValue(mockSupabase);
  });

  describe('GET /categorias', () => {
    it('debe retornar todas las categorias', async () => {
      mockSupabase.order.mockResolvedValue({
        data: [{ id_categoria: 1, nombre_categoria: 'Postres' }],
        error: null,
      });

      const response = await request(app).get('/categorias').set('Authorization', 'Bearer token');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].nombre_categoria).toBe('Postres');
    });

    it('debe retornar error 500 si la bd falla', async () => {
      mockSupabase.order.mockResolvedValue({
        data: null,
        error: new Error('DB Error'),
      });

      const response = await request(app).get('/categorias').set('Authorization', 'Bearer token');

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('DB Error');
    });
  });

  describe('POST /categorias', () => {
    it('debe crear categoria exitosamente', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { id_categoria: 2, nombre_categoria: 'Bebidas' },
        error: null,
      });

      const response = await request(app)
        .post('/categorias')
        .set('Authorization', 'Bearer token')
        .send({ nombre_categoria: 'Bebidas' });

      expect(response.status).toBe(201);
      expect(response.body.nombre_categoria).toBe('Bebidas');
    });

    it('debe retornar error 500 en fallo db', async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: new Error('Insert Error'),
      });

      const response = await request(app)
        .post('/categorias')
        .set('Authorization', 'Bearer token')
        .send({ nombre_categoria: 'Bebidas' });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Insert Error');
    });
  });

  describe('PUT /categorias/:id', () => {
    it('debe actualizar categoria', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { id_categoria: 1, nombre_categoria: 'Snacks' },
        error: null,
      });

      const response = await request(app)
        .put('/categorias/1')
        .set('Authorization', 'Bearer token')
        .send({ nombre_categoria: 'Snacks' });

      expect(response.status).toBe(200);
      expect(response.body.nombre_categoria).toBe('Snacks');
    });

    it('debe retornar error 500 en fallo db', async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: new Error('Update Error'),
      });

      const response = await request(app)
        .put('/categorias/1')
        .set('Authorization', 'Bearer token')
        .send({ nombre_categoria: 'Snacks' });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Update Error');
    });
  });
});
