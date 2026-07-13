import { describe, expect, it, vi } from 'vitest';
import orderNotifications from '../services/orderNotifications.js';

const {
  buildOrderStatusMessage,
  notifyOrderStatusChange,
} = orderNotifications;

class FakeQuery {
  constructor(table, rows, audits) {
    this.table = table;
    this.rows = rows;
    this.audits = audits;
    this.filters = [];
  }

  select() {
    return this;
  }

  eq(column, value) {
    this.filters.push({ column, value });
    return this;
  }

  not(column, operator, value) {
    this.filters.push({ column, operator: `not.${operator}`, value });
    return this;
  }

  limit() {
    return this;
  }

  insert(payload) {
    this.audits.push(...(Array.isArray(payload) ? payload : [payload]));
    return { error: null };
  }

  async maybeSingle() {
    const row = this.rows.find((item) =>
      this.filters.every((filter) => {
        if (filter.operator === 'not.is') return item[filter.column] !== filter.value;
        return item[filter.column] === filter.value;
      }),
    );
    return { data: row || null, error: null };
  }
}

const makeClient = (subscriptions = []) => {
  const audits = [];
  return {
    audits,
    from(table) {
      return new FakeQuery(table, table === 'telegram_subscriptions' ? subscriptions : [], audits);
    },
  };
};

describe('notificaciones de estado por Telegram', () => {
  it('construye mensajes para consumido y cierre de servicio', () => {
    expect(buildOrderStatusMessage({ idOrden: 'order-1', nextState: 2 })).toContain(
      'marcado como consumido',
    );
    expect(buildOrderStatusMessage({ idOrden: 'order-2', nextState: 3, reason: 'service_closed' })).toContain(
      'horario de servicio',
    );
  });

  it('envia Telegram y registra auditoria cuando el cliente tiene suscripcion aceptada', async () => {
    const client = makeClient([
      {
        id: 'sub-1',
        id_cliente: 'client-1',
        chat_id: '123',
        consent_status: 'accepted',
        is_active: true,
      },
    ]);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 44 } })
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await notifyOrderStatusChange(
      client,
      { idOrden: 'order-1', idCliente: 'client-1', nextState: 2 }
    );
    vi.unstubAllGlobals();

    expect(result).toMatchObject({ status: 'sent', telegramMessageId: 44 });
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(client.audits[0]).toMatchObject({
      id_orden: 'order-1',
      subscription_id: 'sub-1',
      status: 'sent',
      telegram_message_id: 44,
    });
  });

  it('omite sin fallar cuando no hay suscripcion Telegram elegible', async () => {
    const client = makeClient([]);

    const result = await notifyOrderStatusChange(client, {
      idOrden: 'order-1',
      idCliente: 'client-1',
      nextState: 3,
    });

    expect(result).toMatchObject({ status: 'skipped_no_subscription' });
    expect(client.audits[0]).toMatchObject({
      status: 'skipped_no_subscription',
      notification_kind: 'order_cancelled',
    });
  });

  it('registra fallo de Telegram sin lanzar excepcion al cambio de estado', async () => {
    const client = makeClient([
      {
        id: 'sub-1',
        id_cliente: 'client-1',
        chat_id: '123',
        consent_status: 'accepted',
        is_active: true,
      },
    ]);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized'
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await notifyOrderStatusChange(
      client,
      { idOrden: 'order-1', idCliente: 'client-1', nextState: 3 }
    );
    vi.unstubAllGlobals();

    expect(result).toMatchObject({ status: 'failed', error: expect.stringContaining('Unauthorized') });
    expect(client.audits[0]).toMatchObject({ status: 'failed', error_message: expect.stringContaining('Unauthorized') });
  });
  it('registra fallo de base de datos al buscar suscripcion', async () => {
    const client = makeClient([]);
    const originalFrom = client.from;
    client.from = (table) => {
      if (table === 'telegram_subscriptions') throw new Error('Database connection failed');
      return originalFrom.call(client, table);
    };

    const result = await notifyOrderStatusChange(client, {
      idOrden: 'order-1',
      idCliente: 'client-1',
      nextState: 2,
    });

    expect(result).toMatchObject({ status: 'failed', error: 'Database connection failed' });
    expect(client.audits[0]).toMatchObject({ status: 'failed', error_message: 'Database connection failed' });
  });

  it('handles invalid notification state', async () => {
    const result = await notifyOrderStatusChange(null, { nextState: 999 });
    expect(result).toBeNull();
  });

  it('handles missing client id in findAcceptedTelegramSubscription', async () => {
    const result = await orderNotifications.findAcceptedTelegramSubscription(null, null);
    expect(result).toBeNull();
  });

  it('handles database error in auditOrderNotification and logs warning', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = {
      from: vi.fn(() => ({
        insert: vi.fn(async () => ({ error: new Error('Audit insert failed') })),
      })),
    };

    await expect(orderNotifications.auditOrderNotification(client, { status: 'sent' })).resolves.not.toThrow();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'No se pudo registrar auditoria de notificacion de pedido:',
      'Audit insert failed'
    );
    consoleWarnSpy.mockRestore();
  });

  it('truncates very long errors correctly', async () => {
    const client = makeClient([
      {
        id: 'sub-1',
        id_cliente: 'client-1',
        chat_id: '123',
        consent_status: 'accepted',
        is_active: true,
      },
    ]);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'A'.repeat(2000)
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await notifyOrderStatusChange(
      client,
      { idOrden: 'order-1', idCliente: 'client-1', nextState: 3 }
    );
    vi.unstubAllGlobals();

    expect(result.error.length).toBe(1000);
    expect(result.error.endsWith('...')).toBe(true);
  });
});
