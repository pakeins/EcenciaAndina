import { describe, expect, it, vi } from 'vitest';
import menuCatalog from '../services/menuCatalog.js';

const { findOrCreateFood, normalizeFoodName } = menuCatalog;

const foodRow = {
  id_alimento: 8,
  nombre_alimento: 'Seco de pollo',
  id_categoria_menu: 2,
  categorias_menu: { nombre_categoria: 'Plato fuerte' },
};

const createClient = ({ existing = null, inserted = foodRow, insertError = null } = {}) => {
  const maybeSingle = vi.fn(async () => ({ data: existing, error: null }));
  const ilike = vi.fn(() => ({ maybeSingle }));
  const selectExisting = vi.fn(() => ({
    eq: vi.fn(() => ({ ilike, maybeSingle })),
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
  it('lanza error si falla la busqueda de alimento existente', async () => {
    const errorObj = new Error('DB Error');
    const client = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            ilike: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: null, error: errorObj })),
            })),
          })),
        })),
      })),
    };
    await expect(findOrCreateFood(client, { categoryId: 2, name: 'x', userId: '1' })).rejects.toThrow('DB Error');
  });

  it('lanza error si la insercion falla por un error distinto a duplicado (23505)', async () => {
    const { client } = createClient({ insertError: { code: '50000', message: 'Insert failed' } });
    await expect(findOrCreateFood(client, { categoryId: 2, name: 'x', userId: '1' })).rejects.toMatchObject({ code: '50000' });
  });

  it('recupera el registro concurrentemente insertado si recibe error de duplicidad 23505', async () => {
    // 1. First find returns null (no error)
    // 2. Insert throws 23505
    // 3. Second find returns the newly inserted row concurrently
    const maybeSingle1 = vi.fn(async () => ({ data: null, error: null }));
    const maybeSingle2 = vi.fn(async () => ({ data: foodRow, error: null }));
    let callCount = 0;
    
    const ilike = vi.fn(() => ({
      maybeSingle: vi.fn(async () => {
        callCount++;
        return callCount === 1 ? maybeSingle1() : maybeSingle2();
      })
    }));

    const client = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ ilike })),
        })),
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({ data: null, error: { code: '23505' } })),
          })),
        })),
      })),
    };

    const result = await findOrCreateFood(client, { categoryId: 2, name: 'x', userId: '1' });
    expect(result.id).toBe(8);
    expect(result.created).toBe(false);
  });

  it('lanza error si recibe 23505 pero no puede recuperar el registro', async () => {
    const { client } = createClient({ insertError: { code: '23505' } }); // first find: null, insert: 23505, second find: null
    await expect(findOrCreateFood(client, { categoryId: 2, name: 'x', userId: '1' })).rejects.toMatchObject({ code: '23505' });
  });
});
