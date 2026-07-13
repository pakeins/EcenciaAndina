 
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import ordenesRouter from '../routes/ordenes.js';

describe('Rutas de Ordenes', () => {
  let app;
  let fetchSpy;
  let forceDbError = false;

  const UUID_CONVENIO_ACTIVO = '11111111-1111-4111-8111-111111111111';
  const UUID_CONVENIO_INACTIVO = '22222222-2222-4222-8222-222222222222';
  const UUID_MONEDERO_EXACTO = '33333333-3333-4333-8333-333333333333';
  const UUID_MONEDERO_FALLBACK = '44444444-4444-4444-8444-444444444444';
  const UUID_MONEDERO_VACIO = '55555555-5555-4555-8555-555555555555';
  const UUID_ORDEN = '66666666-6666-4666-8666-666666666666';

  beforeEach(() => {
    forceDbError = false;
    app = express();
    app.use(express.json());
    app.use('/api/ordenes', ordenesRouter);

    fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url, options) => {
      const urlStr = url.toString();
      const method = options?.method || 'GET';
      const body = options?.body ? JSON.parse(options.body) : null;

      // 1. Auth & Roles
      if (urlStr.includes('/auth/v1/user')) {
        return new Response(JSON.stringify({ id: 'admin-1', email: 'admin@test.com' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (urlStr.includes('/rest/v1/empleados')) {
        return new Response(JSON.stringify([{ id: 'admin-1', esta_activo: true, roles: { nombre_rol: 'administrador' } }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (forceDbError) {
        return new Response(JSON.stringify({ message: 'DB Error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }

      // 2. GET /rest/v1/clientes (Para validación de Convenios y Saldos)
      if (urlStr.includes('/rest/v1/clientes') && method === 'GET') {
        if (urlStr.includes(`id_cliente=eq.${UUID_CONVENIO_INACTIVO}`)) {
          return new Response(JSON.stringify({
            clientes_convenios: [{ convenios: { esta_activo: false } }]
          }), { status: 200, headers: { 'Content-Type': 'application/vnd.pgrst.object+json' } });
        }
        if (urlStr.includes(`id_cliente=eq.${UUID_CONVENIO_ACTIVO}`)) {
          return new Response(JSON.stringify({
            clientes_convenios: [{ convenios: { esta_activo: true, fecha_caducidad: '2099-12-31' } }]
          }), { status: 200, headers: { 'Content-Type': 'application/vnd.pgrst.object+json' } });
        }
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      // 3. POST /rest/v1/ordenes
      if (urlStr.includes('/rest/v1/ordenes') && method === 'POST') {
        return new Response(JSON.stringify({ id_orden: UUID_ORDEN, ...body }), { status: 201, headers: { 'Content-Type': 'application/vnd.pgrst.object+json' } });
      }

      // 4. POST /rest/v1/detalle_orden
      if (urlStr.includes('/rest/v1/detalle_orden') && method === 'POST') {
        return new Response(JSON.stringify([]), { status: 201, headers: { 'Content-Type': 'application/json' } });
      }
      
      // DELETE /rest/v1/detalle_orden
      if (urlStr.includes('/rest/v1/detalle_orden') && method === 'DELETE') {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      // 5. PATCH /rest/v1/ordenes (Actualizar estado/observaciones)
      if (urlStr.includes('/rest/v1/ordenes') && method === 'PATCH') {
        return new Response(JSON.stringify({ id_orden: UUID_ORDEN, id_cliente: UUID_MONEDERO_EXACTO }), { status: 200, headers: { 'Content-Type': 'application/vnd.pgrst.object+json' } });
      }

      // 6. GET /rest/v1/ordenes (Para la obtención de la orden individual en PUT /estado)
      if (urlStr.includes('/rest/v1/ordenes') && method === 'GET' && urlStr.includes('id_orden=')) {
        if (urlStr.includes(`id_orden=eq.${UUID_MONEDERO_EXACTO}`)) {
          return new Response(JSON.stringify({
            id_cliente: UUID_MONEDERO_EXACTO,
            metodo_pago: 'Pendiente',
            clientes: { id_tipo_cliente: 2 }, // DIRECT
            detalle_orden: [{ id_producto: 1, cantidad: 1 }] // Pide prod 1 ($6)
          }), { status: 200, headers: { 'Content-Type': 'application/vnd.pgrst.object+json' } });
        }
        if (urlStr.includes(`id_orden=eq.${UUID_MONEDERO_FALLBACK}`)) {
          return new Response(JSON.stringify({
            id_cliente: UUID_MONEDERO_FALLBACK,
            metodo_pago: 'Pendiente',
            clientes: { id_tipo_cliente: 2 }, // DIRECT
            detalle_orden: [{ id_producto: 1, cantidad: 1 }] // Pide prod 1 ($6)
          }), { status: 200, headers: { 'Content-Type': 'application/vnd.pgrst.object+json' } });
        }
        if (urlStr.includes(`id_orden=eq.${UUID_MONEDERO_VACIO}`)) {
          return new Response(JSON.stringify({
            id_cliente: UUID_MONEDERO_VACIO,
            metodo_pago: 'Pendiente',
            clientes: { id_tipo_cliente: 2 },
            detalle_orden: [{ id_producto: 1, cantidad: 1 }]
          }), { status: 200, headers: { 'Content-Type': 'application/vnd.pgrst.object+json' } });
        }
      }

      // 7. GET /rest/v1/saldos_servicio
      if (urlStr.includes('/rest/v1/saldos_servicio') && method === 'GET') {
        if (urlStr.includes(`id_cliente=eq.${UUID_MONEDERO_EXACTO}`)) {
          // Tiene un almuerzo de $6 (id_producto: 1)
          return new Response(JSON.stringify([
            { id_producto: 1, cantidad_disponible: 1, productos: { precio_unitario: 6, nombre_producto: 'Almuerzo Normal' } }
          ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (urlStr.includes(`id_cliente=eq.${UUID_MONEDERO_FALLBACK}`)) {
          // SOLO tiene almuerzos de $7 (id_producto: 2), NO TIENE de $6
          return new Response(JSON.stringify([
            { id_producto: 2, cantidad_disponible: 1, productos: { precio_unitario: 7, nombre_producto: 'Almuerzo Ejecutivo' } }
          ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (urlStr.includes(`id_cliente=eq.${UUID_MONEDERO_VACIO}`)) {
          return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
      }

      // 8. GET /rest/v1/productos (Para saber precios durante el consumo)
      if (urlStr.includes('/rest/v1/productos') && method === 'GET') {
        return new Response(JSON.stringify([
          { id_producto: 1, precio_unitario: 6 },
          { id_producto: 2, precio_unitario: 7 }
        ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      // PATCH /rest/v1/saldos_servicio (Actualizar saldo deducción)
      if (urlStr.includes('/rest/v1/saldos_servicio') && method === 'PATCH') {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      // Trazabilidad list
      if (urlStr.includes('/rest/v1/telegram_order_traces') || (urlStr.includes('/rest/v1/ordenes') && method === 'GET')) {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      // Intercept telegram subscriptions query for notification coverage
      if (urlStr.includes('/rest/v1/telegram_subscriptions')) {
        return new Response(JSON.stringify({
          chat_id: '123456789',
          consent_status: 'accepted',
          is_active: true
        }), { status: 200, headers: { 'Content-Type': 'application/vnd.pgrst.object+json' } });
      }

      // Intercept internal sendMessage calls
      if (urlStr.includes('internal/sendMessage')) {
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // BLOQUE 1: CREACION DE ORDENES (POST)
  describe('Creacion de Ordenes', () => {
    it('Crea exitosamente una orden como Cliente Convenio', async () => {
      const payload = {
        id_cliente: UUID_CONVENIO_ACTIVO,
        id_estado: 1,
        id_origen: 2,
        canal_origen: 'Web',
        metodo_pago: 'Convenio Empresa',
        detalles: [{ id_producto: 1, cantidad: 1, precio_aplicado: 6 }]
      };
      const res = await request(app).post('/api/ordenes').set('Authorization', 'Bearer token').send(payload);
      expect(res.status).toBe(201);
      expect(res.body.mensaje).toMatch(/exitosa/i);
    });

    it('Falla si el convenio esta inactivo o caducado', async () => {
      const payload = {
        id_cliente: UUID_CONVENIO_INACTIVO,
        id_estado: 1,
        id_origen: 2,
        canal_origen: 'Web',
        metodo_pago: 'Convenio Empresa',
        detalles: [{ id_producto: 1, cantidad: 1, precio_aplicado: 6 }]
      };
      const res = await request(app).post('/api/ordenes').set('Authorization', 'Bearer token').send(payload);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/habilitado/i);
    });

    it('Falla por cantidad negativa en los detalles (Boundary Value)', async () => {
      const payload = {
        id_cliente: UUID_CONVENIO_ACTIVO,
        id_estado: 1,
        id_origen: 2,
        canal_origen: 'Web',
        metodo_pago: 'Pendiente',
        detalles: [{ id_producto: 1, cantidad: -1, precio_aplicado: 6 }]
      };
      const res = await request(app).post('/api/ordenes').set('Authorization', 'Bearer token').send(payload);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/mayor a 0/i);
    });
  });

  // BLOQUE 2: CONSUMO Y DEDUCCION DE MONEDEROS (PUT /estado)
  describe('Consumo de Ordenes (Categorias y Fallback)', () => {
    it('Descuenta correctamente si el cliente tiene saldo exacto para la categoria solicitada', async () => {
      const res = await request(app)
        .put(`/api/ordenes/${UUID_MONEDERO_EXACTO}/estado`)
        .set('Authorization', 'Bearer token')
        .send({ id_estado: 2 }); // 2 = CONSUMED

      expect(res.status).toBe(200);
      expect(res.body.mensaje).toMatch(/actualizado/i);
    });

    it('Requiere confirmacion (Fallback 409) si solo tiene saldo mas caro', async () => {
      const res = await request(app)
        .put(`/api/ordenes/${UUID_MONEDERO_FALLBACK}/estado`)
        .set('Authorization', 'Bearer token')
        .send({ id_estado: 2 });

      expect(res.status).toBe(409);
      expect(res.body.requireConfirmation).toBe(true);
    });

    it('Procesa el Fallback exitosamente si se envia forceFallback = true', async () => {
      const res = await request(app)
        .put(`/api/ordenes/${UUID_MONEDERO_FALLBACK}/estado`)
        .set('Authorization', 'Bearer token')
        .send({ id_estado: 2, forceFallback: true });

      expect(res.status).toBe(200);
      expect(res.body.mensaje).toMatch(/actualizado/i);
    });

    it('Rechaza el consumo si no hay saldo en ninguna categoria aplicable', async () => {
      const res = await request(app)
        .put(`/api/ordenes/${UUID_MONEDERO_VACIO}/estado`)
        .set('Authorization', 'Bearer token')
        .send({ id_estado: 2 });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/suficiente/i);
    });

    it('Procesa cancelacion y envia notificacion asincronica por Telegram', async () => {
      const res = await request(app)
        .put(`/api/ordenes/${UUID_MONEDERO_EXACTO}/estado`)
        .set('Authorization', 'Bearer token')
        .send({ id_estado: 3 }); // 3 = CANCELLED

      expect(res.status).toBe(200);
      expect(res.body.mensaje).toMatch(/actualizado/i);

      // Esperar a que la microtarea asincronica termine
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Validar que se intentó llamar al microservicio de telegram
      const fetchCalls = fetchSpy.mock.calls;
      const telegramCall = fetchCalls.find(call => call[0].includes('internal/sendMessage'));
      expect(telegramCall).toBeDefined();
      expect(telegramCall[1].body).toContain('Pedido Cancelado');
    });
  });

  // BLOQUE 3: OTROS METODOS
  describe('Consulta y Modificacion', () => {
    it('GET /api/ordenes lista exitosamente', async () => {
      const res = await request(app).get('/api/ordenes').set('Authorization', 'Bearer token');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('Rechaza el consumo si no hay saldo en ninguna categoria aplicable', async () => {
      const res = await request(app)
        .post('/api/ordenes')
        .set('Authorization', 'Bearer token')
        .send({
          id_cliente: UUID_MONEDERO_VACIO,
          id_origen: 1,
          canal_origen: 'WhatsApp',
          metodo_pago: 'Monedero',
          detalles: [{ id_producto: 1, cantidad: 1 }]
        });
      expect(res.status).toBe(400);
    });



    it('PUT /api/ordenes/:id reemplaza los detalles correctamente', async () => {
      const res = await request(app)
        .put(`/api/ordenes/${UUID_ORDEN}`)
        .set('Authorization', 'Bearer token')
        .send({
          observaciones: 'Nuevas observaciones',
          detalles: [{ id_producto: 2, cantidad: 2, precio_aplicado: 7 }]
        });
      expect(res.status).toBe(200);
      expect(res.body.mensaje).toMatch(/actualizada/i);
    });

    it('GET /api/ordenes/telegram/trazabilidad lista exitosamente', async () => {
      const res = await request(app).get('/api/ordenes/telegram/trazabilidad').set('Authorization', 'Bearer token');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('traces');
    });
  });

  // BLOQUE 4: ERRORES DE BASE DE DATOS Y VALIDACIONES
  describe('Flujos de Error y Validaciones (Cobertura)', () => {
    it('POST /api/ordenes falla correctamente ante error de BD', async () => {
      forceDbError = true;
      const payload = {
        id_cliente: UUID_CONVENIO_ACTIVO, id_estado: 1, id_origen: 2, canal_origen: 'Web', metodo_pago: 'Pendiente', detalles: [{ id_producto: 1, cantidad: 1, precio_aplicado: 6 }]
      };
      const res = await request(app).post('/api/ordenes').set('Authorization', 'Bearer token').send(payload);
      expect(res.status).toBe(500);
    });

    it('GET /api/ordenes maneja error 500 de la base de datos', async () => {
      forceDbError = true;
      const res = await request(app).get('/api/ordenes').set('Authorization', 'Bearer token');
      expect(res.status).toBe(500);
    });

    it('PUT /api/ordenes/:id/estado falla correctamente ante error de BD', async () => {
      forceDbError = true;
      const res = await request(app).put(`/api/ordenes/${UUID_ORDEN}/estado`).set('Authorization', 'Bearer token').send({ id_estado: 2 });
      expect(res.status).toBe(500);
    });

    it('POST /api/ordenes falla si el cuerpo esta vacío (Joi validation)', async () => {
      const res = await request(app).post('/api/ordenes').set('Authorization', 'Bearer token').send({});
      expect(res.status).toBe(400);
    });

    it('GET /api/ordenes/telegram/trazabilidad falla correctamente ante error de BD', async () => {
      forceDbError = true;
      const res = await request(app).get('/api/ordenes/telegram/trazabilidad').set('Authorization', 'Bearer token');
      expect(res.status).toBe(500);
    });

    it('PUT /api/ordenes/:id falla correctamente ante error de BD al actualizar cabecera', async () => {
      forceDbError = true;
      const res = await request(app)
        .put(`/api/ordenes/${UUID_ORDEN}`)
        .set('Authorization', 'Bearer token')
        .send({
          observaciones: 'Fallo inminente',
          detalles: [{ id_producto: 2, cantidad: 2, precio_aplicado: 7 }]
        });
      expect(res.status).toBe(500);
    });
  });
});
