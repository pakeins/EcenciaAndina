/* eslint-disable no-unused-vars */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import productosRouter from '../routes/productos.js';

describe('Rutas de Productos', () => {
  let app;
  let fetchSpy;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/productos', productosRouter);

    fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url, options) => {
      const urlStr = url.toString();
      const method = options?.method || 'GET';

      // 1. Mock Supabase Auth (getUser)
      if (urlStr.includes('/auth/v1/user')) {
        return new Response(JSON.stringify({
          id: 'user-admin',
          email: 'admin@test.com'
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      // 2. Mock Role Resolution (empleados)
      if (urlStr.includes('/rest/v1/empleados')) {
        return new Response(JSON.stringify([
          { id: 1, esta_activo: true, roles: { nombre_rol: 'administrador' } }
        ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      // 3. Mock Role Resolution (usuarios fallback used in roleMiddleware)
      if (urlStr.includes('/rest/v1/usuarios')) {
        return new Response(JSON.stringify([
          { id_usuario: 'user-admin', rol: 'administrador' }
        ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      // 4. GET /rest/v1/productos
      if (urlStr.includes('/rest/v1/productos') && method === 'GET') {
        if (urlStr.includes('fail=true')) {
          return new Response(JSON.stringify({ message: 'DB Error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }
        
        return new Response(JSON.stringify([
          {
            id_producto: 1,
            nombre_producto: 'Sopa',
            precio_unitario: '1.50',
            esta_activo: true,
            descripcion: null,
            id_categoria: 10,
            categorias_productos: null
          },
          {
            id_producto: 2,
            nombre_producto: 'Seco',
            precio_unitario: '3.00',
            esta_activo: true,
            descripcion: 'Delicioso',
            id_categoria: 20,
            categorias_productos: { nombre_categoria: 'Plato Fuerte' }
          }
        ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      // 5. POST /rest/v1/productos
      if (urlStr.includes('/rest/v1/productos') && method === 'POST') {
        return new Response(JSON.stringify(
          { id_producto: 3, nombre_producto: 'Gaseosa', precio_unitario: '1.25' }
        ), { status: 201, headers: { 'Content-Type': 'application/json' } });
      }

      // 6. PATCH /rest/v1/productos (Actualizar)
      if (urlStr.includes('/rest/v1/productos') && method === 'PATCH') {
        return new Response(JSON.stringify(
          { id_producto: 1, precio_unitario: '2.00', esta_activo: false }
        ), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      // 7. DELETE /rest/v1/productos
      if (urlStr.includes('/rest/v1/productos') && method === 'DELETE') {
        if (urlStr.includes('id_producto=eq.999')) {
          return new Response(JSON.stringify({ code: '23503' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }
        if (urlStr.includes('id_producto=eq.888')) {
          return new Response(JSON.stringify({ code: '12345', message: 'Other DB Error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify([{}]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/productos', () => {
    it('Retorna la lista de productos correctamente formateada', async () => {
      const res = await request(app).get('/api/productos').set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(2);
      expect(res.body[0].descripcion).toBe(''); // Formateado a vacío
      expect(res.body[0].categoria_nombre).toBe('Sin categoría'); // Fallback
      expect(res.body[1].categoria_nombre).toBe('Plato Fuerte');
      expect(res.body[1].precio).toBe(3.00); // Parseado a Float
    });
  });

  describe('POST /api/productos (Creación)', () => {
    it('Crea un producto correctamente con datos válidos', async () => {
      const payload = {
        nombre: 'Gaseosa',
        precio: 1.25,
        id_categoria: 30
      };

      const res = await request(app)
        .post('/api/productos')
        .set('Authorization', 'Bearer valid-token')
        .send(payload);

      if (res.body.id === undefined) {
        console.log('POST Response Body:', res.body);
      }

      expect(res.status).toBe(201);
      expect(res.body.id).toBe(3);
      expect(res.body.precio).toBe(1.25);
    });

    it('Rechaza creación si el precio es negativo (Valores límite Zod)', async () => {
      const payloads = [
        { nombre: 'Invalido', precio: -0.01, id_categoria: 10 },
        { nombre: 'Invalido', precio: -5, id_categoria: 10 }
      ];

      for (const p of payloads) {
        const res = await request(app).post('/api/productos').set('Authorization', 'Bearer valid-token').send(p);
        expect(res.status).toBe(400); // Zod tira 400
        expect(res.body.detalles).toBeDefined();
      }
    });

    it('Acepta creación si el precio es 0.01 (Límite inferior Zod)', async () => {
      const payload = {
        nombre: 'Promo',
        precio: 0.01,
        id_categoria: 10
      };

      const res = await request(app).post('/api/productos').set('Authorization', 'Bearer valid-token').send(payload);
      expect(res.status).toBe(201);
    });
  });

  describe('PUT /api/productos/:id (Actualización)', () => {
    it('Actualiza campos parciales de un producto', async () => {
      const payload = {
        precio: 2.00,
        activo: false
      };

      const res = await request(app)
        .put('/api/productos/1')
        .set('Authorization', 'Bearer valid-token')
        .send(payload);

      if (res.body.precio === undefined) {
        console.log('PUT Response Body:', res.body);
      }

      expect(res.status).toBe(200);
      expect(res.body.precio).toBe(2);
      expect(res.body.activo).toBe(false);
    });
  });

  describe('DELETE /api/productos/:id', () => {
    it('Elimina un producto correctamente', async () => {
      const res = await request(app).delete('/api/productos/1').set('Authorization', 'Bearer valid-token');
      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/eliminado/i);
    });

    it('Retorna 400 sugiriendo desactivar si hay violación de FK (23503)', async () => {
      const res = await request(app).delete('/api/productos/999').set('Authorization', 'Bearer valid-token');
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Se recomienda desactivarlo/i);
    });

    it('Retorna 500 para cualquier otro error de BD en DELETE', async () => {
      const res = await request(app).delete('/api/productos/888').set('Authorization', 'Bearer valid-token');
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Other DB Error');
    });
  });
});
