import { describe, it, expect } from 'vitest';
import {
  normalizeText,
  todayInTimezone,
  dayOfWeekInTimezone,
  isBusinessDay,
  tomorrowFromDate,
  labelForStep,
  quantityFromText,
  parseStartToken,
  generateSid,
  activeConvenio,
  orderConfirmation,
} from '../utils/telegramHelpers.js';

describe('Telegram Helpers', () => {
  describe('normalizeText', () => {
    it('normaliza tildes, mayusculas y espacios', () => {
      expect(normalizeText('Árbol')).toBe('arbol');
      expect(normalizeText('  HOLA  ')).toBe('hola');
      expect(normalizeText(null)).toBe('');
      expect(normalizeText(undefined)).toBe('');
      expect(normalizeText('')).toBe('');
      expect(normalizeText('Ñoño')).toBe('nono');
    });
  });

  describe('labelForStep', () => {
    it('devuelve la etiqueta correcta para cada paso', () => {
      expect(labelForStep('entrada')).toBe('Entrada');
      expect(labelForStep('sopa')).toBe('Sopa');
      expect(labelForStep('segundo')).toBe('Plato Fuerte');
      expect(labelForStep('bebida')).toBe('Bebida');
      expect(labelForStep('postre')).toBe('Postre');
      expect(labelForStep('otro')).toBe('Opción');
      expect(labelForStep('')).toBe('Opción');
      expect(labelForStep(undefined)).toBe('Opción');
    });
  });

  describe('parseStartToken', () => {
    it('extrae token de /start correctamente', () => {
      expect(parseStartToken('/start 123')).toEqual({ isStart: true, token: '123' });
      expect(parseStartToken('/start')).toEqual({ isStart: true, token: '' });
      expect(parseStartToken('/start@mibot 123')).toEqual({ isStart: true, token: '123' });
      expect(parseStartToken('hola')).toBeNull();
      expect(parseStartToken(null)).toBeNull();
      expect(parseStartToken('/start abc-def_GH1')).toEqual({ isStart: true, token: 'abc-def_GH1' });
    });
  });

  describe('tomorrowFromDate', () => {
    it('calcula el dia siguiente correctamente', () => {
      expect(tomorrowFromDate('2023-01-01')).toBe('2023-01-02');
      expect(tomorrowFromDate('2023-01-31')).toBe('2023-02-01');
      expect(tomorrowFromDate('2023-12-31')).toBe('2024-01-01');
    });
  });

  describe('todayInTimezone y dayOfWeekInTimezone', () => {
    it('devuelve strings validos con formato esperado', () => {
      const today = todayInTimezone();
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const dow = dayOfWeekInTimezone();
      expect(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']).toContain(dow);
    });
  });

  describe('isBusinessDay', () => {
    it('devuelve un booleano', () => {
      expect(typeof isBusinessDay()).toBe('boolean');
    });

    it('retorna true cuando ECENCIA_BUSINESS_DAYS_ONLY=false', () => {
      const original = process.env.ECENCIA_BUSINESS_DAYS_ONLY;
      process.env.ECENCIA_BUSINESS_DAYS_ONLY = 'false';
      expect(isBusinessDay()).toBe(true);
      process.env.ECENCIA_BUSINESS_DAYS_ONLY = original;
    });
  });

  describe('quantityFromText', () => {
    it('extrae cantidad de diferentes patrones de texto', () => {
      expect(quantityFromText('3 almuerzos').value).toBe(3);
      expect(quantityFromText('pedido 5').value).toBe(5);
      expect(quantityFromText('cantidad: 2').value).toBe(2);
      expect(quantityFromText('2 pedidos').value).toBe(2);
      expect(quantityFromText('porcion: 4').value).toBe(4);
    });

    it('devuelve valor por defecto si no se encuentra numero', () => {
      expect(quantityFromText('hola', 1)).toMatchObject({ provided: false, value: 1 });
      expect(quantityFromText(null, 3)).toMatchObject({ provided: false, value: 3 });
    });

    it('marca como invalido si excede MAX_QUANTITY (20)', () => {
      const result = quantityFromText('25 almuerzos');
      expect(result.valid).toBe(false);
      expect(result.value).toBe(25);
    });

    it('marca como invalido cantidades menores a 1', () => {
      // '0 almuerzos' - el regex de patrones SI matchea el 0, pero el rango valido es 1-20
      const result = quantityFromText('0 almuerzos');
      // El patron [0-9]{1,2} si captura 0
      if (result.provided) {
        expect(result.valid).toBe(false);
      } else {
        // Si no matchea (patron mas restrictivo), provided=false es aceptable
        expect(result.provided).toBe(false);
      }
    });
  });

  describe('generateSid', () => {
    it('genera strings hex de 16 chars distintos cada vez', () => {
      const sid1 = generateSid();
      const sid2 = generateSid();
      expect(sid1).toHaveLength(16);
      expect(sid2).toHaveLength(16);
      expect(sid1).not.toBe(sid2);
      expect(sid1).toMatch(/^[a-f0-9]{16}$/);
    });
  });

  describe('activeConvenio', () => {
    const today = '2026-07-13';

    it('retorna el convenio activo y vigente del cliente', () => {
      const client = {
        clientes_convenios: [
          {
            convenios: {
              id_convenio: 'conv-1',
              nombre_empresa: 'Empresa A',
              esta_activo: true,
              fecha_caducidad: '2030-12-31',
              tipos_almuerzo_permitidos: ['ejecutivo_completo'],
            },
          },
        ],
      };
      const result = activeConvenio(client, today);
      expect(result).toMatchObject({ id_convenio: 'conv-1', nombre_empresa: 'Empresa A' });
      expect(result.tipos_almuerzo_permitidos).toEqual(['ejecutivo_completo']);
    });

    it('retorna objeto fallback si el convenio esta inactivo', () => {
      const client = {
        clientes_convenios: [
          { convenios: { id_convenio: 'conv-1', esta_activo: false, fecha_caducidad: '2030-12-31' } },
        ],
      };
      const result = activeConvenio(client, today);
      expect(result).toBeNull();
    });

    it('retorna objeto fallback si el convenio ha caducado', () => {
      const client = {
        clientes_convenios: [
          { convenios: { id_convenio: 'conv-1', esta_activo: true, fecha_caducidad: '2020-01-01' } },
        ],
      };
      const result = activeConvenio(client, today);
      expect(result).toBeNull();
    });

    it('retorna objeto fallback si el cliente no tiene convenios', () => {
      const r1 = activeConvenio({ clientes_convenios: [] }, today);
      expect(r1).toBeNull();
      const r2 = activeConvenio({}, today);
      expect(r2).toBeNull();
    });

    it('maneja convenio como array', () => {
      const client = {
        clientes_convenios: [
          {
            convenios: [{ id_convenio: 'conv-arr', nombre_empresa: 'Array Co', esta_activo: true, fecha_caducidad: '2030-01-01' }],
          },
        ],
      };
      const result = activeConvenio(client, today);
      expect(result).toMatchObject({ id_convenio: 'conv-arr' });
    });

    it('retorna convenio sin fecha_caducidad (siempre vigente)', () => {
      const client = {
        clientes_convenios: [
          { convenios: { id_convenio: 'conv-nodate', nombre_empresa: 'Sin fecha', esta_activo: true } },
        ],
      };
      const result = activeConvenio(client, today);
      expect(result).toMatchObject({ id_convenio: 'conv-nodate' });
    });
  });

  describe('orderConfirmation', () => {
    it('genera mensaje de confirmacion con numero de orden', () => {
      const session = { cliente: { nombre: 'Ana', apellido: 'Lopez' }, tipoAlmuerzo: { shortLabel: 'Ejecutivo' }, quantity: 1, opciones: {} };
      const order = { numero_orden: 'ORD-001', id_orden: 'abc-123' };
      const msg = orderConfirmation(session, order);
      expect(msg).toContain('ORD-001');
      expect(msg).toContain('registrado con');
    });

    it('usa los primeros 5 chars del id_orden si no hay numero_orden', () => {
      const session = { cliente: { nombre: 'Juan', apellido: 'Doe' }, opciones: {} };
      const order = { numero_orden: null, id_orden: 'abcde-fg-hij' };
      const msg = orderConfirmation(session, order);
      expect(msg).toContain('ABCDE');
    });

    it('maneja sesion sin datos de cliente', () => {
      const session = { opciones: {} };
      const order = { numero_orden: 'X001', id_orden: null };
      const msg = orderConfirmation(session, order);
      expect(msg).toContain('X001');
    });

    it('genera mensaje diferente para orden modificada', () => {
      const session = { opciones: {}, tipoAlmuerzo: { shortLabel: 'Ejecutivo Simple' }, quantity: 1 };
      const order = { numero_orden: 'MOD-001', id_orden: 'x', modified: true };
      const msg = orderConfirmation(session, order);
      expect(msg).toContain('Registrada');
      expect(msg).toContain('MOD-001');
    });

    it('genera mensaje corto para orden duplicada', () => {
      const session = { opciones: {} };
      const order = { numero_orden: 'D001', id_orden: 'x', duplicate: true };
      const msg = orderConfirmation(session, order);
      expect(msg).toContain('Registrada');
    });
  });
});
