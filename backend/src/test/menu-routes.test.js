import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
let store;
let writes;

const makeClient = () => {
  class Q {
    constructor(table) {
      this.t = table;
      this.f = [];
      this.op = 'select';
      this.payload = null;
      this.lim = null;
    }
    select() { return this; }
    insert(p) { this.op = 'insert'; this.payload = p; return this; }
    update(p) { this.op = 'update'; this.payload = p; return this; }
    upsert(p) { this.op = 'upsert'; this.payload = p; return this; }
    delete() { this.op = 'delete'; return this; }
    eq(c, v) { this.f.push(['eq', c, v]); return this; }
    neq(c, v) { this.f.push(['neq', c, v]); return this; }
    gte(c, v) { this.f.push(['gte', c, v]); return this; }
    lte(c, v) { this.f.push(['lte', c, v]); return this; }
    ilike(c, v) { this.f.push(['ilike', c, v]); return this; }
    in(c, v) { this.f.push(['in', c, v]); return this; }
    order() { return this; }
    limit(n) { this.lim = n; return this; }
    _rows() {
      let rows = (store[this.t] || []).slice();
      for (const [op, c, v] of this.f) {
        if (op === 'eq') rows = rows.filter((r) => String(r[c]) === String(v));
        else if (op === 'neq') rows = rows.filter((r) => String(r[c]) !== String(v));
        else if (op === 'ilike') rows = rows.filter((r) => String(r[c] || '').toLowerCase() === String(v || '').toLowerCase());
        else if (op === 'in') rows = rows.filter((r) => v.map(String).includes(String(r[c])));
        else if (op === 'gte') rows = rows.filter((r) => new Date(r[c]) >= new Date(v));
        else if (op === 'lte') rows = rows.filter((r) => new Date(r[c]) <= new Date(v));
      }
      if (this.lim != null) rows = rows.slice(0, this.lim);
      return rows;
    }
    _record() { writes.push({ table: this.t, op: this.op, payload: this.payload, filters: this.f }); }
    maybeSingle() { 
      if (mocks.forceDbError) return Promise.resolve({ data: null, error: { message: 'DB Error' } });
      return Promise.resolve({ data: this._rows()[0] || null, error: null }); 
    }
    single() {
      if (this.op === 'insert') {
        this._record();
        const base = Array.isArray(this.payload) ? this.payload[0] : this.payload;
        return Promise.resolve({ data: { id_alimento: writes.length, ...base }, error: null });
      }
      return Promise.resolve({ data: this._rows()[0] || null, error: null });
    }
    then(resolve, reject) { // NOSONAR - Intentional thenable to mock Supabase query builder
      if (this.op === 'select') return Promise.resolve({ data: this._rows(), error: null }).then(resolve, reject);
      this._record();
      return Promise.resolve({ error: null }).then(resolve, reject);
    }
  }
  return {
    from: (t) => new Q(t),
    rpc: (name, params) => {
      writes.push({ table: 'rpc', op: name, payload: params });
      return Promise.resolve({ data: { success: true }, error: null });
    }
  };
};

const mocks = vi.hoisted(() => ({
  fakeClient: null,
}));

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const originalCaches = {};
const injectModule = (relPath, exportsObj) => {
  const filename = require.resolve(relPath);
  if (!(filename in originalCaches)) {
    originalCaches[filename] = require.cache[filename];
  }
  require.cache[filename] = {
    id: filename,
    filename,
    loaded: true,
    exports: exportsObj,
    children: [],
    paths: [],
  };
};

injectModule('../config/supabase.js', {
  getAdminClient: () => mocks.fakeClient
});

injectModule('../middlewares/authMiddleware.js', (req, _res, next) => {
  req.user = { id: 'u1', email: 'admin@example.com', rol: 'administrador' };
  next();
});

injectModule('../middlewares/roleMiddleware.js', () => {
  return (_req, _res, next) => next();
});

injectModule('../services/menuImageCleanup.js', {
  cleanupOldMenuImages: async () => ({ removed: 0 })
});

let app;
const TODAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Bogota',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());

afterAll(() => {
  for (const [filename, orig] of Object.entries(originalCaches)) {
    if (orig) require.cache[filename] = orig;
    else delete require.cache[filename];
  }
  delete process.env.N8N_MENU_WEBHOOK_SECRET;
});

beforeAll(() => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  process.env.N8N_MENU_WEBHOOK_SECRET = 'secret-test';

  const menuRouter = require('../routes/menu.js');
  app = express();
  app.use(express.json());
  app.use('/api/menu', menuRouter);
});

