import { describe, it, expect } from 'vitest';
import { _private } from '../routes/menu.js';

const {
  hasCompleteMenu,
  menuPayloadEquals,
  validateMenuImageInput
} = _private;

describe('menu.js private utilities', () => {
  describe('hasCompleteMenu', () => {
    it('retorna false si no hay payload', () => {
      expect(hasCompleteMenu(null)).toBe(false);
      expect(hasCompleteMenu(undefined)).toBe(false);
    });

    it('retorna false si opciones esta vacio', () => {
      expect(hasCompleteMenu({ opciones: {} })).toBe(false);
    });

    it('retorna true si tiene opciones validas', () => {
      expect(hasCompleteMenu({ opciones: { '1': ['Sopa'] } })).toBe(true);
    });
  });

  describe('menuPayloadEquals', () => {
    it('compara payloads identicos pero desordenados', () => {
      const a = { opciones: { '2': ['Pollo', 'Res'], '1': ['Sopa'] } };
      const b = { opciones: { '1': ['Sopa'], '2': ['Res', 'Pollo'] } };
      expect(menuPayloadEquals(a, b)).toBe(true);
    });

    it('retorna false si la longitud de keys es diferente', () => {
      const a = { opciones: { '1': ['Sopa'] } };
      const b = { opciones: { '1': ['Sopa'], '2': ['Pollo'] } };
      expect(menuPayloadEquals(a, b)).toBe(false);
    });

    it('maneja valores vacios', () => {
      expect(menuPayloadEquals(null, undefined)).toBe(true);
      expect(menuPayloadEquals({}, { opciones: {} })).toBe(true);
    });
  });

  describe('validateMenuImageInput', () => {
    it('lanza error si es obligatoria y falta', () => {
      expect(() => validateMenuImageInput(null, { required: true })).toThrow('La imagen del menu es obligatoria');
      expect(() => validateMenuImageInput(undefined, { required: true })).toThrow('La imagen del menu es obligatoria');
    });

    it('lanza error si la URL usa HTTP', () => {
      expect(() => validateMenuImageInput('http://example.com/img.png')).toThrow('La URL publica de imagen del menu debe usar HTTPS');
    });

    it('pasa si la URL usa HTTPS', () => {
      expect(validateMenuImageInput('https://example.com/img.png')).toBe(true);
    });

    it('lanza error si el base64 no tiene la cabecera correcta', () => {
      expect(() => validateMenuImageInput('data:image/gif;base64,R0lG')).toThrow('La imagen del menu debe ser JPG, PNG o WebP valida');
    });

    it('lanza error si la firma real de los bytes no coincide', () => {
      const fakeBase64 = Buffer.from('test').toString('base64');
      expect(() => validateMenuImageInput(`data:image/png;base64,${fakeBase64}`)).toThrow('La imagen del menu debe ser JPG, PNG o WebP valida');
    });

    it('pasa con un base64 valido (firma de PNG)', () => {
      const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      expect(validateMenuImageInput(`data:image/png;base64,${pngSignature.toString('base64')}`)).toBe(true);
    });

    it('pasa con un base64 valido (firma de JPEG)', () => {
      const jpegSignature = Buffer.from([0xFF, 0xD8, 0xFF]);
      expect(validateMenuImageInput(`data:image/jpeg;base64,${jpegSignature.toString('base64')}`)).toBe(true);
    });

    it('pasa con un base64 valido (firma de WEBP)', () => {
      const webpSignature = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
      expect(validateMenuImageInput(`data:image/webp;base64,${webpSignature.toString('base64')}`)).toBe(true);
    });
  });
});
