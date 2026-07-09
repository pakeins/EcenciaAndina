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
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 44 } }),
    }));

    const result = await notifyOrderStatusChange(
      client,
      { idOrden: 'order-1', idCliente: 'client-1', nextState: 2 },
      { fetchImpl, token: 'token-test' },
    );

    expect(result).toMatchObject({ status: 'sent', telegramMessageId: 44 });
    expect(fetchImpl).toHaveBeenCalledOnce();
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
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ ok: false, description: 'Unauthorized' }),
    }));

    const result = await notifyOrderStatusChange(
      client,
      { idOrden: 'order-1', idCliente: 'client-1', nextState: 3 },
      { fetchImpl, token: 'token-test' },
    );

    expect(result).toMatchObject({ status: 'failed', error: 'Unauthorized' });
    expect(client.audits[0]).toMatchObject({ status: 'failed', error_message: 'Unauthorized' });
  });
});
