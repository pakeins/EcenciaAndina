import type { MenuCategoryCode } from '@/constants/domain';
import type { Alimento } from '@/types';

export interface MenuCategory {
  id_categoria_menu: number;
  nombre_categoria: string;
  codigo: MenuCategoryCode;
}

export const getMenuCategoryId = (categories: MenuCategory[], code: MenuCategoryCode) =>
  categories.find((category) => category.codigo === code)?.id_categoria_menu || 0;

export const mergeFoodCatalog = (foods: Alimento[], food: Alimento) => {
  if (foods.some((item) => item.id === food.id)) return foods;
  return [...foods, food];
};
