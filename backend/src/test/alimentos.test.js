import request from 'supertest';
import express from 'express';
import { describe, it, expect, vi, beforeEach, beforeAll, afterEach, afterAll } from 'vitest';

// Mock validation
vi.mock('../validation/ecencia', () => ({
  parseBody: vi.fn((schema, body) => body),
  schemas: {
    alimento: {},
    categoriaMenu: {},
    alimentoCreate: {},
    menuDiario: {}
  },
  sendValidationError: vi.fn(() => false)
}));

let alimentosRouter;
let forceDbError = false;
let fetchSpy;
let findOrCreateFoodMock = vi.fn();

beforeAll(async () => {
  // Inject mock into require.cache for menuCatalog.js to intercept CJS require
  const catalogPath = require.resolve('../services/menuCatalog.js');
  require.cache[catalogPath] = {
    id: catalogPath,
    filename: catalogPath,
    loaded: true,
    exports: {
      findOrCreateFood: (...args) => findOrCreateFoodMock(...args),
      normalizeFoodName: (v) => String(v || '').toLowerCase(),
    },
    children: [],
    paths: []
  };

  const resolvedPath = require.resolve('../routes/alimentos.js');
  delete require.cache[resolvedPath];
  alimentosRouter = (await import('../routes/alimentos.js')).default;
});

const app = express();
app.use(express.json());
app.use('/alimentos', (req, res, next) => alimentosRouter(req, res, next));

