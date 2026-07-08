import { describe, it, expect } from 'vitest';
import {
  MAX_LENGTHS,
  schemas,
  parseBody,
  sendValidationError,
  onlyDigits,
  normalizeEmail,
  normalizePhone,
  isValidCedula,
  isValidRuc,
} from '../validation/eciencia';

describe('Validaciones de Utilidad', () => {
  it('onlyDigits', () => {
    expect(onlyDigits('123abc456')).toBe('123456');
    expect(onlyDigits(null)).toBe('');
    expect(onlyDigits(undefined)).toBe('');
  });

  it('normalizeEmail', () => {
    expect(normalizeEmail(' Test@Example.com ')).toBe('test@example.com');
    expect(normalizeEmail('')).toBeUndefined();
    expect(normalizeEmail(null)).toBeUndefined();
  });

  it('normalizePhone', () => {
    expect(normalizePhone('0991234567')).toBe('593991234567');
    expect(normalizePhone('593991234567')).toBe('593991234567');
    expect(normalizePhone('00593991234567')).toBe('593991234567');
    expect(normalizePhone('2234567')).toBe('2234567');
    expect(normalizePhone(null)).toBeUndefined();
  });

  it('isValidCedula', () => {
    expect(isValidCedula('1710034065')).toBe(true);
    expect(isValidCedula('1710034064')).toBe(false); // Check digit incorrect
    expect(isValidCedula('3010034065')).toBe(false); // Invalid province
    expect(isValidCedula('1760034065')).toBe(false); // Invalid third digit for cedula
    expect(isValidCedula('171003')).toBe(false); // Too short
  });

  it('isValidRuc', () => {
    // Natural person RUC
    expect(isValidRuc('1710034065001')).toBe(true);
    // Public society RUC (third digit 6)
    expect(isValidRuc('1760001040001')).toBe(true); // Example valid RUC public
    // Private society RUC (third digit 9)
    expect(isValidRuc('1790011674001')).toBe(true); // Example valid RUC private
    
    expect(isValidRuc('1710034065000')).toBe(false); // Ends in 000
    expect(isValidRuc('3010034065001')).toBe(false); // Invalid province
    expect(isValidRuc('1770001040001')).toBe(false); // Invalid third digit
  });
});

describe('Schemas and parseBody', () => {
  it('parseBody successfully parses valid data', () => {
    const data = { identifier: 'test', password: 'password123' };
    const result = parseBody(schemas.login, { email: 'test@test.com', password: 'password123' });
    expect(result.email).toBe('test@test.com');
    expect(result.password).toBe('password123');
  });

  it('parseBody throws properly formatted error for invalid data', () => {
    try {
      parseBody(schemas.login, { email: 'not-an-email', password: '' });
      expect.fail('Deberia haber lanzado error');
    } catch (error) {
      expect(error.status).toBe(400);
      expect(error.payload.detalles).toBeInstanceOf(Array);
      expect(error.payload.detalles.length).toBeGreaterThan(0);
    }
  });

  it('sendValidationError handles custom validation errors', () => {
    const res = {
      status: function (code) { this.statusCode = code; return this; },
      json: function (payload) { this.body = payload; },
    };
    const error = { status: 400, payload: { error: 'Test error', detalles: [] } };
    
    const handled = sendValidationError(res, error);
    expect(handled).toBe(true);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Test error');
  });

  it('sendValidationError ignores non-validation errors', () => {
    const res = {};
    const handled = sendValidationError(res, new Error('Something else'));
    expect(handled).toBe(false);
  });
});

describe('Specific Schemas', () => {
  it('clienteCreate validates correctly', () => {
    const valid = {
      cedula: '1710034065',
      nombre: 'Juan',
      apellido: 'Perez',
      telefono: '0991234567',
      correo: 'juan@test.com'
    };
    const parsed = parseBody(schemas.clienteCreate, valid);
    expect(parsed.cedula).toBe('1710034065');
    expect(parsed.telefono).toBe('0991234567'); // only digits, no 593 normalize
    expect(parsed.id_tipo_cliente).toBe(1); // default
  });

  it('convenioCreate validates correctly', () => {
    const valid = {
      ruc: '1710034065001',
      nombre_empresa: 'Empresa S.A.',
      fecha_inicio: '2023-01-01',
      fecha_caducidad: '2023-12-31'
    };
    const parsed = parseBody(schemas.convenioCreate, valid);
    expect(parsed.ruc).toBe('1710034065001');
    expect(parsed.cupo_maximo).toBe(0);
  });

  it('menuDashboard validates correctly', () => {
    const valid = {
      opciones: {
        'Sopa': ['Locro', 'Sancocho']
      }
    };
    const parsed = parseBody(schemas.menuDashboard, valid);
    expect(parsed.opciones.Sopa).toEqual(['Locro', 'Sancocho']);
  });
  
  it('ordenCreate validates correctly', () => {
    const valid = {
      id_cliente: '123e4567-e89b-12d3-a456-426614174000',
      id_estado: 1,
      id_origen: 2,
      detalles: [
        { id_producto: 1, cantidad: 2, precio_aplicado: 1.50 }
      ]
    };
    const parsed = parseBody(schemas.ordenCreate, valid);
    expect(parsed.detalles[0].precio_aplicado).toBe(1.50);
  });
});
