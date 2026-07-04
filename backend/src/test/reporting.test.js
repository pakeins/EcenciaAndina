import { describe, expect, it } from 'vitest';
import reporting from '../services/reporting.js';

const {
  aggregateDashboard,
  buildDateRange,
  getDefaultDashboardRanges,
  getLunchCategoryIds,
  parseDateRange,
} = reporting;

const detail = (name, categoryId, quantity, price) => ({
  cantidad: quantity,
  precio_aplicado: price,
  productos: {
    nombre_producto: name,
    id_categoria: categoryId,
  },
});

const order = ({
  id,
  date,
  state = 2,
  details,
  convenio = 'Empresa Andina',
}) => ({
  id_orden: id,
  created_at: date,
  consumed_at: state === 2 ? date : null,
  id_estado: state,
  metodo_pago: convenio ? 'Convenio Empresa' : 'Efectivo',
  estados_orden: { nombre_estado: state === 2 ? 'Consumido' : 'Cancelado' },
  clientes: {
    nombre: 'Ana',
    apellido: 'Perez',
    clientes_convenios: convenio
      ? [{ convenios: { nombre_empresa: convenio } }]
      : [],
  },
  detalle_orden: details,
});

describe('rangos de reportería', () => {
  it('convierte dias de Bogota a un rango UTC con fin exclusivo', () => {
    expect(buildDateRange('2026-06-11', '2026-06-11', 'America/Bogota')).toEqual({
      startDate: '2026-06-11',
      endDate: '2026-06-11',
      start: '2026-06-11T05:00:00.000Z',
      endExclusive: '2026-06-12T05:00:00.000Z',
      timeZone: 'America/Bogota',
    });
  });

  it.each([
    [{ fecha_inicio: '2026-06-01' }, /ambas fechas/],
    [{ fecha_inicio: '2026-02-30', fecha_fin: '2026-03-01' }, /YYYY-MM-DD/],
    [{ fecha_inicio: '2026-06-12', fecha_fin: '2026-06-11' }, /anterior/],
  ])('rechaza rangos incompletos, invalidos o invertidos', (query, message) => {
    expect(() => parseDateRange(query)).toThrow(message);
  });
});

describe('configuracion de categorias de almuerzo', () => {
  it('usa categoria 1 por defecto y admite una lista configurable', () => {
    const previous = process.env.REPORT_LUNCH_CATEGORY_IDS;
    delete process.env.REPORT_LUNCH_CATEGORY_IDS;
    expect([...getLunchCategoryIds()]).toEqual([1]);

    process.env.REPORT_LUNCH_CATEGORY_IDS = '1, 4, invalida, 7';
    expect([...getLunchCategoryIds()]).toEqual([1, 4, 7]);

    if (previous === undefined) delete process.env.REPORT_LUNCH_CATEGORY_IDS;
    else process.env.REPORT_LUNCH_CATEGORY_IDS = previous;
  });
});

describe('agregaciones del dashboard', () => {
  const now = new Date('2026-06-11T15:00:00.000Z');
  const defaultRanges = getDefaultDashboardRanges(now, 'America/Bogota');
  const orders = [
    order({
      id: 'today',
      date: '2026-06-11T17:00:00.000Z',
      details: [
        detail('Almuerzo ejecutivo', 1, 2, 3.5),
        detail('Jugo natural', 2, 1, 2),
      ],
    }),
    order({
      id: 'month',
      date: '2026-06-02T17:00:00.000Z',
      details: [detail('Almuerzo vegetariano', 1, 3, 4)],
      convenio: 'Empresa Sierra',
    }),
    order({
      id: 'cancelled',
      date: '2026-06-11T18:00:00.000Z',
      state: 3,
      details: [detail('Almuerzo cancelado', 1, 10, 20)],
    }),
  ];

  it('usa precio aplicado para ingresos y excluye ordenes no consumidas', () => {
    const customRange = buildDateRange('2026-06-11', '2026-06-11', 'America/Bogota');
    const result = aggregateDashboard({
      orders,
      reservationOrders: orders,
      customRange,
      defaultRanges,
      activeConvenios: 2,
      activeClients: 7,
      timeZone: 'America/Bogota',
      lunchCategoryIds: new Set([1]),
    });

    expect(result.metrics.almuerzosHoy).toBe(2);
    expect(result.metrics.almuerzosMes).toBe(7);
    expect(result.consumosPorConvenio).toEqual([{ name: 'Empresa Andina', value: 2 }]);
    expect(result.reservasVsConsumos.find((item) => item.date === '2026-06-11')).toMatchObject({
      reservados: 2,
      consumidos: 1,
    });
    expect(result.topProducts).toEqual([
      { name: 'Almuerzo ejecutivo', value: 2 },
      { name: 'Jugo natural', value: 1 },
    ]);
  });

  it('calcula productos populares y almuerzos con el periodo mensual predeterminado', () => {
    const result = aggregateDashboard({
      orders,
      reservationOrders: orders,
      defaultRanges,
      timeZone: 'America/Bogota',
      lunchCategoryIds: new Set([1]),
    });

    expect(result.metrics.almuerzosHoy).toBe(2);
    expect(result.metrics.almuerzosMes).toBe(5);
    expect(result.topProducts).toContainEqual({ name: 'Almuerzo vegetariano', value: 3 });
    expect(result.topProducts).not.toContainEqual({ name: 'Almuerzo cancelado', value: 10 });
  });
});
