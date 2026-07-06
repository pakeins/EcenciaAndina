const CLIENT_TYPE = Object.freeze({
  AGREEMENT: 1,
  DIRECT: 2,
});

const ORDER_STATE = Object.freeze({
  RESERVED: 1,
  CONSUMED: 2,
  CANCELLED: 3,
});

const ORDER_SOURCE = Object.freeze({
  TELEGRAM: 1,
  SYSTEM: 2,
});

const ROLE = Object.freeze({
  ADMIN: 1,
  CASHIER: 2,
});

const MENU_CATEGORY_CODE = Object.freeze({
  SOUPS: 'sopas',
  MAINS: 'segundos',
  SIDES: 'guarniciones',
});

module.exports = {
  CLIENT_TYPE,
  MENU_CATEGORY_CODE,
  ORDER_SOURCE,
  ORDER_STATE,
  ROLE,
};
