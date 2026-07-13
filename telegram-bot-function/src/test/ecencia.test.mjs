import { describe, it, expect } from 'vitest';
import * as ecencia from '../validation/ecencia.js';

describe('Ecencia Validation', () => {
  describe('normalizePhone', () => {
    it('deberia normalizar telefonos ecuatorianos', () => {
      expect(ecencia.normalizePhone('0991234567')).toBe('593991234567');
      expect(ecencia.normalizePhone('593991234567')).toBe('593991234567');
      expect(ecencia.normalizePhone('+593 99 123 4567')).toBe('593991234567');
      expect(ecencia.normalizePhone('00593991234567')).toBe('593991234567');
    });

    it('deberia manejar valores nulos', () => {
      expect(ecencia.normalizePhone(null)).toBeUndefined();
      expect(ecencia.normalizePhone('')).toBeUndefined();
    });
  });

  describe('normalizeEmail', () => {
    it('deberia normalizar emails', () => {
      expect(ecencia.normalizeEmail('Test@Example.com  ')).toBe('test@example.com');
      expect(ecencia.normalizeEmail(null)).toBeUndefined();
    });
  });

  describe('onlyDigits', () => {
    it('deberia remover caracteres no numericos', () => {
      expect(ecencia.onlyDigits('123-456 abc')).toBe('123456');
    });
  });

  describe('isValidCedula e isValidRuc', () => {
    it('deberia validar cedulas correctamente', () => {
      expect(ecencia.isValidCedula('1710034065')).toBe(true);
      expect(ecencia.isValidCedula('1724012345')).toBe(false);
      expect(ecencia.isValidCedula('1111111111')).toBe(false);
    });

    it('deberia validar rucs correctamente', () => {
      expect(ecencia.isValidRuc('1710034065001')).toBe(true);
      expect(ecencia.isValidRuc('1790011674001')).toBe(true); // Juridico
      expect(ecencia.isValidRuc('1760001550001')).toBe(true); // Publico
      expect(ecencia.isValidRuc('1710034065000')).toBe(false); // Sucursal 000 invalido
    });
  });

});