afterAll(() => {
  delete process.env.N8N_MENU_WEBHOOK_SECRET;
});

afterEach(() => { mocks.forceDbError = false; });
beforeEach(() => {
  store = {
    categorias_menu: [
      { id_categoria_menu: 1, nombre_categoria: 'Sopas' },
      { id_categoria_menu: 2, nombre_categoria: 'Segundos' },
      { id_categoria_menu: 3, nombre_categoria: 'Guarniciones' },
    ],
  };
  writes = [];
  mocks.fakeClient = makeClient();
});

const menuRow = (fecha, nombre, categoriaId, categoriaNombre, imagen = null) => ({
  fecha,
  imagen_url: imagen,
  alimentos: {
    nombre_alimento: nombre,
    id_categoria_menu: categoriaId,
    categorias_menu: { nombre_categoria: categoriaNombre, id_categoria_menu: categoriaId },
  },
});

const validBody = {
  opciones: { '1': ['Locro'], '2': ['Seco de pollo'], '3': ['Arroz'] },
};

const incompleteBody = { opciones: {} };

describe('routes/menu — sistema y dashboard', () => {
  it('POST /system/expirar-activo expira el menu activo con el secreto correcto', async () => {
    store.menu_settings = [{ id: 1, active_date: '2026-06-20', image_retention_days: 14 }];

    const res = await request(app)
      .post('/api/menu/system/expirar-activo')
      .set('X-Ecencia-Webhook-Secret', 'secret-test')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ previousActiveDate: '2026-06-20' });
    expect(writes.some((w) => w.table === 'menu_settings' && w.op === 'update')).toBe(true);
    expect(writes.some((w) => w.table === 'telegram_bot_state' && w.op === 'delete')).toBe(true);
  });

  it('GET / agrupa los menus por fecha con estado y datos de envio', async () => {
    store.menu_diario = [
      menuRow('2026-06-10', 'Locro', 1, 'Sopas', 'http://img/x.png'),
      menuRow('2026-06-10', 'Seco de pollo', 2, 'Segundos'),
      menuRow('2026-06-10', 'Arroz', 3, 'Guarniciones'),
    ];
    store.menu_settings = [{ id: 1, active_date: '2026-06-10' }];
    store.menu_envios = [{ fecha: '2026-06-10', last_sent_at: '2026-06-10T14:00:00.000Z', send_count: 2 }];

    const res = await request(app).get('/api/menu/');

    expect(res.status).toBe(200);
    expect(res.body.menus).toHaveLength(1);
    expect(res.body.menus[0]).toMatchObject({
      fecha: '2026-06-10',
      estado: 'activo',
      sopas: ['Locro'],
      segundos: ['Seco de pollo'],
      guarniciones: ['Arroz'],
      enviado: true,
      send_count: 2,
    });
  });

  it('GET /activo retorna el menu activo', async () => {
    store.menu_settings = [{ id: 1, active_date: '2026-06-10' }];
    store.menu_diario = [
      menuRow('2026-06-10', 'Locro', 1, 'Sopas'),
      menuRow('2026-06-10', 'Seco de pollo', 2, 'Segundos'),
    ];

    const res = await request(app).get('/api/menu/activo');
    expect(res.status).toBe(200);
    expect(res.body.fecha).toBe('2026-06-10');
  });

  it('GET /activo retorna 404 si no hay menu activo', async () => {
    store.menu_settings = [];
    const res = await request(app).get('/api/menu/activo');
    expect(res.status).toBe(404);
  });

  it('GET /activo retorna 404 si el menu activo no tiene opciones registradas', async () => {
    store.menu_settings = [{ id: 1, active_date: '2026-06-10' }];
    store.menu_diario = [];
    const res = await request(app).get('/api/menu/activo');
    expect(res.status).toBe(404);
  });

  it('POST /:fecha/activar activa el menu', async () => {
    store.menu_diario = [
      menuRow('2026-06-10', 'Locro', 1, 'Sopas'),
      menuRow('2026-06-10', 'Seco de pollo', 2, 'Segundos'),
    ];
    store.menu_settings = [{ id: 1 }];

    const res = await request(app).post('/api/menu/2026-06-10/activar');
    expect(res.status).toBe(200);
    
    // Verifica que se haya actualizado menu_settings con la nueva fecha
    const updateOp = writes.find(w => w.table === 'menu_settings' && w.op === 'upsert' && w.payload.active_date === '2026-06-10');
    expect(updateOp).toBeDefined();
  });

  it('POST /:fecha/activar retorna 400 si falta sopa o segundo', async () => {
    store.menu_diario = [
      menuRow('2026-06-10', 'Locro', 1, 'Sopas') // Falta segundo
    ];
    const res = await request(app).post('/api/menu/2026-06-10/activar');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('al menos sopa y segundo');
  });

  it('POST /:fecha/activar retorna 404 si no existe menu en la fecha', async () => {
    store.menu_diario = [];
    const res = await request(app).post('/api/menu/2026-06-10/activar');
    expect(res.status).toBe(404);
  });

  it('PUT /:fecha rechaza una fecha con formato invalido', async () => {
    const res = await request(app).put('/api/menu/no-es-fecha').send(validBody);
    expect(res.status).toBe(400);
  });

  it('PUT /:fecha rechaza un menu incompleto', async () => {
    const res = await request(app)
      .put('/api/menu/2026-06-26')
      .send(incompleteBody);
    expect(res.status).toBe(400);
  });

  it('PUT /:fecha bloquea la edicion si el menu ya fue enviado', async () => {
    store.menu_envios = [{ fecha: '2026-06-25', last_sent_at: '2026-06-25T12:00:00.000Z' }];

    const res = await request(app).put('/api/menu/2026-06-25').send(validBody);

    expect(res.status).toBe(409);
    expect(res.body.sentAt).toBe('2026-06-25T12:00:00.000Z');
  });

  it('PUT /:fecha pide confirmacion si el menu esta activo', async () => {
    store.menu_envios = [];
    store.menu_settings = [{ id: 1, active_date: '2026-06-25' }];

    const res = await request(app).put('/api/menu/2026-06-25').send(validBody);

    expect(res.status).toBe(409);
    expect(res.body.requireConfirmation).toBe(true);
  });

  it('POST /enviar rechaza un menu incompleto', async () => {
    const res = await request(app).post('/api/menu/enviar').send(incompleteBody);
    expect(res.status).toBe(400);
  });

  it('POST /enviar bloquea el reenvio cuando el menu enviado hoy cambio sin force ni variables de entorno', async () => {
    store.menu_envios = [
      {
        fecha: TODAY,
        menu_payload: { opciones: { '1': ['Otra'], '2': ['Distinto'], '3': ['Cambio'] } },
        last_sent_at: `${TODAY}T11:00:00.000Z`,
      },
    ];

    const res = await request(app).post('/api/menu/enviar').send(validBody);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ALREADY_SENT_CONFIRM_REQUIRED');
    expect(res.body.sentAt).toBe(`${TODAY}T11:00:00.000Z`);
  });

  it('POST /enviar permite el reenvio cuando se envia force=true, cancelando ordenes', async () => {
    store.menu_envios = [
      {
        fecha: TODAY,
        menu_payload: { opciones: { '1': ['Vieja'] } },
        last_sent_at: `${TODAY}T11:00:00.000Z`,
      },
    ];
    store.ordenes = [
      { id_orden: 100, id_cliente: 'cli-1', id_origen: 1, created_at: `${TODAY}T12:00:00.000Z`, id_estado: 1 }
    ];
    store.telegram_subscriptions = [
      { chat_id: 'chat-1', id_cliente: 'cli-1', is_active: true }
    ];

    process.env.N8N_MENU_WEBHOOK_URL = 'https://n8n.example.test/webhook/menu';
    const originalFetch = global.fetch;
    global.fetch = async () => ({ ok: true, status: 200, text: async () => 'ok' });

    try {
      const res = await request(app).post('/api/menu/enviar').send({ ...validBody, force: true });
      expect(res.status).toBe(202);
      expect(res.body.reenvio).toBe(true);
      
      // Debe haber actualizado el estado de las ordenes a 3 (cancelado)
      const updateOp = writes.find(w => w.table === 'ordenes' && w.op === 'update' && w.payload.id_estado === 3);
      expect(updateOp).toBeDefined();
    } finally {
      global.fetch = originalFetch;
      delete process.env.N8N_MENU_WEBHOOK_URL;
    }
  });

  it('POST /enviar lanza error 500 si n8n responde con error', async () => {
    process.env.N8N_MENU_WEBHOOK_URL = 'https://n8n.example.test/webhook/menu';
    const originalFetch = global.fetch;
    global.fetch = async () => ({ ok: false, status: 400, text: async () => 'Bad Request' });

    try {
      const res = await request(app).post('/api/menu/enviar').send(validBody);
      expect(res.status).toBe(500);
      expect(res.body.error).toContain('n8n respondio 400');
    } finally {
      global.fetch = originalFetch;
      delete process.env.N8N_MENU_WEBHOOK_URL;
    }
  });

  it('POST /enviar permite el envio normal cuando no hay envios previos hoy', async () => {
    store.menu_envios = [];
    store.ordenes = [];
    store.telegram_subscriptions = [];

    process.env.N8N_MENU_WEBHOOK_URL = 'https://n8n.example.test/webhook/menu';
    const originalFetch = global.fetch;
    global.fetch = async () => ({ ok: true, status: 200, text: async () => 'ok' });

    try {
      const res = await request(app).post('/api/menu/enviar').send(validBody);
      expect(res.status).toBe(202);
      expect(res.body.reenvio).toBe(false);
      
      const insertOp = writes.find(w => w.table === 'menu_envios' && (w.op === 'insert' || w.op === 'upsert'));
      expect(insertOp).toBeDefined();
    } finally {
      global.fetch = originalFetch;
      delete process.env.N8N_MENU_WEBHOOK_URL;
    }
  });

  it('POST /enviar permite reenviar el mismo menu sin pedir confirmacion de cambios', async () => {
    store.menu_envios = [
      {
        fecha: TODAY,
        menu_payload: { opciones: { '1': ['Locro'], '2': ['Seco de pollo'], '3': ['Arroz'] } },
        last_sent_at: `${TODAY}T11:00:00.000Z`,
      },
    ];

    process.env.N8N_MENU_WEBHOOK_URL = 'https://n8n.example.test/webhook/menu';
    const originalFetch = global.fetch;
    global.fetch = async () => ({ ok: true, status: 200, text: async () => 'ok' });

    try {
      const res = await request(app).post('/api/menu/enviar').send(validBody);
      expect(res.status).toBe(202);
      expect(res.body.reenvio).toBe(true);
    } finally {
      global.fetch = originalFetch;
      delete process.env.N8N_MENU_WEBHOOK_URL;
    }
  });

  it('GET /config informa si la edicion post-envio esta habilitada', async () => {
    const off = await request(app).get('/api/menu/config');
    expect(off.status).toBe(200);
    expect(off.body).toEqual({ editAfterSend: false });

    process.env.ECENCIA_MENU_EDIT_AFTER_SEND = 'true';
    try {
      const on = await request(app).get('/api/menu/config');
      expect(on.body).toEqual({ editAfterSend: true });
    } finally {
      delete process.env.ECENCIA_MENU_EDIT_AFTER_SEND;
    }
  });

  it('PUT /:fecha permite editar un menu enviado con ECENCIA_MENU_EDIT_AFTER_SEND=true', async () => {
    process.env.ECENCIA_MENU_EDIT_AFTER_SEND = 'true';
    try {
      store.menu_envios = [{ fecha: '2026-06-25', last_sent_at: '2026-06-25T12:00:00.000Z' }];
      store.categorias_menu = [
        { id_categoria_menu: 1, nombre_categoria: 'Sopas' },
        { id_categoria_menu: 2, nombre_categoria: 'Segundos' },
        { id_categoria_menu: 3, nombre_categoria: 'Guarniciones' },
      ];

      const res = await request(app).put('/api/menu/2026-06-25').send(validBody);

      expect(res.status).toBe(200);
    } finally {
      delete process.env.ECENCIA_MENU_EDIT_AFTER_SEND;
    }
  });

  it('POST /enviar reenvia con cambios cuando el modo pruebas esta activo', async () => {
    process.env.ECENCIA_MENU_EDIT_AFTER_SEND = 'true';
    process.env.N8N_MENU_WEBHOOK_URL = 'https://n8n.example.test/webhook/menu';
    const originalFetch = global.fetch;
    global.fetch = async () => ({ ok: true, status: 200, text: async () => 'ok' });
    try {
      store.menu_envios = [
        {
          fecha: TODAY,
          menu_payload: { opciones: { '1': ['Otra'], '2': ['Distinto'], '3': ['Cambio'] } },
          last_sent_at: `${TODAY}T11:00:00.000Z`,
          image_url: 'https://img.example.test/menu.png',
          send_count: 1,
        },
      ];
      store.categorias_menu = [
        { id_categoria_menu: 1, nombre_categoria: 'Sopas' },
        { id_categoria_menu: 2, nombre_categoria: 'Segundos' },
        { id_categoria_menu: 3, nombre_categoria: 'Guarniciones' },
      ];

      const res = await request(app).post('/api/menu/enviar').send(validBody);

      expect(res.status).toBe(202);
      expect(res.body.reenvio).toBe(true);
    } finally {
      global.fetch = originalFetch;
      delete process.env.ECENCIA_MENU_EDIT_AFTER_SEND;
      delete process.env.N8N_MENU_WEBHOOK_URL;
    }
  });

  describe('Casos borde adicionales para menu.js', () => {
    it('PUT /:fecha con fecha inválida retorna 400', async () => {
      const res = await request(app).put('/api/menu/invalid-date').send(validBody);
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('formato YYYY-MM-DD');
    });

    it('POST /:fecha/activar con fecha inválida retorna 400', async () => {
      const res = await request(app).post('/api/menu/invalid-date/activar').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('formato YYYY-MM-DD');
    });

    it('POST /enviar con clientIds array con elementos vacíos o nulos los limpia correctamente', async () => {
      process.env.N8N_MENU_WEBHOOK_URL = 'https://n8n.example.test/webhook/menu';
      const originalFetch = global.fetch;
      global.fetch = async () => ({ ok: true, status: 200, text: async () => 'ok' });
      try {
        const bodyWithClients = {
          ...validBody,
          clientIds: ['  ', 'cli-1', '', 'cli-2'],
        };
        const res = await request(app).post('/api/menu/enviar').send(bodyWithClients);
        expect(res.status).toBe(202);
      } finally {
        global.fetch = originalFetch;
        delete process.env.N8N_MENU_WEBHOOK_URL;
      }
    });

    it('POST /enviar lanza error en producción si falta la URL del webhook', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      delete process.env.N8N_MENU_WEBHOOK_URL;
      try {
        const res = await request(app).post('/api/menu/enviar').send(validBody);
        expect(res.status).toBe(500);
        expect(res.body.error).toContain('Falta N8N_MENU_WEBHOOK_URL');
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('POST /enviar lanza error en producción si la URL no usa HTTPS', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      process.env.N8N_MENU_WEBHOOK_URL = 'http://n8n.example.test/webhook/menu';
      try {
        const res = await request(app).post('/api/menu/enviar').send(validBody);
        expect(res.status).toBe(500);
        expect(res.body.error).toContain('debe usar HTTPS');
      } finally {
        process.env.NODE_ENV = originalEnv;
        delete process.env.N8N_MENU_WEBHOOK_URL;
      }
    });

    it('POST /enviar lanza error en producción si apunta a localhost', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      process.env.N8N_MENU_WEBHOOK_URL = 'https://localhost/webhook/menu';
      try {
        const res = await request(app).post('/api/menu/enviar').send(validBody);
        expect(res.status).toBe(500);
        expect(res.body.error).toContain('no puede apuntar a localhost');
      } finally {
        process.env.NODE_ENV = originalEnv;
        delete process.env.N8N_MENU_WEBHOOK_URL;
      }
    });

    it('GET /activo retorna 500 si la BD falla', async () => {
      mocks.forceDbError = true;
      const res = await request(app).get('/api/menu/activo');
      expect(res.status).toBe(500);
    });

    it('POST /:fecha/activar retorna 500 si hay error DB', async () => {
      mocks.forceDbError = true;
      const res = await request(app).post('/api/menu/2026-06-10/activar');
      expect(res.status).toBe(500);
    });

    it('PUT /:fecha retorna 500 si hay error de DB', async () => {
      mocks.forceDbError = true;
      const res = await request(app).put('/api/menu/2026-06-10').send(validBody);
      expect(res.status).toBe(500);
    });

    it('PUT /:fecha rechaza menu si falta sopa o segundo', async () => {
      const invalid = { opciones: { 'c-sopa': ['Locro'] } }; // falta segundo
      const res = await request(app).put('/api/menu/2026-06-10').send(invalid);
      expect(res.status).toBe(400);
    });

    it('PUT /:fecha retorna error si es dia activo sin confirmacion', async () => {
      store.menu_settings = [{ id: 1, active_date: '2026-06-10' }];
      const res = await request(app).put('/api/menu/2026-06-10').send({ ...validBody, confirmarEdicion: false });
      expect(res.status).toBe(409);
      expect(res.body.requireConfirmation).toBe(true);
    });

    it('PUT /:fecha actualiza menu de dia activo si hay confirmacion', async () => {
      store.menu_settings = [{ id: 1, active_date: '2026-06-10' }];
      const res = await request(app).put('/api/menu/2026-06-10').send({ ...validBody, confirmarEdicion: true });
      expect(res.status).toBe(200);
    });

    it('PUT /:fecha actualiza menu aunque no tenga imagen (path === null)', async () => {
      const res = await request(app).put('/api/menu/2026-06-10').send({ opciones: validBody.opciones }); // sin imagen
      expect(res.status).toBe(200);
    });
  });
});
