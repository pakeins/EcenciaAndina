import { describe, it, expect } from 'vitest';
import validation from '../validation/ecencia.js';

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
});
