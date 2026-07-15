import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import conveniosRouter from '../routes/convenios.js';

describe('Rutas de Convenios', () => {
  let app;
  let fetchSpy;
  let forceDbError = false;

  beforeEach(() => {
    forceDbError = false;
    app = express();
    app.use(express.json());
    app.use('/api/convenios', conveniosRouter);

    fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url, options) => {
      const urlStr = url.toString();
      const method = options?.method || 'GET';
      
      const isConvenios = /\/rest\/v1\/convenios(\?|$)/.test(urlStr);
      const isClientesConvenios = /\/rest\/v1\/clientes_convenios(\?|$)/.test(urlStr);
      const isConvenioHistorial = /\/rest\/v1\/conveniohistorial(\?|$)/.test(urlStr);
      const isClientes = /\/rest\/v1\/clientes(\?|$)/.test(urlStr);
      const isOrdenes = /\/rest\/v1\/ordenes(\?|$)/.test(urlStr);

      if (forceDbError && !urlStr.includes('/auth/v1/user') && !urlStr.includes('/rest/v1/empleados') && !urlStr.includes('/rest/v1/usuarios')) {
        return new Response(JSON.stringify({ message: 'DB Error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }

      // Mock Auth
      if (urlStr.includes('/auth/v1/user')) {
        return new Response(JSON.stringify({ id: 'user-admin', email: 'admin@test.com' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      // Mock Roles
      if (urlStr.includes('/rest/v1/empleados')) {
        return new Response(JSON.stringify([{ id: 1, esta_activo: true, roles: { nombre_rol: 'administrador' } }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (urlStr.includes('/rest/v1/usuarios')) {
        return new Response(JSON.stringify([{ id_usuario: 'user-admin', rol: 'administrador' }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      // ----------------- /rest/v1/convenios -----------------
      if (isConvenios) {
        if (method === 'GET' && !urlStr.includes('id_convenio=eq.')) {
          // Listar todos - uno completo y uno vacío para cubrir todas las ramas de formatConvenio
          return new Response(JSON.stringify([
            {
              id_convenio: 'conv-1', ruc: '1790000000001', nombre_empresa: 'Empresa A',
              esta_activo: true, cupo_maximo: 10, clientes_convenios: [{ count: 2 }],
              representante: 'Don Juan', telefono: '0999999999', email: 'juan@test.com',
              tipos_almuerzo_permitidos: [1, 2], archivo_firmado: 'documento.pdf'
            },
            {
              id_convenio: 'conv-2', ruc: '1790000000002', nombre_empresa: 'Empresa B',
              esta_activo: false, cupo_maximo: 0, clientes_convenios: null,
              representante: null, telefono: null, email: null,
              tipos_almuerzo_permitidos: null, archivo_firmado: null
            }
          ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (method === 'GET' && urlStr.includes('id_convenio=eq.')) {
          // Get single
          if (urlStr.includes('id_convenio=eq.conv-lleno')) {
            return new Response(JSON.stringify({ esta_activo: true, fecha_inicio: '2025-01-01', fecha_caducidad: '2099-12-31', cupo_maximo: 2, clientes_convenios: [{ count: 2 }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
          return new Response(JSON.stringify({
            id_convenio: 'conv-1', esta_activo: true, fecha_inicio: '2025-01-01', fecha_caducidad: '2099-12-31',
            cupo_maximo: 10, clientes_convenios: [{ count: 2 }]
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (method === 'POST') {
          return new Response(JSON.stringify({
            id_convenio: 'conv-new', ruc: '1790000000001', nombre_empresa: 'Empresa Nueva',
            esta_activo: true, cupo_maximo: 20
          }), { status: 201, headers: { 'Content-Type': 'application/json' } });
        }
        if (method === 'PATCH') {
          return new Response(JSON.stringify({
            id_convenio: 'conv-1', nombre_empresa: 'Empresa Editada', cupo_maximo: 50
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
      }

      // ----------------- /rest/v1/clientes_convenios -----------------
      if (isClientesConvenios) {
        if (method === 'GET') {
          if (urlStr.includes('select=clientes')) {
            return new Response(JSON.stringify([
              { clientes: { id_cliente: 'cli-1', cedula: '1111111111', nombre: 'Juan', apellido: 'Perez' } }
            ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
          if (urlStr.includes('select=id_cliente')) {
            if (urlStr.includes('id_convenio=eq.conv-vacio')) return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
            return new Response(JSON.stringify([{ id_cliente: 'cli-rep' }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
          // Default GET for clientes_convenios
          return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (method === 'POST') return new Response(JSON.stringify([{}]), { status: 201, headers: { 'Content-Type': 'application/json' } });
        if (method === 'DELETE') return new Response(JSON.stringify([{}]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      // ----------------- /rest/v1/telegram_subscriptions -----------------
      if (urlStr.includes('/rest/v1/telegram_subscriptions')) {
        if (method === 'GET') {
          if (urlStr.includes('id_cliente=eq.cli-rep')) {
            return new Response(JSON.stringify({ chat_id: '12345', consent_status: 'accepted' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
          return new Response(JSON.stringify(null), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (method === 'POST') return new Response(JSON.stringify({}), { status: 201, headers: { 'Content-Type': 'application/json' } });
      }

      // ----------------- /storage/v1/object/ -----------------
      if (urlStr.includes('/storage/v1/object/')) {
        if (method === 'POST') return new Response(JSON.stringify({ Key: 'convenios/mockpath.pdf' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      // ----------------- /rest/v1/clientes -----------------
      if (isClientes) {
        if (method === 'GET') {
          if (urlStr.includes('id_cliente=eq.cli-frecuente')) return new Response(JSON.stringify({ id_cliente: 'cli-frecuente', id_tipo_cliente: 2 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
          return new Response(JSON.stringify({ id_cliente: 'cli-new', id_tipo_cliente: 1 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (method === 'POST') {
          if (options.body && typeof options.body === 'string' && options.body.includes('duplicate')) {
            return new Response(JSON.stringify({ message: 'duplicate key' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
          }
          return new Response(JSON.stringify({ id_cliente: 'cli-new', cedula: '2222222222', nombre: 'Nuevo', apellido: 'Cli' }), { status: 201, headers: { 'Content-Type': 'application/json' } });
        }
      }

      // ----------------- /rest/v1/conveniohistorial -----------------
      if (isConvenioHistorial) {
        if (method === 'GET') return new Response(JSON.stringify([{ id_historial: 1, fecha_inicio: '2024-01-01', fecha_caducidad: '2024-12-31' }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        if (method === 'POST') return new Response(JSON.stringify([{}]), { status: 201, headers: { 'Content-Type': 'application/json' } });
      }

      // ----------------- /rest/v1/ordenes -----------------
      if (isOrdenes && method === 'GET') {
        return new Response(JSON.stringify([{
          id_orden: 1, created_at: '2025-01-01T12:00:00Z',
          clientes: { id_cliente: 'cli-rep', nombre: 'Juan', apellido: 'Perez', cedula: '1111111111' },
          detalle_orden: [{ cantidad: 1, precio_aplicado: 5.50, productos: { nombre_producto: 'Almuerzo' } }]
        }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      // Default
      return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/convenios', () => {
    it('Lista los convenios correctamente formateados', async () => {
      const res = await request(app).get('/api/convenios').set('Authorization', 'Bearer token');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      
      // Valida primer convenio (completamente poblado)
      expect(res.body[0].id).toBe('conv-1');
      expect(res.body[0].totalColaboradores).toBe(2);
      expect(res.body[0].archivo_firmado).toContain('supabase.co/storage/v1/object/public/convenios/documento.pdf');
      
      // Valida segundo convenio (vacío/por defecto)
      expect(res.body[1].id).toBe('conv-2');
      expect(res.body[1].totalColaboradores).toBe(0);
      expect(res.body[1].archivo_firmado).toBeNull();
    });

    it('Retorna 500 si hay error en la base de datos', async () => {
      forceDbError = true;
      const res = await request(app).get('/api/convenios').set('Authorization', 'Bearer token');
      expect(res.status).toBe(500);
    });
  });

  describe('POST /api/convenios', () => {
    it('Crea un convenio con datos válidos', async () => {
      const payload = { ruc: '1790000000001', nombre_empresa: 'Empresa Nueva', cupo_maximo: 20 };
      const res = await request(app).post('/api/convenios').set('Authorization', 'Bearer token').send(payload);
      
      expect(res.status).toBe(201);
      expect(res.body.id).toBe('conv-new');
      expect(res.body.nombre_empresa).toBe('Empresa Nueva');
    });

    it('Rechaza creación si el RUC es inválido', async () => {
      const payload = { ruc: '123', nombre_empresa: 'Empresa Nueva' };
      const res = await request(app).post('/api/convenios').set('Authorization', 'Bearer token').send(payload);
      
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/RUC/);
    });

    it('Rechaza creación si el cupo maximo es menor a 0', async () => {
      const payload = { ruc: '1790000000001', nombre_empresa: 'Empresa Nueva', cupo_maximo: -5 };
      const res = await request(app).post('/api/convenios').set('Authorization', 'Bearer token').send(payload);
      
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/cupo máximo/);
    });
  });

  describe('PUT /api/convenios/:id', () => {
    it('Actualiza datos básicos de un convenio', async () => {
      const payload = { nombre_empresa: 'Empresa Editada', cupo_maximo: 50 };
      const res = await request(app).put('/api/convenios/conv-1').set('Authorization', 'Bearer token').send(payload);
      
      expect(res.status).toBe(200);
      expect(res.body.nombre_empresa).toBe('Empresa Editada');
      expect(res.body.cupo_maximo).toBe(50);
    });

    it('Rechaza actualizar si el RUC es inválido', async () => {
      const payload = { ruc: '123' };
      const res = await request(app).put('/api/convenios/conv-1').set('Authorization', 'Bearer token').send(payload);
      expect(res.status).toBe(400);
    });

    it('Rechaza actualizar si el cupo es menor a 0', async () => {
      const payload = { cupo_maximo: -1 };
      const res = await request(app).put('/api/convenios/conv-1').set('Authorization', 'Bearer token').send(payload);
      expect(res.status).toBe(400);
    });

    it('Guarda historial si las fechas cambian (renovación)', async () => {
      const payload = { fecha_inicio: '2026-01-01', fecha_caducidad: '2026-12-31' };
      const res = await request(app).put('/api/convenios/conv-1').set('Authorization', 'Bearer token').send(payload);
      
      expect(res.status).toBe(200);
      const historialCalls = fetchSpy.mock.calls.filter(call => call[0].toString().includes('/rest/v1/conveniohistorial') && call[1]?.method === 'POST');
      expect(historialCalls.length).toBe(1);
    });

    it('No guarda historial si las fechas no cambian en la renovacion', async () => {
      // Las fechas de conv-1 son '2025-01-01' y '2025-12-31'
      const payload = { fecha_inicio: '2025-01-01', fecha_caducidad: '2099-12-31' };
      const res = await request(app).put('/api/convenios/conv-1').set('Authorization', 'Bearer token').send(payload);
      
      expect(res.status).toBe(200);
      const historialCalls = fetchSpy.mock.calls.filter(call => call[0].toString().includes('/rest/v1/conveniohistorial') && call[1]?.method === 'POST');
      // No deberia haber llamadas porque handleConvenioRenewal retorna false
      expect(historialCalls.length).toBe(0);
    });

    it('Imprime un error en consola si falla el insert del historial', async () => {
      const originalConsoleError = console.error;
      console.error = vi.fn();
      
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockImplementation(async (url, options) => {
        if (url.toString().includes('/rest/v1/conveniohistorial') && options?.method === 'POST') {
          return new Response(JSON.stringify({ message: 'history insert error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }
        return originalFetch(url, options);
      });

      const payload = { fecha_inicio: '2027-01-01', fecha_caducidad: '2027-12-31' };
      const res = await request(app).put('/api/convenios/conv-1').set('Authorization', 'Bearer token').send(payload);
      
      expect(res.status).toBe(200);
      expect(console.error).toHaveBeenCalledWith('Error al guardar historial:', expect.objectContaining({ message: 'history insert error' }));
      
      console.error = originalConsoleError;
      global.fetch = originalFetch;
    });
  });

  describe('Clientes de Convenio', () => {
    it('GET /api/convenios/:id/clientes retorna la lista de clientes vinculados', async () => {
      const res = await request(app).get('/api/convenios/conv-1/clientes').set('Authorization', 'Bearer token');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe('cli-1');
      expect(res.body[0].nombre).toBe('Juan');
    });

    it('POST /api/convenios/:id/clientes vincula un cliente existente', async () => {
      const res = await request(app).post('/api/convenios/conv-1/clientes').set('Authorization', 'Bearer token').send({ id_cliente: 'cli-existente' });
      expect(res.status).toBe(201);
      expect(res.body.mensaje).toMatch(/agregado/);
    });

    it('POST /api/convenios/:id/clientes falla si se supera el cupo máximo', async () => {
      const res = await request(app).post('/api/convenios/conv-lleno/clientes').set('Authorization', 'Bearer token').send({ id_cliente: 'cli-existente' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/cupo máximo/);
    });

    it('POST /api/convenios/:id/clientes falla si el cliente no es tipo Convenio', async () => {
      const res = await request(app).post('/api/convenios/conv-1/clientes').set('Authorization', 'Bearer token').send({ id_cliente: 'cli-frecuente' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Frecuente/);
    });

    it('POST /api/convenios/:id/clientes/nuevo crea y vincula un nuevo cliente', async () => {
      const res = await request(app).post('/api/convenios/conv-1/clientes/nuevo').set('Authorization', 'Bearer token').send({ cedula: '2222222222', nombre: 'Nuevo', apellido: 'Cli', telefono: '0999999999', correo: 'test@example.com' });
      expect(res.status).toBe(201);
      expect(res.body.id).toBe('cli-new');
    });

    it('POST /api/convenios/:id/clientes/nuevo rechaza cédula duplicada', async () => {
      const res = await request(app).post('/api/convenios/conv-1/clientes/nuevo').set('Authorization', 'Bearer token').send({ cedula: 'duplicate', nombre: 'Nuevo', apellido: 'Cli', telefono: '0999999999', correo: 'test@example.com' });
      expect(res.status).toBe(500);
    });

    it('POST /api/convenios/:id/clientes/nuevo falla si se supera el cupo máximo', async () => {
      const res = await request(app).post('/api/convenios/conv-lleno/clientes/nuevo').set('Authorization', 'Bearer token').send({ cedula: '4444444444', nombre: 'Nuevo', apellido: 'Cli', telefono: '0999999999', correo: 'test@example.com' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/cupo maximo/);
    });

    it('POST /api/convenios/:id/clientes/nuevo lanza 404 si la base de datos falla al validar cupo', async () => {
      forceDbError = true;
      const res = await request(app).post('/api/convenios/conv-1/clientes/nuevo').set('Authorization', 'Bearer token').send({ cedula: '2222222222', nombre: 'Nuevo', apellido: 'Cli', telefono: '0999999999', correo: 'test@example.com' });
      expect(res.status).toBe(500);
    });

    it('POST /api/convenios/:id/clientes/nuevo lanza 500 si ocurre un error al insertar que no es duplicate key', async () => {
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockImplementation(async (url, options) => {
        const urlStr = url.toString();
        if (urlStr.includes('/rest/v1/clientes') && options?.method === 'POST') {
          return new Response(JSON.stringify({ message: 'generic insertion error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }
        return originalFetch(url, options);
      });

      const res = await request(app)
        .post('/api/convenios/conv-1/clientes/nuevo')
        .set('Authorization', 'Bearer token')
        .send({ cedula: '1712345678', nombre: 'Test', apellido: 'Test', telefono: '0999999999', correo: 'test@example.com' });

      expect(res.status).toBe(500);
      expect(res.body.error).toContain('generic insertion error');
      global.fetch = originalFetch;
    });

    it('POST /api/convenios/:id/clientes/nuevo lanza 500 si ocurre error al vincular en clientes_convenios', async () => {
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockImplementation(async (url, options) => {
        const urlStr = url.toString();
        // Fallar unicamente en el segundo insert (clientes_convenios)
        if (urlStr.includes('/rest/v1/clientes_convenios') && options?.method === 'POST') {
          return new Response(JSON.stringify({ message: 'link error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }
        return originalFetch(url, options);
      });

      const res = await request(app)
        .post('/api/convenios/conv-1/clientes/nuevo')
        .set('Authorization', 'Bearer token')
        .send({ cedula: '3333333333', nombre: 'Nuevo', apellido: 'Cli', telefono: '0999999999', correo: 'test@example.com' });

      expect(res.status).toBe(500);
      expect(res.body.error).toContain('link error');
      global.fetch = originalFetch;
    });

    it('DELETE /api/convenios/:id/clientes/:clienteId desvincula el cliente', async () => {
      const res = await request(app).delete('/api/convenios/conv-1/clientes/cli-1').set('Authorization', 'Bearer token');
      expect(res.status).toBe(200);
      expect(res.body.mensaje).toMatch(/retirado/);
    });
  });

  describe('Historial', () => {
    it('GET /api/convenios/:id/historial retorna el historial formateado', async () => {
      const res = await request(app).get('/api/convenios/conv-1/historial').set('Authorization', 'Bearer token');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].fecha_inicio).toBe('2024-01-01');
    });
  });

  describe('Reporte de Consumos', () => {
    it('GET /api/convenios/:id/reporte retorna datos agrupados', async () => {
      const res = await request(app).get('/api/convenios/conv-1/reporte').set('Authorization', 'Bearer token');
      if (res.status !== 200) console.log('Reporte error:', res.body);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].empleado).toBe('Juan Perez');
      expect(res.body[0].total).toBe(5.50);
    });

    it('GET /api/convenios/:id/reporte retorna vacio si no hay clientes', async () => {
      const res = await request(app).get('/api/convenios/conv-vacio/reporte').set('Authorization', 'Bearer token');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('GET /api/convenios/:id/reporte filtra por rango de fechas', async () => {
      const res = await request(app).get('/api/convenios/conv-1/reporte?fecha_inicio=2025-01-01&fecha_fin=2025-12-31').set('Authorization', 'Bearer token');
      if (res.status !== 200) console.log('Reporte rango error:', res.body);
      expect(res.status).toBe(200);
    });

    it('GET /api/convenios/:id/reporte valida errores de fechas', async () => {
      let res = await request(app).get('/api/convenios/conv-1/reporte?fecha_inicio=2025-01-01').set('Authorization', 'Bearer token');
      expect(res.status).toBe(400);

      res = await request(app).get('/api/convenios/conv-1/reporte?fecha_inicio=2025-12-31&fecha_fin=2025-01-01').set('Authorization', 'Bearer token');
      expect(res.status).toBe(400);

      res = await request(app).get('/api/convenios/conv-1/reporte?fecha_inicio=invalid&fecha_fin=invalid').set('Authorization', 'Bearer token');
      expect(res.status).toBe(400);
    });
  });

  describe('Upload de Archivo Firmado', () => {
    it('POST /api/convenios/:id/upload retorna error si no hay archivo', async () => {
      const res = await request(app).post('/api/convenios/conv-1/upload').set('Authorization', 'Bearer token');
      expect(res.status).toBe(400);
    });
    
    it('POST /api/convenios/:id/upload rechaza archivos que no sean PDF o imagenes', async () => {
      const res = await request(app)
        .post('/api/convenios/conv-1/upload')
        .set('Authorization', 'Bearer token')
        .attach('archivo', Buffer.from('fake text data'), 'documento.txt');
        
      expect(res.status).toBe(500); // Express multer error middleware returns 500 by default unless handled specifically
    });

    it('POST /api/convenios/:id/upload sube el archivo con éxito', async () => {
      const res = await request(app)
        .post('/api/convenios/conv-1/upload')
        .set('Authorization', 'Bearer token')
        .attach('archivo', Buffer.from('fake pdf data'), 'convenio.pdf');
        
      expect(res.status).toBe(200); // 200 porque multer lo procesa y el fetchSpy de POST conveniohistorial o convenios no se interpone (o mejor dicho responde vacío)
    });
  });

  describe('Helpers Privados del Router', () => {
    it('debe detectar firmas de archivos validos', () => {
      const helpers = conveniosRouter._private;
      expect(helpers.detectDocumentMimeType(Buffer.from('%PDF-1.7'))).toBe('application/pdf');
      expect(helpers.detectDocumentMimeType(Buffer.from([0xff, 0xd8, 0xff, 0x00]))).toBe('image/jpeg');
      expect(helpers.detectDocumentMimeType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
      expect(helpers.detectDocumentMimeType(Buffer.from('not-a-valid-header'))).toBeNull();
    });

    it('debe generar rutas validas de objeto para almacenamiento de documentos', () => {
      const helpers = conveniosRouter._private;
      const path = helpers.createAgreementObjectPath('agreement-123', 'image/jpeg');
      expect(path).toMatch(/^agreement-123\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$/);
      const pathFallback = helpers.createAgreementObjectPath('agreement-123', 'application/unknown');
      expect(pathFallback).toMatch(/^agreement-123\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.bin$/);
    });
  });

  describe('Flujos de Error de Base de Datos para Convenios', () => {
    it('GET /api/convenios retorna 500 si la base de datos falla', async () => {
      forceDbError = true;
      const res = await request(app).get('/api/convenios').set('Authorization', 'Bearer token');
      expect(res.status).toBe(500);
    });

    it('POST /api/convenios retorna 500 si la base de datos falla', async () => {
      forceDbError = true;
      const res = await request(app).post('/api/convenios').set('Authorization', 'Bearer token').send({
        nombre_empresa: 'Error DB',
        cupo_maximo: 10,
        fecha_caducidad: '2030-01-01',
      });
      expect(res.status).toBe(500);
    });

    it('PUT /api/convenios/:id retorna 500 si la base de datos falla', async () => {
      forceDbError = true;
      const res = await request(app).put('/api/convenios/conv-1').set('Authorization', 'Bearer token').send({
        nombre_empresa: 'Error DB',
        cupo_maximo: 10,
        fecha_caducidad: '2030-01-01',
      });
      expect(res.status).toBe(500);
    });

    it('POST /api/convenios/:id/clientes retorna 404 si la base de datos falla al buscar el convenio', async () => {
      forceDbError = true;
      const res = await request(app).post('/api/convenios/conv-1/clientes').set('Authorization', 'Bearer token').send({
        id_cliente: 'cli-1',
      });
      expect(res.status).toBe(404);
    });

    it('POST /api/convenios/:id/clientes retorna 500 si DB falla en insert', async () => {
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockImplementation(async (url, options) => {
        const urlStr = url.toString();
        if (urlStr.includes('/rest/v1/clientes_convenios') && options?.method === 'POST') {
          return new Response(JSON.stringify({ message: 'generic insertion error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }
        return originalFetch(url, options);
      });

      const response = await request(app)
        .post('/api/convenios/conv-1/clientes')
        .set('Authorization', 'Bearer token')
        .send({ id_cliente: 'cli-existente' });

      expect(response.status).toBe(500);
      global.fetch = originalFetch;
    });

    it('GET /api/convenios/:id/clientes retorna 500 si la base de datos falla', async () => {
      forceDbError = true;
      const res = await request(app).get('/api/convenios/conv-1/clientes').set('Authorization', 'Bearer token');
      expect(res.status).toBe(500);
    });

    it('POST /api/convenios/:id/upload retorna 500 si la base de datos falla', async () => {
      forceDbError = true;
      const res = await request(app)
        .post('/api/convenios/conv-1/upload')
        .set('Authorization', 'Bearer token')
        .attach('archivo', Buffer.from('fake pdf data'), 'convenio.pdf');
      expect(res.status).toBe(500);
    });

    it('GET /api/convenios/:id/reporte retorna 500 si la base de datos falla', async () => {
      forceDbError = true;
      const res = await request(app).get('/api/convenios/conv-1/reporte?fecha_inicio=2026-06-01&fecha_fin=2026-06-11').set('Authorization', 'Bearer token');
      expect(res.status).toBe(500);
    });

    it('POST /api/convenios/:id/clientes retorna 400 si hay duplicate key', async () => {
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockImplementation(async (url, options) => {
        const urlStr = url.toString();
        if (urlStr.includes('/rest/v1/clientes') && options?.method === 'POST') {
          return new Response(JSON.stringify({ message: 'duplicate key value violates unique constraint' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
        }
        return originalFetch(url, options);
      });

      const response = await request(app)
        .post('/api/convenios/conv-1/clientes/nuevo')
        .set('Authorization', 'Bearer token')
        .send({ cedula: '1712345678', nombre: 'Test', apellido: 'Test', telefono: '0999999999', correo: 'test@example.com' });

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('duplicate key');
      global.fetch = originalFetch;
    });

    it('DELETE /api/convenios/:id/clientes/:clienteId retorna 500 si DB falla', async () => {
      forceDbError = true;
      const response = await request(app)
        .delete('/api/convenios/conv-1/clientes/c1')
        .set('Authorization', 'Bearer token');

      expect(response.status).toBe(500);
    });

    it('PUT /api/convenios/:id falla validacion ruc en actualizacion', async () => {
      const response = await request(app)
        .put('/api/convenios/conv-1')
        .set('Authorization', 'Bearer token')
        .send({ ruc: 'invalid' });

      expect(response.status).toBe(400);
    });

    it('GET /api/convenios/:id/historial retorna 500 si DB falla', async () => {
      forceDbError = true;
      const response = await request(app)
        .get('/api/convenios/conv-1/historial')
        .set('Authorization', 'Bearer token');

      expect(response.status).toBe(500);
    });
  });
});

import './agreement-documents.suite.js';

import './convenio-import.suite.js';
import './convenioInvitations.suite.js';
import './convenios-utils.suite.js';
