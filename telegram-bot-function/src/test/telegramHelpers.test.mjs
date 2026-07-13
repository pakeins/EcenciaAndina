import { describe, it, expect, vi } from 'vitest';
import { normalizeText, todayInTimezone, dayOfWeekInTimezone, isBusinessDay, tomorrowFromDate, labelForStep, quantityFromText, parseStartToken } from '../utils/telegramHelpers.js';

describe('Telegram Helpers', () => {
  it('deberia normalizar el texto', () => {
    expect(normalizeText('Árbol')).toBe('arbol');
    expect(normalizeText('  HOLA  ')).toBe('hola');
    expect(normalizeText(null)).toBe('');
  });

  it('deberia obtener label para el step', () => {
    expect(labelForStep('entrada')).toBe('Entrada');
    expect(labelForStep('sopa')).toBe('Sopa');
    expect(labelForStep('segundo')).toBe('Plato Fuerte');
    expect(labelForStep('bebida')).toBe('Bebida');
    expect(labelForStep('postre')).toBe('Postre');
    expect(labelForStep('otro')).toBe('Opción');
  });

  it('deberia extraer token de start', () => {
    expect(parseStartToken('/start 123')).toEqual({ isStart: true, token: '123' });
    expect(parseStartToken('/start')).toEqual({ isStart: true, token: '' });
    expect(parseStartToken('/start@mibot 123')).toEqual({ isStart: true, token: '123' });
    expect(parseStartToken('hola')).toBeNull();
  });

  it('deberia devolver las fechas correctas', () => {
    expect(typeof todayInTimezone()).toBe('string');
    expect(typeof dayOfWeekInTimezone()).toBe('string');
    expect(tomorrowFromDate('2023-01-01')).toBe('2023-01-02');
  });

  it('deberia identificar isBusinessDay', () => {
    expect(typeof isBusinessDay()).toBe('boolean');
  });

  it('deberia extraer cantidad', () => {
    expect(quantityFromText('3 almuerzos').value).toBe(3);
    expect(quantityFromText('pedido 5').value).toBe(5);
    expect(quantityFromText('cantidad: 2').value).toBe(2);
    expect(quantityFromText('hola', 1).value).toBe(1); // Default a current
  });
});
