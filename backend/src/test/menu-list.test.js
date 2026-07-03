import { beforeAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let groupMenuRows;

const row = (fecha, name, category, imagenUrl = null) => ({
  fecha,
  imagen_url: imagenUrl,
  alimentos: {
    nombre_alimento: name,
    categorias_menu: { nombre_categoria: category },
  },
});

beforeAll(() => {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';
  const menuRouter = require('../routes/menu.js');
  groupMenuRows = menuRouter._private.groupMenuRows;
});

describe('listado de menus', () => {
  it('agrupa y ordena los menus mostrando fecha, estado y opciones', () => {
    const menus = groupMenuRows(
      [
        row('2026-06-09', 'Locro', 'Sopas'),
        row('2026-06-10', 'Seco de pollo', 'Segundos'),
        row('2026-06-10', 'Arroz', 'Guarniciones'),
        row('2026-06-10', 'Sopa de pollo', 'Sopas'),
      ],
      '2026-06-10',
      new Map([
        ['2026-06-10', { last_sent_at: '2026-06-10T14:00:00.000Z', send_count: 2 }],
      ]),
    );

    expect(menus).toHaveLength(2);
    expect(menus[0]).toMatchObject({
      fecha: '2026-06-10',
      estado: 'activo',
      sopas: ['Sopa de pollo'],
      segundos: ['Seco de pollo'],
      guarniciones: ['Arroz'],
      opciones: 3,
      enviado: true,
      sent_at: '2026-06-10T14:00:00.000Z',
      send_count: 2,
    });
    expect(menus[1]).toMatchObject({
      fecha: '2026-06-09',
      estado: 'inactivo',
      opciones: 1,
      enviado: false,
    });
  });

  it('devuelve una lista vacia cuando no existen menus', () => {
    expect(groupMenuRows([], null)).toEqual([]);
  });
});
