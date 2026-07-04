import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let createOrderTrace;
let updateOrderTrace;
let buildOriginalMessage;

beforeAll(() => {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';
  const service = require('../services/telegramOrderTrace.js');
  createOrderTrace = service.createOrderTrace;
  updateOrderTrace = service.updateOrderTrace;
  buildOriginalMessage = service._private.buildOriginalMessage;
});

describe('trazabilidad de pedidos automaticos', () => {
  it('no conserva el contenido libre del mensaje', () => {
    const original = buildOriginalMessage({
      text: 'sopa 1, segundo 2, guarnicion 1',
      isCallback: false,
      contactPhone: '',
      contactVerified: false,
      messageId: 45,
    });

    expect(original).toMatchObject({
      type: 'text',
      messageId: 45,
      hasContact: false,
    });
    expect(original).not.toHaveProperty('text');
  });

  it('registra la recepcion con cliente y suscripcion relacionados', async () => {
    const single = vi.fn(async () => ({ data: { id: 'trace-1' }, error: null }));
    const insert = vi.fn(() => ({
      select: () => ({ single }),
    }));
    const createClient = () => ({
      from: () => ({ insert }),
    });

    const traceId = await createOrderTrace(
      {
        updateId: 99,
        messageId: 45,
        chatId: '123',
        text: 'sopa 1',
        isCallback: false,
        contactPhone: '',
        contactVerified: false,
      },
      {
        clientId: 'client-1',
        subscriptionId: 'subscription-1',
        phoneNormalized: '593999999999',
      },
      createClient,
    );

    expect(traceId).toBe('trace-1');
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        chat_id: '123',
        update_id: 99,
        id_cliente: 'client-1',
        subscription_id: 'subscription-1',
        outcome: 'received',
        original_message: expect.not.objectContaining({ text: expect.anything() }),
      }),
    );
  });

  it('aisla errores de almacenamiento para no bloquear el flujo operativo', async () => {
    const failingClient = () => ({
      from: () => ({
        insert: () => ({
          select: () => ({
            single: async () => ({ data: null, error: new Error('storage unavailable') }),
          }),
        }),
        update: () => ({
          eq: async () => ({ error: new Error('storage unavailable') }),
        }),
      }),
    });

    await expect(
      createOrderTrace(
        { chatId: '123', text: 'pedido', isCallback: false },
        {},
        failingClient,
      ),
    ).resolves.toBe('');
    await expect(
      updateOrderTrace('trace-1', { outcome: 'failed' }, failingClient),
    ).resolves.toBe(false);
  });
});
