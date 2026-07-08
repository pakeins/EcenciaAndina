import { describe, it, expect } from 'vitest';
import {
  onlyDigits,
  normalizePhone,
  isValidCedula,
  isValidRuc,
  isValidEcDocument,
  isValidPhone,
  isValidEmail,
  hasMaxLength,
  isNonNegativeNumber,
  isPositiveInteger,
} from './validation';

describe('validation', () => {
  describe('onlyDigits', () => {
    it('retorna solo los digitos de una cadena', () => {
      expect(onlyDigits('abc-123-def-456')).toBe('123456');
      expect(onlyDigits('no-digits')).toBe('');
    });
  });

  describe('normalizePhone', () => {
    it('normaliza telefonos de forma correcta', () => {
      expect(normalizePhone('')).toBe('');
      expect(normalizePhone('00593998877665')).toBe('593998877665');
      expect(normalizePhone('593998877665')).toBe('593998877665');
      expect(normalizePhone('0998877665')).toBe('593998877665'); // length 10 starts with 0
      expect(normalizePhone('098765432')).toBe('098765432'); // other lengths
    });
  });

  describe('isValidCedula', () => {
    it('retorna true para cedulas ecuatorianas validas', () => {
      // Cedula valida real o algoritmica
      expect(isValidCedula('1710034065')).toBe(true);
      expect(isValidCedula('1722218763')).toBe(true);
    });

    it('retorna false para formatos invalidos', () => {
      expect(isValidCedula('171003406')).toBe(false); // corta
      expect(isValidCedula('17100340655')).toBe(false); // larga
      expect(isValidCedula('abc1003406')).toBe(false); // letras
    });

    it('retorna false para provincias o tercer digito invalido', () => {
      expect(isValidCedula('2510034065')).toBe(false); // provincia 25 (invalida)
      expect(isValidCedula('1760034065')).toBe(false); // tercer digito 6 (invalido para cedula)
    });
  });

  describe('isValidRuc', () => {
    it('retorna true para RUCs validos', () => {
      // Persona natural (tercer digito < 6, termina en 001)
      expect(isValidRuc('1710034065001')).toBe(true);
      // Sociedad privada (tercer digito = 9)
      expect(isValidRuc('1790011674001')).toBe(true);
      // Sociedad publica (tercer digito = 6)
      expect(isValidRuc('1760001550001')).toBe(true);
    });

    it('retorna false para RUCs invalidos', () => {
      expect(isValidRuc('1710034065000')).toBe(false); // no termina en 001/establecimiento
      expect(isValidRuc('2510034065001')).toBe(false); // provincia invalida
      expect(isValidRuc('1780034065001')).toBe(false); // tercer digito 8 (invalido)
    });
  });

  describe('isValidEcDocument', () => {
    it('valida cedula o RUC', () => {
      expect(isValidEcDocument('1710034065')).toBe(true);
      expect(isValidEcDocument('1710034065001')).toBe(true);
      expect(isValidEcDocument('invalido')).toBe(false);
    });
  });

  describe('isValidPhone', () => {
    it('valida longitud de telefono normalizado', () => {
      expect(isValidPhone('')).toBe(true);
      expect(isValidPhone('593998877665')).toBe(true);
      expect(isValidPhone('1234567')).toBe(false); // muy corto
      expect(isValidPhone('1234567890123456')).toBe(false); // muy largo
    });
  });

  describe('isValidEmail', () => {
    it('valida la estructura del correo electronico', () => {
      expect(isValidEmail('test@example.com')).toBe(true);
      expect(isValidEmail('test@example')).toBe(false);
      expect(isValidEmail('test.com')).toBe(false);
    });

    it('retorna false si excede el limite de caracteres', () => {
      const longEmail = 'a'.repeat(250) + '@test.com';
      expect(isValidEmail(longEmail)).toBe(false);
    });
  });

  describe('hasMaxLength', () => {
    it('valida longitud maxima de cadena', () => {
      expect(hasMaxLength('hola', 5)).toBe(true);
      expect(hasMaxLength('hola', 3)).toBe(false);
    });
  });

  describe('isNonNegativeNumber', () => {
    it('retorna true para numeros finitos no negativos', () => {
      expect(isNonNegativeNumber(10)).toBe(true);
      expect(isNonNegativeNumber(0)).toBe(true);
      expect(isNonNegativeNumber('5.5')).toBe(true);
    });

    it('retorna false para negativos o no numericos', () => {
      expect(isNonNegativeNumber(-1)).toBe(false);
      expect(isNonNegativeNumber('abc')).toBe(false);
      expect(isNonNegativeNumber(Infinity)).toBe(false);
    });
  });

  describe('isPositiveInteger', () => {
    it('retorna true para enteros positivos', () => {
      expect(isPositiveInteger(10)).toBe(true);
      expect(isPositiveInteger('5')).toBe(true);
    });

    it('retorna false para no enteros, cero o negativos', () => {
      expect(isPositiveInteger(0)).toBe(false);
      expect(isPositiveInteger(5.5)).toBe(false);
      expect(isPositiveInteger(-5)).toBe(false);
      expect(isPositiveInteger('abc')).toBe(false);
    });
  });
});
