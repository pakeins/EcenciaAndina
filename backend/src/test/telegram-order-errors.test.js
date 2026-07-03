import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let processTextSession;
let orderConfirmation;
let quantityFromText;

const makeSession = (overrides = {}) => ({
  step: 'sopa',
  date: '2026-06-10',
  menuDate: '2026-06-10',
  menu: {
    sopas: ['Locro', 'Sopa de pollo'],
    segundos: ['Seco de pollo', 'Carne asada'],
    guarniciones: ['Arroz', 'Ensalada'],
  },
  quantity: 1,
  tipoAlmuerzo: {
    id: 6,
    code: 'ejecutivo_completo',
    label: 'Almuerzo Ejecutivo Completo $6.99',
    shortLabel: 'Almuerzo Ejecutivo Completo',
    price: 6.99,
  },
  cliente: { id_cliente: 'client-1' },
  convenio: { id_convenio: null, nombre_empresa: 'Cliente directo' },
  estadoReservadoId: 1,
  origenTelegramId: 1,
  ...overrides,
});

const makeDependencies = () => {
  const state = { current: null };
  return {
    state,
    saveState: vi.fn(async (_key, value) => {
      state.current = value;
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
  quantityFromText = telegramRouter._private.quantityFromText;
});

describe('errores en pedidos recibidos por Telegram', () => {
  it('genera una confirmacion automatica con el resumen del paquete oficial', () => {
    const message = orderConfirmation(
      {
        ...makeSession(),
        quantity: 2,
        opciones: { sopa: 'Locro', segundo: 'Seco de pollo' },
      },
      {
        id_orden: 'order-1',
        duplicate: false,
        product: { nombre_producto: 'Almuerzo Ejecutivo Completo', precio_unitario: 6.99 },
      },
    );

    expect(message).toContain('Tu almuerzo quedo reservado');
    expect(message).toContain('Tipo: Almuerzo Ejecutivo Completo');
    expect(message).toContain('Cantidad: 2');
    expect(message).toContain('Producto: Almuerzo Ejecutivo Completo');
    expect(message).toContain('Precio: $6.99');
    expect(message).toContain('Incluye: entrada, sopa, plato fuerte, postre, bebida');
    expect(message).toContain('Sopa: Locro');
    expect(message).toContain('Plato fuerte: Seco de pollo');
    expect(message).toContain('Estado: Reservado');
    expect(message).toContain('Orden: order-1');
  });

  it('rechaza texto libre y conserva la sesion para continuar por botones', async () => {
    const dependencies = makeDependencies();
    const session = makeSession({ step: 'segundo', sopa: 'Locro' });
    const result = await processTextSession('123', 'quiero lo de siempre', session, dependencies);

    expect(result.status).toBe('buttons_required');
    expect(dependencies.saveState).toHaveBeenCalledWith('session:123', session);
    expect(dependencies.notify.mock.calls[0][1]).toContain('No registro el pedido por texto');
    expect(dependencies.notify.mock.calls[0][2]).toMatchObject({
      inline_keyboard: expect.any(Array),
    });
    expect(dependencies.trace).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'failed',
        error_message: 'El flujo de reservas solo acepta botones',
        interpreted_payload: expect.objectContaining({
          source: 'text',
          step: 'segundo',
        }),
      }),
    );
  });

  it('exige escoger primero el tipo de almuerzo con botones', async () => {
    const dependencies = makeDependencies();
    const result = await processTextSession('123', 'sopa 1', makeSession({ step: 'tipo' }), dependencies);

    expect(result.status).toBe('invalid_type_required');
    expect(dependencies.saveState).not.toHaveBeenCalled();
    expect(dependencies.notify.mock.calls[0][1]).toContain('Primero elige el tipo de almuerzo');
    expect(dependencies.notify.mock.calls[0][2]).toMatchObject({
      inline_keyboard: expect.any(Array),
    });
  });

  it('interpreta cantidad antes o despues de la palabra clave sin regex', () => {
    expect(quantityFromText('cantidad 2')).toMatchObject({ provided: true, valid: true, value: 2 });
    expect(quantityFromText('almuerzos: 3')).toMatchObject({ provided: true, valid: true, value: 3 });
    expect(quantityFromText('2 pedidos')).toMatchObject({ provided: true, valid: true, value: 2 });
    expect(quantityFromText('pedido -1')).toMatchObject({ provided: true, valid: false, value: -1 });
    expect(quantityFromText('sin cantidad clara', 4)).toMatchObject({ provided: false, valid: true, value: 4 });
  });
});
