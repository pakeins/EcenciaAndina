import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let processTextSession;
let orderConfirmation;

const makeSession = () => ({
  step: 'sopa',
  date: '2026-06-10',
  menuDate: '2026-06-10',
  menu: {
    sopas: ['Locro', 'Sopa de pollo'],
    segundos: ['Seco de pollo', 'Carne asada'],
    guarniciones: ['Arroz', 'Ensalada'],
  },
  quantity: 1,
  cliente: { id_cliente: 'client-1' },
  convenio: { id_convenio: null, nombre_empresa: 'Cliente directo' },
  product: { id_producto: 1, precio_unitario: 3.5 },
  estadoReservadoId: 1,
  origenTelegramId: 1,
});

const makeDependencies = () => {
  const state = { current: null };
  return {
    state,
    saveState: vi.fn(async (_key, value) => {
      state.current = value;
    }),
    createOrder: vi.fn(async () => ({ id_orden: 'order-1', duplicate: false })),
    clearState: vi.fn(async () => {
      state.current = null;
    }),
    notify: vi.fn(async () => {}),
    trace: vi.fn(async () => true),
  };
};

beforeAll(() => {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';
  const telegramRouter = require('../routes/telegram.js');
  processTextSession = telegramRouter._private.processTextSession;
  orderConfirmation = telegramRouter._private.orderConfirmation;
});

describe('errores en pedidos recibidos por Telegram', () => {
  it('genera una confirmacion automatica con el resumen completo del pedido', () => {
    const message = orderConfirmation(
      {
        quantity: 2,
        sopa: 'Locro',
        segundo: 'Seco de pollo',
        guarnicion: 'Ensalada',
      },
      { id_orden: 'order-1', duplicate: false },
    );

    expect(message).toContain('Tu almuerzo quedo reservado');
    expect(message).toContain('Cantidad: 2');
    expect(message).toContain('Sopa: Locro');
    expect(message).toContain('Plato fuerte: Seco de pollo');
    expect(message).toContain('Guarnicion: Ensalada');
    expect(message).toContain('Estado: Reservado');
    expect(message).toContain('Orden: order-1');
  });

  it('rechaza un formato irreconocible y explica como corregirlo', async () => {
    const dependencies = makeDependencies();
    const result = await processTextSession('123', 'quiero lo de siempre', makeSession(), dependencies);

    expect(result.status).toBe('invalid');
    expect(dependencies.createOrder).not.toHaveBeenCalled();
    expect(dependencies.saveState).toHaveBeenCalledOnce();
    expect(dependencies.notify.mock.calls[0][1]).toContain('El pedido no fue registrado');
    expect(dependencies.notify.mock.calls[0][1]).toContain('sopa 1, segundo 1, guarnicion 1');
    expect(dependencies.trace).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'failed',
        interpreted_payload: expect.objectContaining({
          source: 'text',
          invalid: ['formato'],
        }),
      }),
    );
  });

  it('conserva datos validos y solicita solamente los datos faltantes', async () => {
    const dependencies = makeDependencies();
    const result = await processTextSession('123', 'sopa 1, segundo 2', makeSession(), dependencies);

    expect(result.status).toBe('invalid');
    expect(dependencies.createOrder).not.toHaveBeenCalled();
    expect(dependencies.state.current.sopa).toBe('Locro');
    expect(dependencies.state.current.segundo).toBe('Carne asada');
    expect(dependencies.state.current.step).toBe('guarnicion');
    expect(dependencies.notify.mock.calls[0][1]).toContain('Falta: guarnicion');
  });

  it('no registra cantidades fuera del rango permitido', async () => {
    const dependencies = makeDependencies();
    const result = await processTextSession(
      '123',
      'sopa 1, segundo 1, guarnicion 1, cantidad 0',
      makeSession(),
      dependencies,
    );

    expect(result.status).toBe('invalid');
    expect(dependencies.createOrder).not.toHaveBeenCalled();
    expect(dependencies.notify.mock.calls[0][1]).toContain('Valores invalidos: cantidad');
  });

  it('procesa la correccion posterior sin perder la sesion', async () => {
    const dependencies = makeDependencies();

    await processTextSession('123', 'sopa 1, segundo 1', makeSession(), dependencies);
    const incompleteSession = dependencies.state.current;
    const result = await processTextSession('123', 'guarnicion 2, cantidad 2', incompleteSession, dependencies);

    expect(result.status).toBe('created');
    expect(dependencies.createOrder).toHaveBeenCalledOnce();
    expect(dependencies.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        sopa: 'Locro',
        segundo: 'Seco de pollo',
        guarnicion: 'Ensalada',
        quantity: 2,
      }),
      '123',
    );
    expect(dependencies.clearState).toHaveBeenCalledOnce();
    expect(dependencies.notify.mock.calls.at(-1)[1]).toContain('Tu almuerzo quedo reservado');
    expect(dependencies.trace).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id_orden: 'order-1',
        outcome: 'success',
        interpreted_payload: expect.objectContaining({
          source: 'text',
          step: 'completed',
          guarnicion: 'Ensalada',
        }),
      }),
    );
  });

  it('continua el pedido aunque el registro de trazabilidad no este disponible', async () => {
    const dependencies = makeDependencies();
    dependencies.trace = vi.fn(async () => false);

    const result = await processTextSession(
      '123',
      'sopa 1, segundo 1, guarnicion 1',
      makeSession(),
      dependencies,
    );

    expect(result.status).toBe('created');
    expect(dependencies.createOrder).toHaveBeenCalledOnce();
    expect(dependencies.notify).toHaveBeenCalledOnce();
  });

  it('notifica al cliente y conserva la sesion cuando no puede registrar el pedido', async () => {
    const dependencies = makeDependencies();
    dependencies.createOrder = vi.fn(async () => {
      throw new Error('database unavailable');
    });

    const result = await processTextSession(
      '123',
      'sopa 1, segundo 1, guarnicion 2, cantidad 2',
      makeSession(),
      dependencies,
    );

    expect(result.status).toBe('failed');
    expect(dependencies.clearState).not.toHaveBeenCalled();
    expect(dependencies.saveState).toHaveBeenCalledWith(
      'session:123',
      expect.objectContaining({
        quantity: 2,
        sopa: 'Locro',
        segundo: 'Seco de pollo',
        guarnicion: 'Ensalada',
      }),
    );
    expect(dependencies.notify.mock.calls[0][1]).toContain('El pedido no fue registrado');
    expect(dependencies.notify.mock.calls[0][1]).toContain('Tus selecciones se conservaron');
    expect(dependencies.trace).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'failed',
        error_message: 'database unavailable',
        interpreted_payload: expect.objectContaining({
          step: 'registration_error',
        }),
      }),
    );
  });
});
