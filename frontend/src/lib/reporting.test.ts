import { describe, expect, it, vi } from 'vitest';
import {
  buildReportCsv,
  buildReportPrintHtml,
  buildReportXml,
  calculateReportTotal,
  downloadTextFile,
  escapeXml,
  getPeriodRange,
  getReportColumnCount,
} from '@/lib/reporting';
import { AgreementReportRow, OrderReportRow } from '@/types/reporting';

describe('filtros de reportería', () => {
  it('calcula hoy, semana y mes con fechas locales', () => {
    const now = new Date(2026, 5, 11, 10, 0, 0);
    expect(getPeriodRange('hoy', now)).toEqual({ start: '2026-06-11', end: '2026-06-11' });
    expect(getPeriodRange('semana', now)).toEqual({ start: '2026-06-08', end: '2026-06-14' });
    expect(getPeriodRange('mes', now)).toEqual({ start: '2026-06-01', end: '2026-06-30' });
  });
});

describe('totales y detalle por convenio', () => {
  const orders: OrderReportRow[] = [
    {
      id: '1',
      fecha: '2026-06-11T12:00:00.000Z',
      cliente: 'Ana',
      estado: 'Consumido',
      metodo_pago: 'Efectivo',
      descripcion: 'Almuerzo',
      cantidadAlmuerzos: 1,
      totalConsumo: 5,
    },
    {
      id: '2',
      fecha: '2026-06-11T13:00:00.000Z',
      cliente: 'Luis',
      estado: 'Cancelado',
      metodo_pago: 'Efectivo',
      descripcion: 'Almuerzo',
      cantidadAlmuerzos: 1,
      totalConsumo: 9,
    },
  ];

  const agreement: AgreementReportRow[] = [{
    empleado: 'Ana Perez',
    cedula: '1710034065',
    total: 7.5,
    consumos: [
      {
        fecha: '2026-06-11T12:00:00.000Z',
        producto: 'Almuerzo',
        cantidad: 2,
        valor: 7.5,
      },
    ],
  }];

  it('excluye cancelaciones del total neto salvo al filtrar cancelados', () => {
    expect(calculateReportTotal('estados', orders, 'all')).toBe(5);
    expect(calculateReportTotal('estados', orders, '3')).toBe(14);
  });

  it('genera resumen y desglose de convenio con columnas distintas', () => {
    expect(getReportColumnCount('convenio', false)).toBe(4);
    expect(getReportColumnCount('convenio', true)).toBe(5);

    const summary = buildReportCsv({
      reportType: 'convenio',
      data: agreement,
      detailedAgreement: false,
      stateFilter: 'all',
    });
    const detailed = buildReportCsv({
      reportType: 'convenio',
      data: agreement,
      detailedAgreement: true,
      stateFilter: 'all',
    });

    expect(summary).toContain('"Almuerzos consumidos"');
    expect(detailed).toContain('"Producto"');
    expect(detailed).toContain('"Almuerzo"');
  });
});

describe('exportaciones seguras', () => {
  it('escapa XML y HTML generado', () => {
    expect(escapeXml('<tag attr="x">&')).toBe('&lt;tag attr=&quot;x&quot;&gt;&amp;');
    const xml = buildReportXml({
      reportType: 'productos',
      data: [{
        nombre: '<script>alert(1)</script>',
        categoria: 'A&B',
        cantidadVendida: 1,
        ingresosGenerados: Number.NaN,
      }],
      startDate: '2026-06-01',
      endDate: '2026-06-30',
      detailedAgreement: false,
      stateFilter: 'all',
    });
    expect(xml).not.toContain('<script>');
    expect(xml).toContain('&lt;script&gt;');
    expect(xml).toContain('<ingresosGenerados>0.00</ingresosGenerados>');

    const html = buildReportPrintHtml({
      title: '<img src=x onerror=alert(1)>',
      startDate: '2026-06-01',
      endDate: '2026-06-30',
      headers: ['<b>Producto</b>'],
      rows: [['<script>']],
      totalLabel: 'Total',
      total: Number.POSITIVE_INFINITY,
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('$0.00');
  });

  it('incluye BOM, escapa comillas CSV y libera la URL temporal', () => {
    const csv = buildReportCsv({
      reportType: 'productos',
      data: [{
        nombre: 'Almuerzo "Andino"',
        categoria: 'Menu',
        cantidadVendida: 1,
        ingresosGenerados: 4,
      }],
      detailedAgreement: false,
      stateFilter: 'all',
    });
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"Almuerzo ""Andino"""');

    const createObjectURL = vi.fn(() => 'blob:test');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadTextFile('contenido', 'text/plain', 'reporte.txt');

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test');
    click.mockRestore();
  });
});

describe('cobertura adicional para exportaciones', () => {
  it('genera CSV y XML para ventas', () => {
    const data = [{
      metodo_pago: 'Efectivo',
      cantidadAlmuerzos: 2,
      totalConsumo: 12
    }];
    const csv = buildReportCsv({ reportType: 'ventas', data, detailedAgreement: false, stateFilter: 'all' });
    expect(csv).toContain('"Efectivo"');
    expect(csv).toContain('"12.00"');

    const xml = buildReportXml({
      reportType: 'ventas', data, startDate: '2026-06-01', endDate: '2026-06-30', detailedAgreement: false, stateFilter: 'all'
    });
    expect(xml).toContain('<metodoPago>Efectivo</metodoPago>');
    expect(xml).toContain('<totalConsumo>12.00</totalConsumo>');
  });

  it('genera XML para convenios resumido y detallado', () => {
    const data = [{
      empleado: 'Ana', cedula: '123', total: 5,
      consumos: [{ fecha: '2026-06-11T12:00:00.000Z', producto: 'Almuerzo', cantidad: 1, valor: 5 }]
    }];

    const xmlResumen = buildReportXml({
      reportType: 'convenio', data, startDate: '2026-06-01', endDate: '2026-06-30', detailedAgreement: false, stateFilter: 'all'
    });
    expect(xmlResumen).toContain('<nombre>Ana</nombre>');
    expect(xmlResumen).toContain('<cantidadAlmuerzos>1</cantidadAlmuerzos>');

    const xmlDetalle = buildReportXml({
      reportType: 'convenio', data, startDate: '2026-06-01', endDate: '2026-06-30', detailedAgreement: true, stateFilter: 'all'
    });
    expect(xmlDetalle).toContain('<colaborador>Ana</colaborador>');
    expect(xmlDetalle).toContain('<producto>Almuerzo</producto>');
  });
});