describe('Alimentos Routes', () => {
  beforeEach(() => {
    forceDbError = false;
    vi.clearAllMocks();
    findOrCreateFoodMock.mockReset();

    fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url, options) => {
      const urlStr = url.toString();
      const method = options?.method || 'GET';

      if (urlStr.includes('/auth/v1/user')) {
        return new Response(JSON.stringify({ id: 'admin1', email: 'admin@test.com' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (urlStr.includes('/rest/v1/empleados')) {
        return new Response(JSON.stringify([{ id: 'admin1', esta_activo: true, roles: { nombre_rol: 'administrador' } }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      
      if (forceDbError) {
        return new Response(JSON.stringify({ message: 'DB Error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }

      if (urlStr.includes('/rest/v1/categorias_menu')) {
        if (method === 'GET') {
          return new Response(JSON.stringify([{ id_categoria_menu: 1, nombre_categoria: 'Sopa' }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (method === 'POST') {
          return new Response(JSON.stringify({ id_categoria_menu: 2, nombre_categoria: 'Segundo' }), { status: 201, headers: { 'Content-Type': 'application/json' } });
        }
        if (method === 'DELETE') {
          return new Response(JSON.stringify([{}]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
      }

      if (urlStr.includes('/rest/v1/menu_diario')) {
        if (method === 'GET') {
          return new Response(JSON.stringify([
            {
              id_alimento: 10,
              imagen_url: 'http://image.url',
              alimentos: {
                nombre_alimento: 'Pollo Frito',
                id_categoria_menu: 1
              }
            }
          ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (method === 'DELETE') {
          return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (method === 'POST') {
          return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (method === 'HEAD') {
          if (urlStr.includes('id_alimento=eq.10')) {
            return new Response('', {
              status: 200,
              headers: {
                'Content-Range': '0-0/1'
              }
            });
          }
          return new Response('', {
            status: 200,
            headers: {
              'Content-Range': '0-0/0'
            }
          });
        }
      }

      if (urlStr.includes('/rest/v1/alimentos')) {
        if (method === 'GET' || method === 'HEAD') {
          if (urlStr.includes('id_categoria_menu=eq.1')) {
            return new Response(JSON.stringify([]), {
              status: 200,
              headers: {
                'Content-Range': '0-0/1',
                'Content-Type': 'application/json'
              }
            });
          }
          if (urlStr.includes('id_categoria_menu=eq.2')) {
            return new Response(JSON.stringify([]), {
              status: 200,
              headers: {
                'Content-Range': '0-0/0',
                'Content-Type': 'application/json'
              }
            });
          }
          return new Response(JSON.stringify([{ id_alimento: 1, nombre_alimento: 'Pollo', id_categoria_menu: 1 }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (method === 'DELETE') {
          return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /alimentos/categorias', () => {
    it('debe retornar lista de categorias', async () => {
      const response = await request(app).get('/alimentos/categorias').set('Authorization', 'Bearer token');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].nombre_categoria).toBe('Sopa');
    });

    it('debe retornar 500 si hay error en la bd', async () => {
      forceDbError = true;
      const response = await request(app).get('/alimentos/categorias').set('Authorization', 'Bearer token');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /alimentos/categorias', () => {
    it('debe crear una nueva categoria', async () => {
      const response = await request(app)
        .post('/alimentos/categorias')
        .set('Authorization', 'Bearer token')
        .send({ nombre_categoria: 'Segundo' });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id_categoria_menu', 2);
    });

    it('debe retornar 500 si hay error en la bd', async () => {
      forceDbError = true;
      const response = await request(app)
        .post('/alimentos/categorias')
        .set('Authorization', 'Bearer token')
        .send({ nombre_categoria: 'Segundo' });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('DELETE /alimentos/categorias/:id', () => {
    it('debe eliminar una categoria si no tiene alimentos asociados', async () => {
      const response = await request(app).delete('/alimentos/categorias/2').set('Authorization', 'Bearer token');

      expect(response.status).toBe(200);
      expect(response.body.mensaje).toBe('Categoria eliminada correctamente.');
    });

    it('debe retornar 409 si la categoria tiene alimentos asociados', async () => {
      const response = await request(app).delete('/alimentos/categorias/1').set('Authorization', 'Bearer token');

      expect(response.status).toBe(409);
      expect(response.body.error).toMatch(/No se puede eliminar la categoria porque tiene alimentos asociados/);
    });

    it('debe retornar 400 si el id no es valido', async () => {
      const response = await request(app).delete('/alimentos/categorias/abc').set('Authorization', 'Bearer token');
      expect(response.status).toBe(400);
    });

    it('debe retornar 500 si hay error de bd', async () => {
      forceDbError = true;
      const response = await request(app).delete('/alimentos/categorias/2').set('Authorization', 'Bearer token');
      expect(response.status).toBe(500);
    });
  });

  describe('GET /alimentos', () => {
    it('debe retornar todos los alimentos', async () => {
      const response = await request(app).get('/alimentos').set('Authorization', 'Bearer token');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].nombre).toBe('Pollo');
    });

    it('debe retornar 500 si hay error en la bd', async () => {
      forceDbError = true;
      const response = await request(app).get('/alimentos').set('Authorization', 'Bearer token');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /alimentos', () => {
    it('debe crear un nuevo alimento (201 si es nuevo)', async () => {
      findOrCreateFoodMock.mockResolvedValue({
        id: 5,
        nombre: 'Arroz con menestra',
        id_categoria: 2,
        created: true,
      });

      const response = await request(app)
        .post('/alimentos')
        .set('Authorization', 'Bearer token')
        .send({ nombre: 'Arroz con menestra', id_categoria: 2 });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ id: 5, nombre: 'Arroz con menestra', id_categoria: 2 });
    });

    it('debe retornar 200 si el alimento ya existe', async () => {
      findOrCreateFoodMock.mockResolvedValue({
        id: 5,
        nombre: 'Arroz con menestra',
        id_categoria: 2,
        created: false,
      });

      const response = await request(app)
        .post('/alimentos')
        .set('Authorization', 'Bearer token')
        .send({ nombre: 'Arroz con menestra', id_categoria: 2 });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ id: 5, nombre: 'Arroz con menestra', id_categoria: 2 });
    });

    it('debe retornar 500 si falla el service de base de datos', async () => {
      findOrCreateFoodMock.mockRejectedValue(new Error('DB catalog error'));

      const response = await request(app)
        .post('/alimentos')
        .set('Authorization', 'Bearer token')
        .send({ nombre: 'Arroz con menestra', id_categoria: 2 });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('DB catalog error');
    });
  });

  describe('DELETE /alimentos/:id', () => {
    it('debe eliminar un alimento si no tiene menus anteriores', async () => {
      const response = await request(app).delete('/alimentos/5').set('Authorization', 'Bearer token');

      expect(response.status).toBe(200);
      expect(response.body.mensaje).toBe('Alimento eliminado correctamente.');
    });

    it('debe retornar 409 si el alimento esta en menus anteriores', async () => {
      const response = await request(app).delete('/alimentos/10').set('Authorization', 'Bearer token');

      expect(response.status).toBe(409);
      expect(response.body.error).toContain('No se puede eliminar el alimento porque esta asociado a menus anteriores');
    });

    it('debe retornar 400 si el ID es invalido', async () => {
      const response = await request(app).delete('/alimentos/0').set('Authorization', 'Bearer token');
      expect(response.status).toBe(400);
    });

    it('debe retornar 500 si hay error de bd', async () => {
      forceDbError = true;
      const response = await request(app).delete('/alimentos/5').set('Authorization', 'Bearer token');
      expect(response.status).toBe(500);
    });
  });

  describe('GET /alimentos/menu-diario/hoy', () => {
    it('debe obtener el menu diario de hoy', async () => {
      const response = await request(app).get('/alimentos/menu-diario/hoy').set('Authorization', 'Bearer token');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('fecha');
      expect(response.body.imagen_url).toBe('http://image.url');
      expect(response.body.alimentos[0].nombre).toBe('Pollo Frito');
    });

    it('debe retornar 500 si hay error de bd', async () => {
      forceDbError = true;
      const response = await request(app).get('/alimentos/menu-diario/hoy').set('Authorization', 'Bearer token');
      expect(response.status).toBe(500);
    });
  });

  describe('POST /alimentos/menu-diario', () => {
    it('debe guardar el menu diario correctamente', async () => {
      const response = await request(app)
        .post('/alimentos/menu-diario')
        .set('Authorization', 'Bearer token')
        .send({
          fecha: '2026-07-11',
          alimentos_ids: [1, 2],
          imagen_url: 'http://image.new.url'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('debe retornar 500 si hay error de delete previo', async () => {
      forceDbError = true;
      const response = await request(app)
        .post('/alimentos/menu-diario')
        .set('Authorization', 'Bearer token')
        .send({
          fecha: '2026-07-11',
          alimentos_ids: [1, 2]
        });

      expect(response.status).toBe(500);
    });
  });
});
