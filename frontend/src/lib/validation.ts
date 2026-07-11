export const FIELD_LIMITS = {
  nombre: 60,
  empresa: 120,
  email: 254,
  factura: 50,
  descripcion: 300,
  observaciones: 500,
  menuOption: 80,
};

export const onlyDigits = (value: string) => value.replace(/\D/g, '');

export const normalizePhone = (value: string) => {
  const digits = onlyDigits(value);
  if (!digits) return '';
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('593')) return digits;
  if (digits.length === 10 && digits.startsWith('0')) return `593${digits.slice(1)}`;
  return digits;
};

export const isValidCedula = (value: string) => {
  const cedula = onlyDigits(value);
  if (!/^\d{10}$/.test(cedula)) return false;

  const province = Number(cedula.slice(0, 2));
  const thirdDigit = Number(cedula[2]);
  if (province < 1 || province > 24 || thirdDigit > 5) return false;

  const coefficients = [2, 1, 2, 1, 2, 1, 2, 1, 2];
  const sum = coefficients.reduce((total, coefficient, index) => {
    let product = Number(cedula[index]) * coefficient;
    if (product >= 10) product -= 9;
    return total + product;
  }, 0);

  const expected = (10 - (sum % 10)) % 10;
  return expected === Number(cedula[9]);
};

const modulo11Digit = (digits: string, coefficients: number[]) => {
  const sum = coefficients.reduce((total, coefficient, index) => total + Number(digits[index]) * coefficient, 0);
  const result = 11 - (sum % 11);
  if (result === 11) return 0;
  if (result === 10) return -1;
  return result;
};

export const isValidRuc = (value: string) => {
  const ruc = onlyDigits(value);
  if (!/^\d{13}$/.test(ruc) || ruc.slice(10) === '000') return false;

  const province = Number(ruc.slice(0, 2));
  const thirdDigit = Number(ruc[2]);
  if (province < 1 || province > 24) return false;

  if (thirdDigit < 6) return isValidCedula(ruc.slice(0, 10));
  if (thirdDigit === 6) return modulo11Digit(ruc, [3, 2, 7, 6, 5, 4, 3, 2]) === Number(ruc[8]);
  if (thirdDigit === 9) return modulo11Digit(ruc, [4, 3, 2, 7, 6, 5, 4, 3, 2]) === Number(ruc[9]);
  return false;
};

export const isValidEcDocument = (value: string) => isValidCedula(value) || isValidRuc(value);

export const isValidPhone = (value: string) => {
  const phone = normalizePhone(value);
  return !phone || /^\d{8,15}$/.test(phone);
};

export const isValidEmail = (value: string) =>
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/.test(value.trim().toLowerCase()) &&
  value.trim().length <= FIELD_LIMITS.email;

export const hasMaxLength = (value: string, max: number) => value.trim().length <= max;

export const isNonNegativeNumber = (value: string | number) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0;
};

export const isPositiveInteger = (value: string | number) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0;
};
