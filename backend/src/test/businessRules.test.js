import { describe, expect, it } from 'vitest';
import businessRules from '../services/businessRules.js';

const {
  calculateSaldoDeductions,
  isConvenioVigente,
  isPositiveInteger,
  isValidOrderTransition,
  validatePersonName,
} = businessRules;

describe('businessRules', () => {
  it('bloquea transiciones desde estados finales', () => {
    expect(isValidOrderTransition(1, 2)).toBe(true);
    expect(isValidOrderTransition(1, 3)).toBe(true);
    expect(isValidOrderTransition(2, 1)).toBe(false);
    expect(isValidOrderTransition(3, 1)).toBe(false);
  });

  it('rechaza cantidades no enteras positivas', () => {
    expect(isPositiveInteger(1)).toBe(true);
    expect(isPositiveInteger('2')).toBe(true);
    expect(isPositiveInteger(1.5)).toBe(false);
    expect(isPositiveInteger('0')).toBe(false);
  });

  it('valida nombres de persona seguros', () => {
    expect(validatePersonName('Juan Perez', 'Nombre').value).toBe('Juan Perez');
    expect(validatePersonName('123<script>', 'Nombre').error).toBeTruthy();
    expect(validatePersonName('%%%999', 'Apellido').error).toBeTruthy();
  });

  it('calcula vigencia de convenios con fecha de caducidad', () => {
    expect(isConvenioVigente({
      esta_activo: true,
      fecha_caducidad: '2026-01-31',
    }, new Date('2026-01-01T12:00:00'))).toBe(true);

    expect(isConvenioVigente({
      esta_activo: true,
      fecha_caducidad: '2025-12-31',
    }, new Date('2026-01-01T12:00:00'))).toBe(false);
  });

  it('detecta saldo insuficiente y saldo equivalente con confirmacion', () => {
    const detalles = [{ id_producto: 1, cantidad: 2 }];
    const productosPedidos = [{ id_producto: 1, precio_unitario: 4.5 }];

    expect(calculateSaldoDeductions({
      detalles,
      productosPedidos,
      saldosCliente: [{ id_producto: 1, cantidad_disponible: 1, productos: { precio_unitario: 4.5 } }],
    })).toMatchObject({ ok: false, status: 400 });

    expect(calculateSaldoDeductions({
      detalles: [{ id_producto: 1, cantidad: 1 }],
      productosPedidos,
      saldosCliente: [{ id_producto: 2, cantidad_disponible: 1, productos: { precio_unitario: 6 } }],
    })).toMatchObject({ ok: false, status: 409, requireConfirmation: true });

    expect(calculateSaldoDeductions({
      detalles: [{ id_producto: 1, cantidad: 1 }],
      productosPedidos,
      saldosCliente: [{ id_producto: 1, cantidad_disponible: 1, productos: { precio_unitario: 4.5 } }],
    })).toMatchObject({ ok: true });
  });
});
