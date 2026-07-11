import { describe, expect, it } from 'vitest';
import lunchTypes from '../services/lunchTypes.js';

const {
  LUNCH_TYPE_CODES,
  LUNCH_TYPE_IDS,
  compactLunchSummary,
  formatDetailDescription,
  getLunchTypeCode,
  getLunchTypeLabel,
  isLunchProduct,
  summarizeOrderDetails,
} = lunchTypes;

const lunchProduct = {
  productos: {
    id_categoria: 1,
    nombre_producto: 'Almuerzo Ejecutivo',
    categorias_productos: { nombre_categoria: 'Almuerzos' },
  },
};

const extraProduct = {
  productos: {
    id_categoria: 2,
    nombre_producto: 'Jugo natural',
    categorias_productos: { nombre_categoria: 'Bebidas' },
  },
};

describe('lunchTypes service', () => {
  it('separa paquetes oficiales de almuerzo y extras', () => {
    const summary = summarizeOrderDetails([
      {
        ...lunchProduct,
        cantidad: 2,
        precio_aplicado: 6.99,
        id_tipo_almuerzo: LUNCH_TYPE_IDS.ejecutivoCompleto,
      },
      {
        ...lunchProduct,
        cantidad: 1,
        precio_aplicado: 6,
        id_tipo_almuerzo: LUNCH_TYPE_IDS.ejecutivoSinSopa,
      },
      {
        ...lunchProduct,
        cantidad: 1,
        precio_aplicado: 4.5,
        id_tipo_almuerzo: LUNCH_TYPE_IDS.ejecutivoSimple,
      },
      {
        ...lunchProduct,
        cantidad: 1,
        precio_aplicado: 4.5,
        id_tipo_almuerzo: LUNCH_TYPE_IDS.almuerzoDia,
      },
      {
        ...lunchProduct,
        cantidad: 1,
        precio_aplicado: 3.99,
        id_tipo_almuerzo: LUNCH_TYPE_IDS.almuerzoDiaSimple,
      },
      {
        ...extraProduct,
        cantidad: 3,
        precio_aplicado: 1.25,
      },
    ]);

    expect(summary.almuerzosPrincipales).toBe(6);
    expect(summary.cantidadAlmuerzos).toBe(6);
    expect(summary.ejecutivoCompleto).toBe(2);
    expect(summary.ejecutivoSinSopa).toBe(1);
    expect(summary.ejecutivoSimple).toBe(1);
    expect(summary.almuerzoDia).toBe(1);
    expect(summary.almuerzoDiaSimple).toBe(1);
    expect(summary.otrosAlmuerzos).toBe(0);
    expect(summary.extrasCantidad).toBe(3);
    expect(summary.extrasTotal).toBe(3.75);
    expect(summary.totalConsumo).toBeCloseTo(36.72);
  });

  it('cuenta segundos historicos sin sumarlos a almuerzos principales', () => {
    const summary = summarizeOrderDetails([
      {
        ...lunchProduct,
        cantidad: 2,
        precio_aplicado: 3.99,
        id_tipo_almuerzo: LUNCH_TYPE_IDS.segundoAlmuerzo,
      },
      {
        ...lunchProduct,
        cantidad: 1,
        precio_aplicado: 4.5,
        id_tipo_almuerzo: LUNCH_TYPE_IDS.almuerzoDia,
      },
    ]);

    expect(summary.segundosAlmuerzos).toBe(2);
    expect(summary.almuerzosPrincipales).toBe(1);
    expect(summary.almuerzoDia).toBe(1);
    expect(summary.totalConsumo).toBeCloseTo(12.48);
  });

  it('resuelve codigo y etiqueta con fallback estable', () => {
    expect(getLunchTypeCode({ id_tipo_almuerzo: LUNCH_TYPE_IDS.especial })).toBe(LUNCH_TYPE_CODES.especial);
    expect(getLunchTypeCode({ tipos_almuerzo: { codigo: LUNCH_TYPE_CODES.vegetariano } })).toBe(LUNCH_TYPE_CODES.vegetariano);
    expect(getLunchTypeCode({ tipo_almuerzo: { codigo: LUNCH_TYPE_CODES.segundoAlmuerzo } })).toBe(LUNCH_TYPE_CODES.segundoAlmuerzo);
    expect(getLunchTypeCode({ tipoAlmuerzoCodigo: LUNCH_TYPE_CODES.conExtras })).toBe(LUNCH_TYPE_CODES.conExtras);
    expect(getLunchTypeCode({})).toBe(LUNCH_TYPE_CODES.almuerzoDia);

    expect(getLunchTypeLabel({ id_tipo_almuerzo: LUNCH_TYPE_IDS.conExtras })).toBe('Con extras');
    expect(getLunchTypeLabel({ tipos_almuerzo: { codigo: LUNCH_TYPE_CODES.especial, nombre: 'Especial medico' } })).toBe('Especial medico');
    expect(getLunchTypeLabel({ tipo_almuerzo: { codigo: 'desconocido', nombre: 'Personalizado' } })).toBe('Personalizado');
    expect(getLunchTypeLabel({ id_tipo_almuerzo: 999 })).toBe('Almuerzo del Dia');
  });

  it('detecta productos de almuerzo por categoria o nombre', () => {
    expect(isLunchProduct(lunchProduct)).toBe(true);
    expect(isLunchProduct({
      producto: {
        id_categoria: 9,
        nombre_producto: 'Bandeja',
        categoria: { nombre_categoria: 'Almuerzos especiales' },
      },
    })).toBe(true);
    expect(isLunchProduct({
      productos: {
        id_categoria: 9,
        nombre_producto: 'Almuerzo sin sopa',
        categorias_productos: { nombre_categoria: 'Varios' },
      },
    })).toBe(true);
    expect(isLunchProduct(extraProduct)).toBe(false);
  });

  it('devuelve resumen en cero cuando no hay detalles', () => {
    expect(summarizeOrderDetails()).toMatchObject({
      cantidadAlmuerzos: 0,
      almuerzosPrincipales: 0,
      ejecutivoCompleto: 0,
      ejecutivoSinSopa: 0,
      ejecutivoSimple: 0,
      almuerzoDia: 0,
      almuerzoDiaSimple: 0,
      otrosAlmuerzos: 0,
      segundosAlmuerzos: 0,
      vegetarianos: 0,
      especiales: 0,
      almuerzosConExtras: 0,
      extrasCantidad: 0,
      extrasTotal: 0,
      totalConsumo: 0,
    });
    expect(summarizeOrderDetails(null).cantidadAlmuerzos).toBe(0);
  });

  it('formatea descripcion y resumen compacto para reportes', () => {
    const detail = {
      ...lunchProduct,
      cantidad: 1,
      precio_aplicado: 4.5,
      id_tipo_almuerzo: LUNCH_TYPE_IDS.especial,
      observaciones_tipo: 'Sin sal',
      opciones: {
        sopa: 'Locro',
        segundo: 'Pollo',
        guarnicion: 'Ensalada',
      },
    };

    expect(formatDetailDescription(detail)).toBe(
      '1x Almuerzo Ejecutivo - (Especial) - Sopa: Locro - Plato fuerte: Pollo - Guarnicion: Ensalada - Obs. tipo: Sin sal',
    );

    const compact = compactLunchSummary(summarizeOrderDetails([detail, { ...extraProduct, cantidad: 2, precio_aplicado: 1.25 }]));
    expect(compact).toMatchObject({
      cantidadAlmuerzos: 1,
      almuerzosPrincipales: 1,
      otrosAlmuerzos: 1,
      especiales: 1,
      extrasCantidad: 2,
      valorExtras: 2.5,
      totalConsumo: 7,
    });
  });

  it('formatea descripciones con fallbacks seguros para productos generales', () => {
    expect(formatDetailDescription({
      cantidad: 2,
      nombre_producto: 'Jugo natural',
      precio_aplicado: 1.25,
    })).toBe('2x Jugo natural');

    expect(formatDetailDescription({ cantidad: 1 })).toBe('1x Producto');
  });
});
