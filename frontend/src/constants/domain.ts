export const CLIENT_TYPE = {
  AGREEMENT: 1,
  DIRECT: 2,
} as const;

export const ORDER_STATE = {
  RESERVED: 1,
  CONSUMED: 2,
  CANCELLED: 3,
} as const;

export const ORDER_SOURCE = {
  TELEGRAM: 1,
  SYSTEM: 2,
} as const;

export const MENU_CATEGORY_CODE = {
  SOUPS: 'sopas',
  MAINS: 'segundos',
  SIDES: 'guarniciones',
} as const;

export type MenuCategoryCode = (typeof MENU_CATEGORY_CODE)[keyof typeof MENU_CATEGORY_CODE];
