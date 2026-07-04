import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { findOrCreateFood, normalizeFoodName } = require('../services/menuCatalog.js');

const foodRow = {
  id_alimento: 8,
  nombre_alimento: 'Seco de pollo',
  id_categoria_menu: 2,
  categorias_menu: { nombre_categoria: 'Plato fuerte' },
};

const createClient = ({ existing = null, inserted = foodRow, insertError = null } = {}) => {
  const maybeSingle = vi.fn(async () => ({ data: existing, error: null }));
  const selectExisting = vi.fn(() => ({
    eq: vi.fn().mockReturnThis(),
    maybeSingle,
  }));
  const single = vi.fn(async () => ({ data: inserted, error: insertError }));
  const insert = vi.fn(() => ({
    select: vi.fn(() => ({ single })),
  }));

  return {
    client: {
      from: vi.fn(() => ({
        select: selectExisting,
        insert,
      })),
    },
    insert,
    maybeSingle,
  };
};

describe('catalogo de alimentos del menu', () => {
  it('normaliza mayusculas y espacios para evitar duplicados', () => {
    expect(normalizeFoodName('  Seco   DE Pollo ')).toBe('seco de pollo');
  });

  it('devuelve el alimento existente sin intentar insertarlo', async () => {
    const { client, insert } = createClient({ existing: foodRow });
    const result = await findOrCreateFood(client, {
      categoryId: 2,
      name: ' seco de pollo ',
      userId: 'user-id',
    });

    expect(result).toMatchObject({
      id: 8,
      nombre: 'Seco de pollo',
      id_categoria: 2,
      created: false,
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it('crea un plato nuevo y colapsa espacios antes de guardarlo', async () => {
    const { client, insert } = createClient();
    const result = await findOrCreateFood(client, {
      categoryId: 2,
      name: 'Seco   de pollo',
      userId: 'user-id',
    });

    expect(insert).toHaveBeenCalledWith({
      id_categoria_menu: 2,
      nombre_alimento: 'Seco de pollo',
      created_by: 'user-id',
    });
    expect(result.created).toBe(true);
  });
});
