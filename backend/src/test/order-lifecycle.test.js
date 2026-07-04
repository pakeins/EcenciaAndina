import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  closePendingReservations,
  isAfterServiceCutoff,
} = require('../services/orderLifecycle.js');

class FakeQuery {
  constructor(table, state) {
    this.table = table;
    this.state = state;
    this.filters = [];
    this.operation = 'select';
    this.payload = null;
  }

  select() {
    return this;
  }

  eq(column, value) {
    this.filters.push({ column, value });
    return this;
  }

  gte(column, value) {
    this.filters.push({ column, operator: 'gte', value });
    return this;
  }

  lt(column, value) {
    this.filters.push({ column, operator: 'lt', value });
    return this;
  }

  update(payload) {
    this.operation = 'update';
    this.payload = payload;
    return this;
  }

  insert(payload) {
    this.state.audits.push(...(Array.isArray(payload) ? payload : [payload]));
    return { error: null };
  }

  matches(row) {
    return this.filters.every((filter) => {
      if (filter.operator === 'gte') return row[filter.column] >= filter.value;
      if (filter.operator === 'lt') return row[filter.column] < filter.value;
      return row[filter.column] === filter.value;
    });
  }

  async maybeSingle() {
    const row = this.state.orders.find((item) => this.matches(item));
    if (!row) return { data: null, error: null };
    Object.assign(row, this.payload);
    return { data: row, error: null };
  }

  then(resolve) {
    if (this.operation === 'select') {
      resolve({ data: this.state.orders.filter((row) => this.matches(row)), error: null });
      return;
    }
    resolve({ error: null });
  }
}

const makeClient = (orders) => {
  const state = { orders, audits: [] };
  return {
    state,
    from(table) {
      return new FakeQuery(table, state);
    },
  };
};

describe('cierre automatico de reservas', () => {
  it('solo permite cerrar desde las 15:00 en America/Bogota', () => {
    expect(isAfterServiceCutoff(new Date('2026-06-26T19:59:59.000Z'))).toBe(false);
    expect(isAfterServiceCutoff(new Date('2026-06-26T20:00:00.000Z'))).toBe(true);
  });

  it('ECIENCIA_SERVICE_CUTOFF_HOUR ajusta la hora o desactiva el corte', () => {
    process.env.ECIENCIA_SERVICE_CUTOFF_HOUR = '20';
    try {
      // 20:00Z = 15:00 en Bogota, antes del corte configurado a las 20:00.
      expect(isAfterServiceCutoff(new Date('2026-06-26T20:00:00.000Z'))).toBe(false);
      // 01:30Z del 27 = 20:30 en Bogota del 26, despues del corte.
      expect(isAfterServiceCutoff(new Date('2026-06-27T01:30:00.000Z'))).toBe(true);

      process.env.ECIENCIA_SERVICE_CUTOFF_HOUR = 'off';
      expect(isAfterServiceCutoff(new Date('2026-06-27T01:30:00.000Z'))).toBe(false);

      // Valores invalidos caen al default de las 15:00.
      process.env.ECIENCIA_SERVICE_CUTOFF_HOUR = 'manana';
      expect(isAfterServiceCutoff(new Date('2026-06-26T20:00:00.000Z'))).toBe(true);
    } finally {
      delete process.env.ECIENCIA_SERVICE_CUTOFF_HOUR;
    }
  });

  it('con el corte desactivado el cierre automatico no cancela nada', async () => {
    process.env.ECIENCIA_SERVICE_CUTOFF_HOUR = 'off';
    try {
      const client = makeClient([
        { id_orden: 'order-1', id_cliente: 'client-1', id_estado: 1, created_at: '2026-06-26T15:30:00.000Z' },
      ]);
      const result = await closePendingReservations(client, { now: new Date('2026-06-26T21:00:00.000Z') });

      expect(result).toMatchObject({ skipped: true, reason: 'cutoff_disabled', closed: 0 });
      expect(client.state.orders[0].id_estado).toBe(1);
    } finally {
      delete process.env.ECIENCIA_SERVICE_CUTOFF_HOUR;
    }
  });

  it('cancela reservas del dia y notifica cierre de servicio', async () => {
    const client = makeClient([
      {
        id_orden: 'order-1',
        id_cliente: 'client-1',
        id_estado: 1,
        created_at: '2026-06-26T15:30:00.000Z',
      },
      {
        id_orden: 'order-2',
        id_cliente: 'client-2',
        id_estado: 2,
        created_at: '2026-06-26T15:30:00.000Z',
      },
    ]);
    const notify = vi.fn(async () => ({ status: 'sent', channel: 'telegram' }));

    const result = await closePendingReservations(client, {
      now: new Date('2026-06-26T20:00:00.000Z'),
      notify,
    });

    expect(result.closed).toBe(1);
    expect(client.state.orders[0].id_estado).toBe(3);
    expect(client.state.audits[0]).toMatchObject({
      id_orden: 'order-1',
      estado_anterior: 1,
      estado_nuevo: 3,
    });
    expect(notify).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        idOrden: 'order-1',
        idCliente: 'client-1',
        reason: 'service_closed',
      }),
    );
  });
});
