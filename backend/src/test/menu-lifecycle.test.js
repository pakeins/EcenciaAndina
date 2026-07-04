import { beforeAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let menuPrivate;

beforeAll(() => {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';
  menuPrivate = require('../routes/menu.js')._private;
});

describe('ciclo de vida de menu diario', () => {
  it('considera valido solo un menu con una opcion en cada apartado', () => {
    expect(menuPrivate.hasCompleteMenu({
      sopas: ['Locro'],
      segundos: ['Seco de pollo'],
      guarniciones: ['Arroz'],
    })).toBe(true);

    expect(menuPrivate.hasCompleteMenu({
      sopas: ['Locro'],
      segundos: [],
      guarniciones: ['Arroz'],
    })).toBe(false);
  });

  it('compara menus normalizando espacios y opciones vacias', () => {
    expect(menuPrivate.menuPayloadEquals(
      {
        sopas: [' Locro ', ''],
        segundos: ['Seco de pollo'],
        guarniciones: ['Arroz'],
      },
      {
        sopas: ['Locro'],
        segundos: ['Seco de pollo'],
        guarniciones: ['Arroz'],
      },
    )).toBe(true);

    expect(menuPrivate.menuPayloadEquals(
      {
        sopas: ['Locro'],
        segundos: ['Seco de pollo'],
        guarniciones: ['Arroz'],
      },
      {
        sopas: ['Locro'],
        segundos: ['Carne asada'],
        guarniciones: ['Arroz'],
      },
    )).toBe(false);
  });

  it('valida imagenes de menu con errores controlados', () => {
    const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64');

    expect(menuPrivate.validateMenuImageInput(`data:image/png;base64,${pngSignature}`)).toBe(true);

    expect(() => menuPrivate.validateMenuImageInput(null, { required: true })).toThrow(
      'La imagen del menu es obligatoria',
    );
    expect(() => menuPrivate.validateMenuImageInput('http://example.com/menu.png')).toThrow(
      'debe usar HTTPS',
    );
    expect(() => menuPrivate.validateMenuImageInput('data:image/png;base64,no-es-imagen')).toThrow(
      'debe ser JPG, PNG o WebP valida',
    );
  });
});
