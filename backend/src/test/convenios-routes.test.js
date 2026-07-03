import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import express from 'express';
import request from 'supertest';

const require = createRequire(import.meta.url);

// --- Estado mutable controlado por cada test ---
let fakeClient;
let importImpl;
let invitationImpl;

// Cliente Supabase falso: from(table) resuelve segun `resultsByTable`.
class FakeQuery {
  constructor(table, results) {
    this.table = table;
    this.results = results;
  }
  select() {
    return this;
  }
  eq() {
    return this;
  }
  in() {
    return this;
  }
  order() {
    return this;
  }
  update() {
    return this;
  }
  _result() {
    return this.results[this.table] ?? { data: null, error: null };
  }
  maybeSingle() {
    return Promise.resolve(this._result());
  }
  single() {
    return Promise.resolve(this._result());
  }
  then(resolve, reject) {
    return Promise.resolve(this._result()).then(resolve, reject);
  }
}

const makeClient = (resultsByTable) => ({
  from: (table) => new FakeQuery(table, resultsByTable),
});

// Inyecta un modulo falso en la cache de require ANTES de cargar el router,
// para que las dependencias destructuradas en convenios.js usen el doble.
const injectModule = (relPath, exportsObj) => {
  const filename = require.resolve(relPath);
  require.cache[filename] = {
    id: filename,
    filename,
    loaded: true,
    exports: exportsObj,
    children: [],
    paths: [],
  };
};

let app;

beforeAll(() => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

  // Doble del cliente Supabase y de la sesion de auth.
  injectModule('../config/supabase.js', {
    getAdminClient: () => fakeClient,
    supabase: {
      auth: {
        getUser: async () => ({ data: { user: { id: 'admin-1', email: 'admin@example.com' } }, error: null }),
      },
    },
  });

  // Doble de authUser: el authMiddleware real pasa con un administrador activo.
  injectModule('../services/authUser.js', {
    findEmpleadoForAuthUser: async () => ({ id_empleado: 'e1', esta_activo: true }),
    publicUserFromEmpleado: () => ({ id: 'admin-1', nombre: 'Admin' }),
    roleFromEmpleado: () => 'administrador',
  });

  // Servicios ya cubiertos por sus propios tests: se delegan a impls mutables.
  injectModule('../services/convenioEmployeeImport.js', {
    importConvenioEmployees: (...args) => importImpl(...args),
  });
  injectModule('../services/convenioInvitations.js', {
    generateConvenioInvitation: (...args) => invitationImpl(...args),
  });

  // Recargar middleware y router para que tomen los dobles inyectados.
  ['../middlewares/authMiddleware.js', '../routes/convenios.js'].forEach((relPath) => {
    try {
      delete require.cache[require.resolve(relPath)];
    } catch {
      /* noop */
    }
  });

  const conveniosRouter = require('../routes/convenios.js');
  app = express();
  app.use(express.json());
  app.use('/api/convenios', conveniosRouter);
});

afterAll(() => {
  // Limpiar la cache para no contaminar otros tests.
  [
    '../config/supabase.js',
    '../services/authUser.js',
    '../services/convenioEmployeeImport.js',
    '../services/convenioInvitations.js',
    '../middlewares/authMiddleware.js',
    '../routes/convenios.js',
  ].forEach((relPath) => {
    try {
      delete require.cache[require.resolve(relPath)];
    } catch {
      /* noop */
    }
  });
});

beforeEach(() => {
  fakeClient = makeClient({});
  importImpl = async () => ({ created: 0, updated: 0 });
  invitationImpl = async () => ({ inviteLink: '', invitationMessage: '', telegramStatus: 'pending' });
});

const auth = (req) => req.set('Authorization', 'Bearer test-token');

describe('routes/convenios — actualizacion', () => {
  it('PUT /:id actualiza un convenio sin requerir archivo adjunto (regresion req.file)', async () => {
    fakeClient = makeClient({
      convenios: {
        data: {
          id_convenio: 'conv-1',
          ruc: '1710034065001',
          nombre_empresa: 'Empresa QA',
          representante: 'Rep',
          telefono: '0999999999',
          email: 'qa@example.com',
          fecha_inicio: '2026-01-01',
          fecha_caducidad: '2026-12-31',
          esta_activo: true,
          cupo_maximo: 30,
          id_tipo_almuerzo: 8,
          clientes_convenios: [{ count: 2 }],
        },
        error: null,
      },
    });

    const res = await auth(
      request(app)
        .put('/api/convenios/conv-1')
        .send({ nombre_empresa: 'Empresa QA', cupo_maximo: 30, id_tipo_almuerzo: 8 }),
    );

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      nombre_empresa: 'Empresa QA',
      cupo_maximo: 30,
      id_tipo_almuerzo: 8,
      totalColaboradores: 2,
    });
  });

  it('PUT /:id rechaza fechas invertidas con mensaje claro', async () => {
    const res = await auth(
      request(app)
        .put('/api/convenios/conv-1')
        .send({ fecha_inicio: '2026-12-31', fecha_caducidad: '2026-01-01' }),
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/caducidad no puede ser anterior/i);
  });
});

