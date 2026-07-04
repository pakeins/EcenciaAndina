import { beforeAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let quantityFromText;
let parseTextOrder;

const makeSession = (overrides = {}) => ({
  step: 'sopa',
  quantity: 1,
  menu: {
    sopas: ['Locro', 'Sopa de pollo'],
    segundos: ['Seco de pollo', 'Carne asada'],
    guarniciones: ['Arroz', 'Ensalada'],
  },
  ...overrides,
});

beforeAll(() => {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';
  const telegramRouter = require('../routes/telegram.js');
  quantityFromText = telegramRouter._private.quantityFromText;
  parseTextOrder = telegramRouter._private.parseTextOrder;
});

describe('quantityFromText', () => {
  it('lee la cantidad despues de la etiqueta con separador (cantidad: 3)', () => {
    expect(quantityFromText('cantidad: 3')).toEqual({ provided: true, valid: true, value: 3 });
  });

  it('lee la cantidad antes de la etiqueta (3 almuerzos)', () => {
    expect(quantityFromText('3 almuerzos')).toEqual({ provided: true, valid: true, value: 3 });
  });

  it('marca invalida una cantidad negativa (pedido -2)', () => {
    expect(quantityFromText('pedido -2')).toEqual({ provided: true, valid: false, value: -2 });
  });

  it('marca invalida una cantidad fuera de rango (50 pedidos)', () => {
    expect(quantityFromText('quiero 50 pedidos')).toEqual({ provided: true, valid: false, value: 50 });
  });

  it('sin cantidad mantiene el valor actual y no marca provista', () => {
    expect(quantityFromText('hola, buenos dias', 4)).toEqual({ provided: false, valid: true, value: 4 });
  });

  it('descarta numeros con mas digitos del maximo (sin word boundary)', () => {
    // "cantidad 1234": tras leer 3 digitos el siguiente sigue siendo digito,
    // asi que readSignedNumberAt devuelve null y no se detecta cantidad.
    expect(quantityFromText('cantidad 1234').provided).toBe(false);
  });
});

describe('parseTextOrder', () => {
  it('arma un pedido completo seleccionando por numero con separador', () => {
    const result = parseTextOrder('sopa: 1, segundo: 1, cantidad: 2', makeSession());

    expect(result.valid).toBe(true);
    expect(result.invalid).toEqual([]);
    expect(result.missing).toEqual([]);
    expect(result.session).toMatchObject({
      sopa: 'Locro',
      segundo: 'Seco de pollo',
      quantity: 2,
    });
  });

  it('selecciona opciones por su nombre', () => {
    const result = parseTextOrder('quiero locro con carne asada', makeSession());

    expect(result.session).toMatchObject({
      sopa: 'Locro',
      segundo: 'Carne asada',
    });
    expect(result.valid).toBe(true);
  });

  it('marca invalida una seleccion numerica fuera de rango', () => {
    const result = parseTextOrder('sopa: 9', makeSession());

    expect(result.invalid).toContain('sopa');
    expect(result.valid).toBe(false);
  });

  it('reporta formato invalido cuando no hay ninguna seleccion reconocible', () => {
    const result = parseTextOrder('mensaje sin nada util', makeSession());

    expect(result.invalid).toContain('formato');
    expect(result.valid).toBe(false);
  });

  it('lista lo que falta cuando el pedido es parcial', () => {
    const result = parseTextOrder('sopa: 1', makeSession());

    expect(result.missing).toEqual(['plato fuerte']);
    expect(result.session.sopa).toBe('Locro');
  });

  it('no exige sopa para paquetes simples sin sopa', () => {
    const result = parseTextOrder('segundo: 2', makeSession({
      tipoAlmuerzo: { code: 'almuerzo_dia_simple' },
    }));

    expect(result.valid).toBe(true);
    expect(result.session).toMatchObject({
      segundo: 'Carne asada',
    });
  });
});
