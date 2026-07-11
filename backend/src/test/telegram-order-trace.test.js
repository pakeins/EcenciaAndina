import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let createOrderTrace;
let updateOrderTrace;
let buildOriginalMessage;
let boundedJson;
let truncate;

beforeAll(async () => {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';
  delete require.cache[require.resolve('../services/telegramOrderTrace.js')];
  const service = (await import('../services/telegramOrderTrace.js')).default;
  createOrderTrace = service.createOrderTrace;
  updateOrderTrace = service.updateOrderTrace;
  buildOriginalMessage = service._private.buildOriginalMessage;
  boundedJson = service._private.boundedJson;
  truncate = service._private.truncate;
});

describe('trazabilidad de pedidos automaticos', () => {
  describe('buildOriginalMessage & utilidades', () => {
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

    it('construye tipo callback con accion truncada a 32 caracteres', () => {
      const original = buildOriginalMessage({
        isCallback: true,
        text: 'una_accion_muy_larga_que_excede_los_treinta_y_dos_caracteres_de_limite:123',
        messageId: 101,
      });

      expect(original).toMatchObject({
        type: 'callback',
        callbackAction: 'una_accion_muy_larga_que_exce...',
        messageId: 101,
      });
    });

    it('construye tipo contact si tiene telefono de contacto', () => {
      const original = buildOriginalMessage({
        contactPhone: '593987654321',
        contactVerified: true,
      });

      expect(original).toMatchObject({
        type: 'contact',
        hasContact: true,
        contactVerified: true,
      });
    });

    it('truncate limita la longitud del texto', () => {
      expect(truncate('1234567890', 5)).toBe('12...');
      expect(truncate(null, 5)).toBe('');
    });

    it('boundedJson trunca objetos JSON gigantescos', () => {
      const hugeObject = { data: 'a'.repeat(20000) };
      const result = boundedJson(hugeObject);
      expect(result).toHaveProperty('truncated', true);
      expect(result.summary).toContain('...');
      
      const smallObject = { test: 123 };
      expect(boundedJson(smallObject)).toEqual(smallObject);
      expect(boundedJson(null)).toEqual({});
    });
  });

  describe('createOrderTrace', () => {
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

    it('ignora clics de callbacks intermedios no importantes', async () => {
      const createClient = vi.fn();
      const result = await createOrderTrace(
        { isCallback: true, text: 'seleccionar_plato:4' },
        {},
        createClient,
      );
      expect(result).toBe('');
      expect(createClient).not.toHaveBeenCalled();
    });

    it('no ignora callbacks si son acciones importantes', async () => {
      const single = vi.fn(async () => ({ data: { id: 'trace-cb' }, error: null }));
      const insert = vi.fn(() => ({
        select: () => ({ single }),
      }));
      const createClient = () => ({
        from: () => ({ insert }),
      });

      const result = await createOrderTrace(
        { isCallback: true, text: 'pedir:hoy' },
        {},
        createClient,
      );
      expect(result).toBe('trace-cb');
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
    });
  });

  describe('updateOrderTrace', () => {
    it('retorna false si no hay traceId', async () => {
      const result = await updateOrderTrace(null, { outcome: 'success' });
      expect(result).toBe(false);
    });

    it('actualiza campos de trazabilidad exitosamente', async () => {
      const eq = vi.fn().mockResolvedValue({ error: null });
      const update = vi.fn(() => ({ eq }));
      const createClient = () => ({
        from: () => ({ update }),
      });

      const result = await updateOrderTrace(
        'trace-1',
        {
          id_cliente: 'client-1',
          id_orden: 'order-1',
          subscription_id: 'sub-1',
          interpreted_payload: { items: [1] },
          outcome: 'success',
          error_message: 'x'.repeat(1200), // longer than 1000 limit
        },
        createClient,
      );

      expect(result).toBe(true);
      expect(update).toHaveBeenCalledWith(expect.objectContaining({
        id_cliente: 'client-1',
        id_orden: 'order-1',
        subscription_id: 'sub-1',
        interpreted_payload: { items: [1] },
        outcome: 'success',
        error_message: expect.stringContaining('...'),
      }));
      expect(update.mock.calls[0][0].error_message.length).toBe(1000);
    });

    it('ignora resultados no permitidos en el outcome', async () => {
      const eq = vi.fn().mockResolvedValue({ error: null });
      const update = vi.fn(() => ({ eq }));
      const createClient = () => ({
        from: () => ({ update }),
      });

      const result = await updateOrderTrace(
        'trace-1',
        { outcome: 'invalid_outcome' },
        createClient,
      );

      expect(result).toBe(true);
      expect(update).toHaveBeenCalledWith(expect.not.objectContaining({
        outcome: expect.anything(),
      }));
    });

    it('aisla errores de almacenamiento al actualizar', async () => {
      const failingClient = () => ({
        from: () => ({
          update: () => ({
            eq: async () => ({ error: new Error('db failure') }),
          }),
        }),
      });

      const result = await updateOrderTrace('trace-1', { outcome: 'failed' }, failingClient);
      expect(result).toBe(false);
    });
  });
});
