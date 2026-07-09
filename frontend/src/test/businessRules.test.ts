import { describe, expect, it } from 'vitest';
import {
  isConvenioVigente,
  isPositiveInteger,
  isValidPersonName,
  sanitizePersonNameInput,
} from '@/lib/businessRules';

describe('frontend business rules', () => {
  it('rechaza nombres inseguros y sanitiza entrada', () => {
    expect(isValidPersonName('Juan Perez')).toBe(true);
    expect(isValidPersonName('123<script>')).toBe(false);
    expect(sanitizePersonNameInput('123<script> Ana')).toBe('script Ana');
  });

  it('exige enteros positivos para recargas', () => {
    expect(isPositiveInteger('3')).toBe(true);
    expect(isPositiveInteger('1.5')).toBe(false);
    expect(isPositiveInteger('0')).toBe(false);
  });

  it('filtra convenios no vigentes', () => {
    expect(isConvenioVigente({ activo: true, vigente: true })).toBe(true);
    expect(isConvenioVigente({ activo: true, vigente: false })).toBe(false);
    expect(isConvenioVigente({ activo: false, vigente: true })).toBe(false);

    // Fallback: cuando vigente es undefined, valida activo y fecha de caducidad
    expect(isConvenioVigente({ activo: true })).toBe(false); // falta fecha
    expect(isConvenioVigente({ activo: false, fecha_caducidad: '2099-12-31' })).toBe(false); // inactivo

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    
    const formatLocalDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const tomorrowStr = formatLocalDate(tomorrow);
    const yesterdayStr = formatLocalDate(yesterday);

    expect(isConvenioVigente({ activo: true, fecha_caducidad: tomorrowStr })).toBe(true);
    expect(isConvenioVigente({ activo: true, fecha_caducidad: yesterdayStr })).toBe(false);
  });
});
