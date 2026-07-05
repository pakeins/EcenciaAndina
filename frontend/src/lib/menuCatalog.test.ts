import { describe, expect, it } from 'vitest';
import { mergeFoodCatalog } from './menuCatalog';

describe('catalogo del menu', () => {
  it('propaga un alimento nuevo sin duplicarlo', () => {
    const food = { id: 8, nombre: 'Seco de pollo', id_categoria: 2 };
    expect(mergeFoodCatalog([], food)).toEqual([food]);
    expect(mergeFoodCatalog([food], food)).toEqual([food]);
  });
});
