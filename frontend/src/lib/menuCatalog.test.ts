import { describe, expect, it } from 'vitest';
import { MENU_CATEGORY_CODE } from '@/constants/domain';
import { getMenuCategoryId, mergeFoodCatalog } from './menuCatalog';

const categories = [
  { id_categoria_menu: 1, nombre_categoria: 'Sopa', codigo: MENU_CATEGORY_CODE.SOUPS },
  { id_categoria_menu: 2, nombre_categoria: 'Plato fuerte', codigo: MENU_CATEGORY_CODE.MAINS },
  { id_categoria_menu: 3, nombre_categoria: 'Guarnicion', codigo: MENU_CATEGORY_CODE.SIDES },
];

describe('catalogo del menu', () => {
  it('resuelve plato fuerte por codigo y no por el nombre visible', () => {
    expect(getMenuCategoryId(categories, MENU_CATEGORY_CODE.MAINS)).toBe(2);
  });

  it('propaga un alimento nuevo sin duplicarlo', () => {
    const food = { id: 8, nombre: 'Seco de pollo', id_categoria: 2 };
    expect(mergeFoodCatalog([], food)).toEqual([food]);
    expect(mergeFoodCatalog([food], food)).toEqual([food]);
  });
});
