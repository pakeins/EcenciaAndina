/* eslint-disable no-unused-vars */
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';

let reportesRouter;

describe('Rutas de Reportes', () => {
  let app;
  let fetchSpy;
  let forceDbError = false;

  beforeAll(async () => {
    const resolvedPath = require.resolve('../routes/reportes.js');
    delete require.cache[resolvedPath];
    reportesRouter = (await import('../routes/reportes.js')).default;
  });

  beforeEach(() => {
    forceDbError = false;
    app = express();
    app.use(express.json());
    // Mock user for authMiddleware & roleMiddleware
    app.use((req, res, next) => {
      req.user = { id: 'admin-id', rol: 'administrador', empleado_id: 'emp-1' };
      next();
    });
    app.use('/api/reportes', reportesRouter);

    fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url, options) => {
      const urlStr = url.toString();
      const method = options?.method || 'GET';

      if (forceDbError && !urlStr.includes('/auth/v1/user') && !urlStr.includes('/rest/v1/empleados')) {
        return new Response(JSON.stringify({ message: 'DB Error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }

      if (urlStr.includes('/auth/v1/user')) {
        return new Response(JSON.stringify({ id: 'admin-id', email: 'admin@test.com' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (urlStr.includes('/rest/v1/empleados')) {
        return new Response(JSON.stringify([{ id: 'emp-1', esta_activo: true, roles: { nombre_rol: 'administrador' } }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      const isOrdenes = /\/rest\/v1\/ordenes(\?|$)/.test(urlStr);
      const isConvenios = /\/rest\/v1\/convenios(\?|$)/.test(urlStr);
      const isClientes = /\/rest\/v1\/clientes(\?|$)/.test(urlStr);
      const isTelegramSubs = /\/rest\/v1\/telegram_subscriptions(\?|$)/.test(urlStr);

      const mockOrder = {
        id_orden: 'ord-1',
        created_at: new Date().toISOString(),
        consumed_at: new Date().toISOString(),
        id_estado: 2,
        metodo_pago: 'Convenio Empresa',
        estados_orden: { nombre_estado: 'Consumido' },
        clientes: {
          nombre: 'Juan',
          apellido: 'Perez',
          clientes_convenios: [{ id_convenio: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', convenios: { nombre_empresa: 'Empresa Sierra' } }]
        },
        detalle_orden: [{
          cantidad: 1,
          precio_aplicado: 3.5,
          id_tipo_almuerzo: 1,
          tipos_almuerzo: { codigo: 'EJC', nombre: 'Almuerzo Ejecutivo' },
          productos: { id_categoria: 1, nombre_producto: 'Plato Fuerte', categorias_productos: { nombre_categoria: 'Almuerzo' } }
        }]
      };

      if (isOrdenes) {
        return new Response(JSON.stringify([mockOrder]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (isConvenios) {
        if (urlStr.includes('select=%2A')) {
          // exact count head request mock
          return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json', 'Content-Range': '0-0/5' } });
        }
        return new Response(JSON.stringify({ cupo_maximo: 10, esta_activo: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (isClientes) {
        if (urlStr.includes('maybeSingle')) {
          return new Response(JSON.stringify({
            id_cliente: 'cli-1',
            clientes_convenios: [{ convenios: { nombre_empresa: 'Empresa Sierra' } }]
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify([{ id_tipo_cliente: 1 }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (isTelegramSubs) {
        return new Response(JSON.stringify([{ consent_status: 'accepted', is_active: true }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /dashboard', () => {
    it('retorna las metricas y analiticas en tiempo real sin filtros', async () => {
      const res = await request(app)
        .get('/api/reportes/dashboard')
        .set('Authorization', 'Bearer valid-token');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('metrics');
      expect(res.body).toHaveProperty('consumosPorDia');
    });

    it('retorna las metricas y analiticas con filtros de fecha correctos', async () => {
      const res = await request(app)
        .get('/api/reportes/dashboard?fecha_inicio=2026-06-01&fecha_fin=2026-06-11')
        .set('Authorization', 'Bearer valid-token');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('metrics');
    });
  });

  describe('GET /telegram-kpis', () => {
    it('retorna KPIs de Telegram exitosamente', async () => {
      const res = await request(app)
        .get('/api/reportes/telegram-kpis')
        .set('Authorization', 'Bearer valid-token');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('users');
    });
  });

  describe('Endpoints validados con validateDates', () => {
    it('retorna 400 si faltan fechas obligatorias', async () => {
      const res = await request(app)
        .get('/api/reportes/ventas')
        .set('Authorization', 'Bearer valid-token');
      expect(res.status).toBe(400);
    });

    it('retorna 400 si el formato de fecha es invalido', async () => {
      const res = await request(app)
        .get('/api/reportes/ventas?fecha_inicio=2026/06/01&fecha_fin=2026-06-11')
        .set('Authorization', 'Bearer valid-token');
      expect(res.status).toBe(400);
    });

    it('retorna 400 si la fecha fin es anterior a la fecha de inicio', async () => {
      const res = await request(app)
        .get('/api/reportes/ventas?fecha_inicio=2026-06-12&fecha_fin=2026-06-11')
        .set('Authorization', 'Bearer valid-token');
      expect(res.status).toBe(400);
    });

    it('GET /ventas retorna reporte general de ingresos exitosamente', async () => {
      const res = await request(app)
        .get('/api/reportes/ventas?fecha_inicio=2026-06-01&fecha_fin=2026-06-11')
        .set('Authorization', 'Bearer valid-token');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /estados retorna reporte de pedidos por estado', async () => {
      const res = await request(app)
        .get('/api/reportes/estados?fecha_inicio=2026-06-01&fecha_fin=2026-06-11&id_estado=2')
        .set('Authorization', 'Bearer valid-token');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /productos retorna popularidad de productos', async () => {
      const res = await request(app)
        .get('/api/reportes/productos?fecha_inicio=2026-06-01&fecha_fin=2026-06-11')
        .set('Authorization', 'Bearer valid-token');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /clientes retorna reporte por cliente especifico', async () => {
      const res = await request(app)
        .get('/api/reportes/clientes?fecha_inicio=2026-06-01&fecha_fin=2026-06-11&id_cliente=cli-1')
        .set('Authorization', 'Bearer valid-token');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /clientes retorna 400 si id_cliente falta o es all', async () => {
      let res = await request(app)
        .get('/api/reportes/clientes?fecha_inicio=2026-06-01&fecha_fin=2026-06-11')
        .set('Authorization', 'Bearer valid-token');
      expect(res.status).toBe(400);

      res = await request(app)
        .get('/api/reportes/clientes?fecha_inicio=2026-06-01&fecha_fin=2026-06-11&id_cliente=all')
        .set('Authorization', 'Bearer valid-token');
      expect(res.status).toBe(400);
    });

    it('GET /dashboard retorna 500 si la base de datos falla', async () => {
      forceDbError = true;
      const res = await request(app)
        .get('/api/reportes/dashboard')
        .set('Authorization', 'Bearer valid-token');
      expect(res.status).toBe(500);
    });

    it('GET /telegram-kpis retorna 500 si la base de datos falla', async () => {
      forceDbError = true;
      const res = await request(app)
        .get('/api/reportes/telegram-kpis')
        .set('Authorization', 'Bearer valid-token');
      expect(res.status).toBe(500);
    });

    it('GET /ventas retorna 500 si la base de datos falla', async () => {
      forceDbError = true;
      const res = await request(app)
        .get('/api/reportes/ventas?fecha_inicio=2026-06-01&fecha_fin=2026-06-11')
        .set('Authorization', 'Bearer valid-token');
      expect(res.status).toBe(500);
    });

    it('GET /estados retorna 500 si la base de datos falla', async () => {
      forceDbError = true;
      const res = await request(app)
        .get('/api/reportes/estados?fecha_inicio=2026-06-01&fecha_fin=2026-06-11')
        .set('Authorization', 'Bearer valid-token');
      expect(res.status).toBe(500);
    });

    it('GET /productos retorna 500 si la base de datos falla', async () => {
      forceDbError = true;
      const res = await request(app)
        .get('/api/reportes/productos?fecha_inicio=2026-06-01&fecha_fin=2026-06-11')
        .set('Authorization', 'Bearer valid-token');
      expect(res.status).toBe(500);
    });

    it('GET /clientes retorna 500 si la base de datos falla', async () => {
      forceDbError = true;
      const res = await request(app)
        .get('/api/reportes/clientes?fecha_inicio=2026-06-01&fecha_fin=2026-06-11&id_cliente=cli-1')
        .set('Authorization', 'Bearer valid-token');
      expect(res.status).toBe(500);
    });
  });
});
