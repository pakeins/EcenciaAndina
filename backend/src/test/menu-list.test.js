import { beforeAll, describe, expect, it } from 'vitest';
import menuRouter from '../routes/menu.js';

let groupMenuRows;
let addLegacyFields;

const row = (fecha, name, categoryId, categoryName, imagenUrl = null) => ({
  fecha,
  imagen_url: imagenUrl,
  alimentos: {
    nombre_alimento: name,
    id_categoria_menu: categoryId,
    categorias_menu: { nombre_categoria: categoryName, id_categoria_menu: categoryId },
  },
});

const categories = [
  { id_categoria_menu: 1, nombre_categoria: 'Sopas' },
  { id_categoria_menu: 2, nombre_categoria: 'Segundos' },
  { id_categoria_menu: 3, nombre_categoria: 'Guarniciones' },
];

beforeAll(() => {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';
  groupMenuRows = menuRouter._private.groupMenuRows;
  addLegacyFields = menuRouter._private.addLegacyFields || ((m) => m);
});

describe('listado de menus', () => {
  it('agrupa y ordena los menus mostrando fecha, estado y opciones', () => {
    const raw = groupMenuRows(
      [
        row('2026-06-09', 'Locro', 1, 'Sopas'),
        row('2026-06-10', 'Seco de pollo', 2, 'Segundos'),
        row('2026-06-10', 'Arroz', 3, 'Guarniciones'),
        row('2026-06-10', 'Sopa de pollo', 1, 'Sopas'),
      ],
      '2026-06-10',
    );

    const menus = addLegacyFields ? addLegacyFields(raw, categories) : raw;

    expect(menus).toHaveLength(2);
    expect(menus[0]).toMatchObject({
      fecha: '2026-06-10',
      estado: 'activo',
      sopas: ['Sopa de pollo'],
      segundos: ['Seco de pollo'],
      guarniciones: ['Arroz'],
      opciones_count: 3,
    });
    expect(menus[1]).toMatchObject({
      fecha: '2026-06-09',
      estado: 'inactivo',
      opciones_count: 1,
    });
  });

  it('devuelve una lista vacia cuando no existen menus', () => {
    expect(groupMenuRows([], null)).toEqual([]);
  });
});
