import { describe, expect, it, vi, beforeEach } from 'vitest';
import businessRules from '../services/businessRules.js';

const {
  calculateSaldoDeductions,
  groupDeductions,
  isConvenioVigente,
  isPositiveInteger,
  isValidOrderTransition,
  normalizePersonName,
  validatePersonName,
} = businessRules;

describe('businessRules', () => {
  it('bloquea transiciones desde estados finales', () => {
    expect(isValidOrderTransition(1, 2)).toBe(true);
    expect(isValidOrderTransition(1, 3)).toBe(true);
    expect(isValidOrderTransition(2, 1)).toBe(false);
    expect(isValidOrderTransition(3, 1)).toBe(false);
    expect(isValidOrderTransition(1, 1)).toBe(true); // same state
    expect(isValidOrderTransition(2, 3)).toBe(false);
  });

  it('rechaza cantidades no enteras positivas', () => {
    expect(isPositiveInteger(1)).toBe(true);
    expect(isPositiveInteger('2')).toBe(true);
    expect(isPositiveInteger(1.5)).toBe(false);
    expect(isPositiveInteger('0')).toBe(false);
    expect(isPositiveInteger(-1)).toBe(false);
    expect(isPositiveInteger('abc')).toBe(false);
  });

  it('normaliza y valida nombres de persona', () => {
    expect(normalizePersonName('  Juan  Perez  ')).toBe('Juan Perez');
    expect(normalizePersonName(null)).toBe('');

    expect(validatePersonName('Juan Perez', 'Nombre').value).toBe('Juan Perez');
    expect(validatePersonName("O'Brien", 'Nombre').value).toBe("O'Brien");
    expect(validatePersonName('García-López', 'Nombre').value).toBe('García-López');
    expect(validatePersonName('123<script>', 'Nombre').error).toBeTruthy();
    expect(validatePersonName('%%%999', 'Apellido').error).toBeTruthy();
    expect(validatePersonName('A', 'Nombre').error).toBeTruthy(); // too short
    expect(validatePersonName('A'.repeat(81), 'Nombre').error).toBeTruthy(); // too long
  });

  it('calcula vigencia de convenios con distintas configuraciones', () => {
    // Vigente
    expect(isConvenioVigente({
      esta_activo: true,
      fecha_caducidad: '2026-01-31',
    }, new Date('2026-01-01T12:00:00'))).toBe(true);

    // Vencido
    expect(isConvenioVigente({
      esta_activo: true,
      fecha_caducidad: '2025-12-31',
    }, new Date('2026-01-01T12:00:00'))).toBe(false);

    // Usa fecha_fin cuando no hay fecha_caducidad
    expect(isConvenioVigente({
      esta_activo: true,
      fecha_fin: '2026-12-31',
    }, new Date('2026-01-01'))).toBe(true);

    // Inactivo
    expect(isConvenioVigente({ esta_activo: false, fecha_caducidad: '2030-01-01' })).toBe(false);
    expect(isConvenioVigente({ activo: false, fecha_caducidad: '2030-01-01' })).toBe(false);
    expect(isConvenioVigente(null)).toBe(false);
    expect(isConvenioVigente({ esta_activo: true })).toBe(false); // sin fecha
  });

  it('detecta saldo insuficiente y saldo equivalente con confirmacion', () => {
    const detalles = [{ id_producto: 1, cantidad: 2 }];
    const productosPedidos = [{ id_producto: 1, precio_unitario: 4.5 }];

    // Saldo insuficiente
    expect(calculateSaldoDeductions({
      detalles,
      productosPedidos,
      saldosCliente: [{ id_producto: 1, cantidad_disponible: 1, productos: { precio_unitario: 4.5 } }],
    })).toMatchObject({ ok: false, status: 400 });

    // Requiere confirmacion (saldo equivalente mas caro)
    expect(calculateSaldoDeductions({
      detalles: [{ id_producto: 1, cantidad: 1 }],
      productosPedidos,
      saldosCliente: [{ id_producto: 2, cantidad_disponible: 1, productos: { precio_unitario: 6 } }],
    })).toMatchObject({ ok: false, status: 409, requireConfirmation: true });

    // Exitoso con saldo exacto
    expect(calculateSaldoDeductions({
      detalles: [{ id_producto: 1, cantidad: 1 }],
      productosPedidos,
      saldosCliente: [{ id_producto: 1, cantidad_disponible: 1, productos: { precio_unitario: 4.5 } }],
    })).toMatchObject({ ok: true });
  });

  it('acepta forzar fallback en calculateSaldoDeductions', () => {
    const result = calculateSaldoDeductions({
      detalles: [{ id_producto: 1, cantidad: 1 }],
      productosPedidos: [{ id_producto: 1, precio_unitario: 4.5 }],
      saldosCliente: [{ id_producto: 2, cantidad_disponible: 1, productos: { precio_unitario: 6 } }],
      forceFallback: true,
    });
    expect(result.ok).toBe(true);
    expect(result.fallbackUsed).toBe(true);
  });

  it('maneja saldos como array en productos', () => {
    const result = calculateSaldoDeductions({
      detalles: [{ id_producto: 1, cantidad: 1 }],
      productosPedidos: [{ id_producto: 1, precio_unitario: 4.5 }],
      saldosCliente: [{ id_producto: 1, cantidad_disponible: 2, productos: [{ precio_unitario: 4.5 }] }],
    });
    expect(result.ok).toBe(true);
    expect(result.deducciones).toHaveLength(1);
  });

  it('groupDeductions agrupa multiples deducciones del mismo producto', () => {
    const deducciones = [
      { id_producto_saldo: 1, cantidad: 2 },
      { id_producto_saldo: 1, cantidad: 3 },
      { id_producto_saldo: 2, cantidad: 1 },
    ];
    expect(groupDeductions(deducciones)).toEqual({ '1': 5, '2': 1 });
    expect(groupDeductions([])).toEqual({});
  });

  it('retorna deducciones vacias si no hay detalles', () => {
    const result = calculateSaldoDeductions({ detalles: [], saldosCliente: [], productosPedidos: [] });
    expect(result.ok).toBe(true);
    expect(result.deducciones).toEqual([]);
  });
});
