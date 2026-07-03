import { describe, it, expect } from 'vitest';
import validation from '../validation/eciencia.js';

const { isValidCedula, isValidRuc, normalizePhone, parseBody, schemas } = validation;

describe('validaciones Ecuador', () => {
  it('valida cedulas ecuatorianas por checksum', () => {
    expect(isValidCedula('1710034065')).toBe(true);
    expect(isValidCedula('1710034064')).toBe(false);
    expect(isValidCedula('0010034065')).toBe(false);
  });

  it('valida RUC de persona natural', () => {
    expect(isValidRuc('1710034065001')).toBe(true);
    expect(isValidRuc('1710034065000')).toBe(false);
    expect(isValidRuc('1710034064001')).toBe(false);
  });

  it('normaliza telefonos ecuatorianos locales a formato 593', () => {
    expect(normalizePhone('099 831 3804')).toBe('593998313804');
    expect(normalizePhone('+593 99 831 3804')).toBe('593998313804');
  });

  it('rechaza negativos y textos fuera de limite en productos', () => {
    expect(() =>
      parseBody(schemas.productoCreate, {
        id_categoria: 1,
        nombre: 'Almuerzo',
        precio: -1,
      }),
    ).toThrow(/negativo/);

    expect(() =>
      parseBody(schemas.productoCreate, {
        id_categoria: 1,
        nombre: 'A'.repeat(81),
        precio: 3.5,
      }),
    ).toThrow(/80/);
  });

  it('acepta nombres con tildes y rechaza numeros o simbolos', () => {
    const payload = {
      cedula: '1710034065',
      nombre: '  María José  ',
      apellido: 'Ñañez',
      email: 'QA@Example.com',
    };

    expect(parseBody(schemas.clienteCreate, payload).nombre).toBe('María José');
    expect(parseBody(schemas.clienteCreate, payload).email).toBe('qa@example.com');

    expect(() =>
      parseBody(schemas.clienteCreate, {
        ...payload,
        nombre: 'QA 123',
      }),
    ).toThrow(/letras y espacios/);

    expect(() =>
      parseBody(schemas.clienteCreate, {
        ...payload,
        apellido: '<script>',
      }),
    ).toThrow(/letras y espacios/);
  });

  it('valida recargas monetarias decimales positivas', () => {
    expect(parseBody(schemas.recarga, {
      monto_total: '12.50',
      numero_factura: 'FAC-001',
    })).toEqual({
      monto_total: 12.5,
      numero_factura: 'FAC-001',
    });

    expect(() =>
      parseBody(schemas.recarga, {
        monto_total: 0,
        numero_factura: 'FAC-001',
      }),
    ).toThrow(/mayor a 0/);
  });

  it('exige correo valido al crear clientes', () => {
    expect(() =>
      parseBody(schemas.clienteCreate, {
        cedula: '1710034065',
        nombre: 'Ana',
        apellido: 'Perez',
        email: 'correo-invalido',
      }),
    ).toThrow(/correo no es valido/i);
  });

  it('acepta tipo de almuerzo en productos y detalles de orden', () => {
    expect(parseBody(schemas.productoCreate, {
      id_categoria: 1,
      nombre: 'Almuerzo del Dia',
      precio: 4.5,
      id_tipo_almuerzo_default: 9,
    }).id_tipo_almuerzo_default).toBe(9);

    expect(parseBody(schemas.productoUpdate, {
      id_tipo_almuerzo_default: null,
    }).id_tipo_almuerzo_default).toBeNull();

    const detalle = parseBody(schemas.ordenCreate, {
      id_cliente: '11111111-1111-4111-8111-111111111111',
      id_estado: 1,
      id_origen: 1,
      metodo_pago: 'Pendiente',
      detalles: [{
        id_producto: 1,
        cantidad: 1,
        precio_aplicado: 4.5,
        id_tipo_almuerzo: 4,
        observaciones_tipo: 'Sin lactosa',
        opciones: { sopa: 'Locro' },
      }],
    }).detalles[0];

    expect(detalle.id_tipo_almuerzo).toBe(4);
    expect(detalle.observaciones_tipo).toBe('Sin lactosa');
  });

  it('acepta variantes opcionales en menu dashboard', () => {
    const payload = parseBody(schemas.menuDashboard, {
      sopas: ['Locro'],
      segundos: ['Pollo al horno'],
      guarniciones: ['Ensalada'],
      variantes: {
        vegetariano: {
          sopas: ['Crema de vegetales'],
          segundos: ['Menestra'],
          guarniciones: ['Maduro'],
        },
        especial: {
          sopas: [],
          segundos: ['Pescado'],
          guarniciones: [],
        },
      },
    });

    expect(payload.variantes.vegetariano.segundos).toEqual(['Menestra']);
    expect(payload.variantes.especial.segundos).toEqual(['Pescado']);
  });
});
