import { beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

let rows;
let deletedIds;
const require = createRequire(import.meta.url);

const matchesFilters = (row, filters) =>
  filters.every(({ column, value }) => String(row[column]) === String(value));

class FakeQuery {
  constructor(table) {
    this.table = table;
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

  delete() {
    this.operation = 'delete';
    return this;
  }

  update(payload) {
    this.operation = 'update';
    this.payload = payload;
    return this;
  }

  async maybeSingle() {
    return { data: rows.find((row) => matchesFilters(row, this.filters)) || null, error: null };
  }

  async single() {
    if (this.operation !== 'update') {
      return { data: rows.find((row) => matchesFilters(row, this.filters)) || null, error: null };
    }

    const row = rows.find((item) => matchesFilters(item, this.filters));
    if (!row) return { data: null, error: new Error('row not found') };

    const chatConflict = rows.find(
      (item) => item.id !== row.id && item.chat_id && item.chat_id === this.payload.chat_id,
    );
    if (chatConflict) return { data: null, error: new Error('duplicate chat_id') };

    Object.assign(row, this.payload);
    return { data: row, error: null };
  }

  then(resolve) {
    if (this.operation === 'delete') {
      const before = rows.length;
      rows = rows.filter((row) => !matchesFilters(row, this.filters));
      if (rows.length < before) deletedIds.push(this.filters.find((filter) => filter.column === 'id')?.value);
      resolve({ error: null });
      return;
    }

    resolve({ data: null, error: null });
  }
}

const fakeClient = {
  from(table) {
    return new FakeQuery(table);
  },
};

describe('Telegram subscriptions', () => {
  beforeEach(() => {
    rows = [];
    deletedIds = [];
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

    delete require.cache[require.resolve('../routes/telegram.js')];
    delete require.cache[require.resolve('../config/supabase.js')];
  });

  it('elimina el pending por chat antes de vincular un telefono ya existente', async () => {
    rows = [
      {
        id: 'pending-chat-row',
        chat_id: '123',
        phone_normalized: null,
        consent_status: 'pending',
      },
      {
        id: 'phone-row',
        chat_id: null,
        phone_normalized: '593998313804',
        consent_status: 'pending',
      },
    ];

    const supabaseConfig = require('../config/supabase.js');
    supabaseConfig.getAdminClient = () => fakeClient;

    const telegramRouter = require('../routes/telegram.js');
    const result = await telegramRouter._private.saveAcceptedSubscription(
      '123',
      { id_cliente: 'client-1', telefono: '0998313804' },
      '0998313804',
      true,
    );

    expect(result.subscription.id).toBe('phone-row');
    expect(result.subscription.chat_id).toBe('123');
    expect(result.subscription.consent_status).toBe('accepted');
    expect(deletedIds).toEqual(['pending-chat-row']);
    expect(rows.map((row) => row.id)).toEqual(['phone-row']);
  });

  it('permite reactivar una suscripcion rechazada cuando viene de reinvitacion manual', async () => {
    rows = [
      {
        id: 'phone-row',
        chat_id: '123',
        phone_normalized: '593998313804',
        consent_status: 'rejected',
        is_active: false,
      },
    ];

    const supabaseConfig = require('../config/supabase.js');
    supabaseConfig.getAdminClient = () => fakeClient;

    const telegramRouter = require('../routes/telegram.js');
    const result = await telegramRouter._private.saveAcceptedSubscription(
      '123',
      { id_cliente: 'client-1', telefono: '0998313804' },
      '0998313804',
      true,
      { allowRejected: true },
    );

    expect(result.subscription.id).toBe('phone-row');
    expect(result.subscription.consent_status).toBe('accepted');
    expect(result.subscription.is_active).toBe(true);
    expect(result.subscription.rejected_at).toBeNull();
  });
});
