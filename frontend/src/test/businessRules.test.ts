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
  });
});
