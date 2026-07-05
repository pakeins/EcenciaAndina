import type { Alimento } from '@/types';

export interface MenuCategory {
  id_categoria_menu: number;
  nombre_categoria: string;
}

export const mergeFoodCatalog = (foods: Alimento[], food: Alimento) => {
  if (foods.some((item) => item.id === food.id)) return foods;
  return [...foods, food];
};
