import { beforeEach, describe, expect, it, vi, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const injectModule = (relPath, exportsObj) => {
  const filename = require.resolve(relPath);
  require.cache[filename] = {
    id: filename,
    filename,
    loaded: true,
    exports: exportsObj,
    children: [],
    paths: []
  };
};

const mocks = {
  fakeClient: null
};

injectModule('../config/supabase.js', {
  getAdminClient: () => mocks.fakeClient
});

injectModule('../middlewares/authMiddleware.js', (req, _res, next) => {
  req.user = { id: 'u1', email: 'admin@example.com', rol: 'administrador' };
  next();
});

const ordenesRouter = require('../routes/ordenes.js');

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

vi.mock('../config/supabase.js', () => ({
  getAdminClient: () => mocks.fakeClient,
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: { id: 'admin-1', email: 'admin@example.com' } }, error: null }),
    },
  },
}));

vi.mock('../services/authUser.js', () => ({
  findEmpleadoForAuthUser: async () => ({ id_empleado: 'e1', esta_activo: true }),
  publicUserFromEmpleado: () => ({ id: 'admin-1', nombre: 'Admin' }),
  roleFromEmpleado: () => 'administrador',
}));

vi.mock('../middlewares/authMiddleware.js', () => ({
  default: (req, _res, next) => {
    req.user = { id: 'admin-1', email: 'admin@example.com', rol: 'administrador' };
    next();
  }
}));

vi.mock('../middlewares/roleMiddleware.js', () => ({
  default: () => (_req, _res, next) => next()
}));

let app;

beforeAll(() => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

  app = express();
  app.use(express.json());
  app.use('/api/ordenes', ordenesRouter);
});


beforeEach(() => {
  mocks.fakeClient = makeClient([
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
    expect(mocks.fakeClient.lastTraceQuery.selected).toContain('clientes(nombre,apellido,telefono)');
    expect(mocks.fakeClient.lastTraceQuery.selected).toContain('ordenes(id_orden,created_at)');
    expect(mocks.fakeClient.lastTraceQuery.rangeArgs).toEqual({ from: 0, to: 19 });
  });
});