describe('routes/convenios — colaboradores y telegram', () => {
  it('GET /:id/clientes enriquece cada colaborador con su estado de Telegram', async () => {
    fakeClient = makeClient({
      clientes_convenios: {
        data: [
          { clientes: { id_cliente: 'c1', cedula: '0102030405', nombre: 'Ana', apellido: 'Lopez', telefono: '0991112233' } },
          { clientes: { id_cliente: 'c2', cedula: '0606060606', nombre: 'Beto', apellido: 'Diaz', telefono: null } },
        ],
        error: null,
      },
      telegram_subscriptions: {
        data: [
          { id_cliente: 'c1', consent_status: 'accepted', is_active: true, chat_id: '555', updated_at: '2026-06-01' },
        ],
        error: null,
      },
    });

    const res = await auth(request(app).get('/api/convenios/10/clientes'));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({
      id: 'c1',
      telefono: '0991112233',
      telegram: { consent_status: 'accepted', is_active: true, has_chat: true, updated_at: '2026-06-01' },
    });
    // Colaborador sin suscripcion -> telegram null y telefono normalizado a ''
    expect(res.body[1]).toMatchObject({ id: 'c2', telefono: '', telegram: null });
  });

  it('GET /:id/clientes sin colaboradores no consulta suscripciones y responde []', async () => {
    fakeClient = makeClient({ clientes_convenios: { data: [], error: null } });

    const res = await auth(request(app).get('/api/convenios/99/clientes'));

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('GET /:id/clientes devuelve 500 si falla la consulta', async () => {
    fakeClient = makeClient({ clientes_convenios: { data: null, error: new Error('db down') } });

    const res = await auth(request(app).get('/api/convenios/10/clientes'));

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('db down');
  });

  it('POST /:id/clientes/importar rechaza si no se adjunta archivo', async () => {
    const res = await auth(request(app).post('/api/convenios/10/clientes/importar'));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('No se subio ningun archivo Excel.');
  });

  it('POST /:id/clientes/importar rechaza un archivo que no es .xlsx', async () => {
    const res = await auth(
      request(app)
        .post('/api/convenios/10/clientes/importar')
        .attach('archivo', Buffer.from('texto plano'), 'empleados.txt'),
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Solo se permiten archivos Excel .xlsx');
  });

  it('POST /:id/clientes/importar procesa un .xlsx y devuelve el resultado del servicio', async () => {
    importImpl = async (_client, opts) => ({ idConvenio: opts.idConvenio, created: 3, updated: 1 });

    const res = await auth(
      request(app)
        .post('/api/convenios/77/clientes/importar')
        .attach('archivo', Buffer.from('PK fake xlsx'), 'empleados.xlsx'),
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ idConvenio: '77', created: 3, updated: 1 });
  });

  it('POST /:id/clientes/importar propaga el status de un error del servicio', async () => {
    importImpl = async () => {
      const error = new Error('formato invalido');
      error.status = 422;
      error.payload = { error: 'formato invalido', fila: 3 };
      throw error;
    };

    const res = await auth(
      request(app)
        .post('/api/convenios/77/clientes/importar')
        .attach('archivo', Buffer.from('PK fake xlsx'), 'empleados.xlsx'),
    );

    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: 'formato invalido', fila: 3 });
  });

  it('POST /:id/clientes/:clienteId/telegram-invitacion genera el link cuando el colaborador existe', async () => {
    fakeClient = makeClient({
      clientes_convenios: {
        data: {
          id_convenio: '10',
          id_cliente: 'c1',
          clientes: { id_cliente: 'c1', cedula: '0102030405', nombre: 'Ana', apellido: 'Lopez', telefono: '0991112233' },
          convenios: { id_convenio: '10', nombre_empresa: 'ACME' },
        },
        error: null,
      },
    });
    invitationImpl = async () => ({
      inviteLink: 'https://t.me/bot?start=abc',
      invitationMessage: 'Hola Ana',
      telegramStatus: 'sent',
    });

    const res = await auth(request(app).post('/api/convenios/10/clientes/c1/telegram-invitacion'));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      clienteId: 'c1',
      inviteLink: 'https://t.me/bot?start=abc',
      invitationMessage: 'Hola Ana',
      telegramStatus: 'sent',
    });
  });

  it('POST /:id/clientes/:clienteId/telegram-invitacion responde 404 si no existe el vinculo', async () => {
    fakeClient = makeClient({ clientes_convenios: { data: null, error: null } });

    const res = await auth(request(app).post('/api/convenios/10/clientes/zzz/telegram-invitacion'));

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Colaborador no encontrado en este convenio.');
  });
});
