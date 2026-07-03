import { describe, expect, it } from 'vitest';
import { BRAND_COLORS } from './brand';
import { DEFAULT_LUNCH_TYPE_ID, LUNCH_TYPE_CODES, lunchTypeLabel, lunchTypeRequiresSoup } from './lunchTypes';

describe('lunchTypes frontend helpers', () => {
  it('expone los codigos oficiales y etiqueta por fallback', () => {
    expect(DEFAULT_LUNCH_TYPE_ID).toBe(9);
    expect(LUNCH_TYPE_CODES).toMatchObject({
      ejecutivoCompleto: 'ejecutivo_completo',
      ejecutivoSinSopa: 'ejecutivo_sin_sopa',
      ejecutivoSimple: 'ejecutivo_simple',
      almuerzoDia: 'almuerzo_dia',
      almuerzoDiaSimple: 'almuerzo_dia_simple',
    });
    expect(lunchTypeLabel('almuerzo_dia')).toBe('Almuerzo del Dia');
    expect(lunchTypeLabel('desconocido', 'Tipo base')).toBe('Tipo base');
    expect(lunchTypeRequiresSoup('ejecutivo_completo')).toBe(true);
    expect(lunchTypeRequiresSoup('almuerzo_dia_simple')).toBe(false);
  });

  it('centraliza la paleta del manual de marca', () => {
    expect(BRAND_COLORS).toMatchObject({
      cafe: '#7A402E',
      oro: '#C2803A',
      olivo: '#61603C',
      verdeProfundo: '#2F4D49',
      piedra: '#D1CDC4',
      terracota: '#BF5D30',
    });
  });
});
