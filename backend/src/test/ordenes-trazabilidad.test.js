import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import express from 'express';
import request from 'supertest';

const require = createRequire(import.meta.url);

let fakeClient;
let app;

class FakeTraceQuery {
  constructor(rows) {
    this.rows = rows;
    this.filters = [];
    this.selected = '';
    this.selectOptions = {};
    this.rangeArgs = null;
  }

  select(columns, options = {}) {
    this.selected = columns;
    this.selectOptions = options;
    return this;
  }

  order(column, options) {
    this.orderArgs = { column, options };
    return this;
  }

  range(from, to) {
    this.rangeArgs = { from, to };
    return this;
  }

  eq(column, value) {
    this.filters.push({ column, value });
    return this;
  }

  then(resolve, reject) {
    const filtered = this.rows.filter((row) =>
      this.filters.every((filter) => String(row[filter.column]) === String(filter.value)),
    );
    const from = this.rangeArgs?.from ?? 0;
    const to = this.rangeArgs?.to ?? filtered.length - 1;
    return Promise.resolve({
      data: filtered.slice(from, to + 1),
      error: null,
      count: this.selectOptions.count === 'exact' ? filtered.length : null,
    }).then(resolve, reject);
  }
}

class EmptyQuery {
  select() {
    return this;
  }

  in() {
    return this;
  }

  eq() {
    return this;
  }

  maybeSingle() {
    return Promise.resolve({ data: null, error: null });
  }

  single() {
    return Promise.resolve({ data: null, error: null });
  }

  then(resolve, reject) {
    return Promise.resolve({ data: [], error: null }).then(resolve, reject);
  }
}

const makeClient = (rows = []) => ({
  lastTraceQuery: null,
  from(table) {
    if (table === 'telegram_order_traces') {
      this.lastTraceQuery = new FakeTraceQuery(rows);
      return this.lastTraceQuery;
    }
    return new EmptyQuery();
  },
});

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

beforeAll(() => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

  injectModule('../config/supabase.js', {
    getAdminClient: () => fakeClient,
    supabase: {
      auth: {
        getUser: async () => ({ data: { user: { id: 'admin-1', email: 'admin@example.com' } }, error: null }),
      },
    },
  });

  injectModule('../services/authUser.js', {
    findEmpleadoForAuthUser: async () => ({ id_empleado: 'e1', esta_activo: true }),
    publicUserFromEmpleado: () => ({ id: 'admin-1', nombre: 'Admin' }),
    roleFromEmpleado: () => 'administrador',
  });

  ['../middlewares/authMiddleware.js', '../middlewares/roleMiddleware.js', '../routes/ordenes.js'].forEach((relPath) => {
    try {
      delete require.cache[require.resolve(relPath)];
    } catch {
      /* noop */
    }
  });

  injectModule('../middlewares/authMiddleware.js', (req, _res, next) => {
    req.user = { id: 'admin-1', email: 'admin@example.com', rol: 'administrador' };
    next();
  });
  injectModule('../middlewares/roleMiddleware.js', () => (_req, _res, next) => next());

  const ordenesRouter = require('../routes/ordenes.js');
  app = express();
  app.use(express.json());
  app.use('/api/ordenes', ordenesRouter);
});

afterAll(() => {
  [
    '../config/supabase.js',
    '../services/authUser.js',
    '../middlewares/authMiddleware.js',
    '../routes/ordenes.js',
  ].forEach((relPath) => {
    try {
      delete require.cache[require.resolve(relPath)];
    } catch {
      /* noop */
    }
  });
});

beforeEach(() => {
  fakeClient = makeClient([
    {
      id: 'trace-1',
      chat_id: '123',
      outcome: 'success',
      created_at: '2026-07-01T03:00:00.000Z',
      clientes: { nombre: 'Ana', apellido: 'Lopez', telefono: '0991112233' },
    },
    {
      id: 'trace-2',
      chat_id: '456',
      outcome: 'failed',
      created_at: '2026-07-01T02:00:00.000Z',
      clientes: null,
    },
  ]);
});

const auth = (req) => req.set('Authorization', 'Bearer test-token');

describe('GET /api/ordenes/telegram/trazabilidad', () => {
  it('devuelve traces y paginacion con filtros compatibles con la UI', async () => {
    const response = await auth(
      request(app).get('/api/ordenes/telegram/trazabilidad?page=1&limit=20&chat_id=123&outcome=success'),
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      traces: [
        {
          id: 'trace-1',
          chat_id: '123',
          outcome: 'success',
          clientes: { nombre: 'Ana', apellido: 'Lopez', telefono: '0991112233' },
        },
      ],
      pagination: {
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      },
    });
    expect(fakeClient.lastTraceQuery.selected).toContain('clientes(nombre,apellido,telefono)');
    expect(fakeClient.lastTraceQuery.selected).toContain('ordenes(id_orden,created_at)');
    expect(fakeClient.lastTraceQuery.rangeArgs).toEqual({ from: 0, to: 19 });
  });
});
