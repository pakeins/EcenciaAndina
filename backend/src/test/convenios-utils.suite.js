import { describe, it, expect } from 'vitest';
import router from '../routes/convenios.js';

const { detectDocumentMimeType, createAgreementObjectPath } = router._private;

describe('convenios.js private utilities', () => {
  describe('detectDocumentMimeType', () => {
    it('retorna application/pdf para buffers que comienzan con firma de PDF', () => {
      const pdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2D, 0x00]);
      expect(detectDocumentMimeType(pdfBuffer)).toBe('application/pdf');
    });

    it('retorna image/jpeg para buffers que comienzan con firma de JPEG', () => {
      const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00]);
      expect(detectDocumentMimeType(jpegBuffer)).toBe('image/jpeg');
    });

    it('retorna image/png para buffers que comienzan con firma de PNG', () => {
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      expect(detectDocumentMimeType(pngBuffer)).toBe('image/png');
    });

    it('retorna null para buffers desconocidos', () => {
      const unknownBuffer = Buffer.from('test');
      expect(detectDocumentMimeType(unknownBuffer)).toBeNull();
    });
  });

  describe('createAgreementObjectPath', () => {
    it('genera una ruta con ext correcta para mime conocidos', () => {
      const pathPdf = createAgreementObjectPath('conv-1', 'application/pdf');
      expect(pathPdf).toMatch(/^conv-1\/[a-f0-9-]+\.pdf$/);

      const pathJpg = createAgreementObjectPath('conv-1', 'image/jpeg');
      expect(pathJpg).toMatch(/^conv-1\/[a-f0-9-]+\.jpg$/);

      const pathPng = createAgreementObjectPath('conv-1', 'image/png');
      expect(pathPng).toMatch(/^conv-1\/[a-f0-9-]+\.png$/);
    });

    it('usa ext bin como default para mime desconocidos', () => {
      const pathUnknown = createAgreementObjectPath('conv-1', 'application/unknown');
      expect(pathUnknown).toMatch(/^conv-1\/[a-f0-9-]+\.bin$/);
    });
  });
});
