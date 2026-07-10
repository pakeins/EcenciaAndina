import request from 'supertest';
import express from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import alimentosRouter from '../routes/alimentos';
import supabaseConfig from '../config/supabase';

vi.spyOn(supabaseConfig, 'getAdminClient');


// Mock validacion
vi.mock('../validation/eciencia', () => ({
  parseBody: vi.fn((schema, body) => body),
  schemas: {
    alimento: {},
    categoriaMenu: {}
  },
  sendValidationError: vi.fn(() => false)
}));

const app = express();
app.use(express.json());
app.use('/alimentos', alimentosRouter);

describe('Alimentos Routes', () => {
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
      order: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 'admin1', esta_activo: true, roles: { nombre_rol: 'administrador' } },
        error: null
      }),
    };
    supabaseConfig.getAdminClient.mockReturnValue(mockSupabase);
  });

  describe('GET /alimentos/categorias', () => {
    it('debe retornar lista de categorias', async () => {
      mockSupabase.order.mockResolvedValue({
        data: [{ id_categoria_menu: 1, nombre_categoria: 'Sopa' }],
        error: null,
      });

      const response = await request(app).get('/alimentos/categorias').set('Authorization', 'Bearer token');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].nombre_categoria).toBe('Sopa');
    });
  });

  describe('POST /alimentos/categorias', () => {
    it('debe crear una nueva categoria', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { id_categoria_menu: 2, nombre_categoria: 'Segundo' },
        error: null,
      });

      const response = await request(app)
        .post('/alimentos/categorias')
        .set('Authorization', 'Bearer token')
        .send({ nombre_categoria: 'Segundo' });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id_categoria_menu', 2);
    });
  });

  describe('DELETE /alimentos/categorias/:id', () => {
    it('debe eliminar una categoria si no tiene alimentos asociados', async () => {
      // Mock para check de alimentos asociados
      mockSupabase.eq.mockResolvedValueOnce({ data: [], error: null }); // from('alimentos').select(...)
      // Mock para delete
      mockSupabase.eq.mockResolvedValueOnce({ data: { id_categoria_menu: 1 }, error: null });

      const response = await request(app).delete('/alimentos/categorias/1').set('Authorization', 'Bearer token');

      expect(response.status).toBe(200);
      expect(response.body.mensaje).toBe('Categoria eliminada correctamente');
    });

    it('debe retornar 409 si la categoria tiene alimentos asociados', async () => {
      // Mock check alimentos
      mockSupabase.eq.mockResolvedValueOnce({ data: [{ id_alimento: 1 }], error: null });

      const response = await request(app).delete('/alimentos/categorias/1').set('Authorization', 'Bearer token');

      expect(response.status).toBe(409);
      expect(response.body.error).toMatch(/No se puede eliminar la categoria porque existen/);
    });
  });

  describe('GET /alimentos', () => {
    it('debe retornar todos los alimentos', async () => {
      mockSupabase.order.mockResolvedValue({
        data: [{ id_alimento: 1, nombre_alimento: 'Pollo' }],
        error: null,
      });

      const response = await request(app).get('/alimentos').set('Authorization', 'Bearer token');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].nombre_alimento).toBe('Pollo');
    });
  });
});
