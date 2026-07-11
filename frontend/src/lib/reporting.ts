import {
  AgreementReportRow,
  OrderReportRow,
  ProductReportRow,
  ReportData,
  ReportType,
  SalesReportRow,
} from '@/types/reporting';
import { escapeHtml, formatMoney, toFiniteNumber } from '@/lib/html';

const XML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

export const escapeXml = (value: unknown) =>
  String(value ?? '').replace(/[&<>"']/g, (char) => XML_ESCAPE_MAP[char]);

export const formatLocalDateInput = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getCurrentMonthRange = (now = new Date()) => ({
  start: formatLocalDateInput(new Date(now.getFullYear(), now.getMonth(), 1)),
  end: formatLocalDateInput(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
});

export const getPeriodRange = (period: string, now = new Date()) => {
  if (period === 'hoy') {
    const today = formatLocalDateInput(now);
    return { start: today, end: today };
  }
  if (period === 'semana') {
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() + (day === 0 ? -6 : 1 - day));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { start: formatLocalDateInput(monday), end: formatLocalDateInput(sunday) };
  }
  if (period === 'mes') return getCurrentMonthRange(now);
  return { start: '', end: '' };
};

export const isInvalidDateRange = (start: string, end: string) =>
  Boolean(start && end && end < start);

export const calculateReportTotal = (
  reportType: ReportType,
  data: ReportData,
  stateFilter = 'all',
) => {
  if (reportType === 'convenio') {
    return (data as AgreementReportRow[]).reduce((total, row) => total + toFiniteNumber(row.total), 0);
  }
  if (reportType === 'productos') {
    return (data as ProductReportRow[]).reduce(
      (total, row) => total + toFiniteNumber(row.ingresosGenerados),
      0,
    );
  }
  if (reportType === 'ventas') {
    return (data as SalesReportRow[]).reduce(
      (total, row) => total + toFiniteNumber(row.totalConsumo),
      0,
    );
  }
  return (data as OrderReportRow[]).reduce((total, row) => {
    if (row.estado.toLowerCase() === 'cancelado' && stateFilter !== '3') return total;
    return total + toFiniteNumber(row.totalConsumo);
  }, 0);
};

export const getReportColumnCount = (reportType: ReportType, detailedAgreement: boolean) => {
  if (reportType === 'ventas') return 3;
  if (reportType === 'productos') return 4;
  if (reportType === 'convenio') return detailedAgreement ? 5 : 4;
  return 5;
};

const csvCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

export const buildReportCsv = ({
  reportType,
  data,
  detailedAgreement,
  stateFilter,
}: {
  reportType: ReportType;
  data: ReportData;
  detailedAgreement: boolean;
  stateFilter: string;
}) => {
  let headers: string[] = [];
  let rows: unknown[][] = [];

  if (reportType === 'ventas') {
    headers = ['Metodo de pago', 'Cantidad de almuerzos', 'Ingresos generados'];
    rows = (data as SalesReportRow[]).map((row) => [
      row.metodo_pago,
      row.cantidadAlmuerzos,
      formatMoney(row.totalConsumo),
    ]);
  } else if (reportType === 'productos') {
    headers = ['Producto', 'Categoria', 'Cantidad vendida', 'Ingresos estimados'];
    rows = (data as ProductReportRow[]).map((row) => [
      row.nombre,
      row.categoria,
      row.cantidadVendida,
      formatMoney(row.ingresosGenerados),
    ]);
  } else if (reportType === 'convenio') {
    if (detailedAgreement) {
      headers = ['Colaborador', 'Fecha', 'Producto', 'Cantidad', 'Costo'];
      rows = (data as AgreementReportRow[]).flatMap((employee) =>
        employee.consumos.map((consumption) => [
          employee.empleado,
          new Date(consumption.fecha).toLocaleString('es-EC'),
          consumption.producto,
          consumption.cantidad,
          formatMoney(consumption.valor),
        ]),
      );
    } else {
      headers = ['Colaborador', 'Cedula', 'Almuerzos consumidos', 'Costo total'];
      rows = (data as AgreementReportRow[]).map((employee) => [
        employee.empleado,
        employee.cedula,
        employee.consumos.reduce((sum, item) => sum + toFiniteNumber(item.cantidad), 0),
        formatMoney(employee.total),
      ]);
    }
  } else {
    headers = [
      'Fecha',
      reportType === 'estados' ? 'Cliente' : 'Convenio',
      'Estado',
      'Descripcion',
      'Costo',
    ];
    rows = (data as OrderReportRow[]).map((row) => [
      new Date(row.fecha).toLocaleString('es-EC'),
      reportType === 'estados' ? row.cliente : row.convenio,
      row.estado,
      row.descripcion,
      formatMoney(row.totalConsumo),
    ]);
  }

  const totalRow = new Array(headers.length).fill('');
  totalRow[headers.length - 2] = reportType === 'estados' && stateFilter === '3' ? 'Total cancelado' : 'Total neto';
  totalRow[headers.length - 1] = formatMoney(calculateReportTotal(reportType, data, stateFilter));

  return `\uFEFF${[headers, ...rows, totalRow]
    .map((row) => row.map(csvCell).join(','))
    .join('\n')}`;
};

export const buildReportXml = ({
  reportType,
  data,
  startDate,
  endDate,
  detailedAgreement,
  stateFilter,
}: {
  reportType: ReportType;
  data: ReportData;
  startDate: string;
  endDate: string;
  detailedAgreement: boolean;
  stateFilter: string;
}) => {
  const items: string[] = [];

  if (reportType === 'ventas') {
    (data as SalesReportRow[]).forEach((row) => {
      items.push(
        `<item><metodoPago>${escapeXml(row.metodo_pago)}</metodoPago><cantidadAlmuerzos>${toFiniteNumber(row.cantidadAlmuerzos)}</cantidadAlmuerzos><totalConsumo>${formatMoney(row.totalConsumo)}</totalConsumo></item>`,
      );
    });
  } else if (reportType === 'productos') {
    (data as ProductReportRow[]).forEach((row) => {
      items.push(
        `<item><nombre>${escapeXml(row.nombre)}</nombre><categoria>${escapeXml(row.categoria)}</categoria><cantidadVendida>${toFiniteNumber(row.cantidadVendida)}</cantidadVendida><ingresosGenerados>${formatMoney(row.ingresosGenerados)}</ingresosGenerados></item>`,
      );
    });
  } else if (reportType === 'convenio') {
    (data as AgreementReportRow[]).forEach((employee) => {
      if (detailedAgreement) {
        employee.consumos.forEach((consumption) => {
          items.push(
            `<consumo><colaborador>${escapeXml(employee.empleado)}</colaborador><fecha>${escapeXml(consumption.fecha)}</fecha><producto>${escapeXml(consumption.producto)}</producto><cantidad>${toFiniteNumber(consumption.cantidad)}</cantidad><costo>${formatMoney(consumption.valor)}</costo></consumo>`,
          );
        });
      } else {
        items.push(
          `<colaborador><nombre>${escapeXml(employee.empleado)}</nombre><cedula>${escapeXml(employee.cedula)}</cedula><cantidadAlmuerzos>${employee.consumos.reduce((sum, item) => sum + toFiniteNumber(item.cantidad), 0)}</cantidadAlmuerzos><costoTotal>${formatMoney(employee.total)}</costoTotal></colaborador>`,
        );
      }
    });
  } else {
    (data as OrderReportRow[]).forEach((row) => {
      const owner =
        reportType === 'estados'
          ? `<cliente>${escapeXml(row.cliente)}</cliente>`
          : `<convenio>${escapeXml(row.convenio || 'N/A')}</convenio>`;
      items.push(
        `<item><idOrden>${escapeXml(row.id)}</idOrden><fecha>${escapeXml(row.fecha)}</fecha>${owner}<estado>${escapeXml(row.estado)}</estado><descripcion>${escapeXml(row.descripcion)}</descripcion><totalConsumo>${formatMoney(row.totalConsumo)}</totalConsumo></item>`,
      );
    });
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<reporte tipo="${escapeXml(reportType)}" fechaInicio="${escapeXml(startDate)}" fechaFin="${escapeXml(endDate)}">`,
    `<metadatos><generadoPor>Ecencia Andina</generadoPor><fechaGenerado>${new Date().toISOString()}</fechaGenerado></metadatos>`,
    `<datos>${items.join('')}</datos>`,
    `<resumen><totalNeto>${formatMoney(calculateReportTotal(reportType, data, stateFilter))}</totalNeto></resumen>`,
    '</reporte>',
  ].join('\n');
};

export const buildReportPrintHtml = ({
  title,
  startDate,
  endDate,
  headers,
  rows,
  totalLabel,
  total,
}: {
  title: string;
  startDate: string;
  endDate: string;
  headers: string[];
  rows: unknown[][];
  totalLabel: string;
  total: number;
}) => {
  const headerHtml = headers
    .map((header) => `<th style="padding:10px 8px;border-bottom:2px solid #ddd;text-align:left">${escapeHtml(header)}</th>`)
    .join('');
  const rowsHtml = rows
    .map(
      (row) =>
        `<tr>${row
          .map((cell) => `<td style="padding:9px 8px;border-bottom:1px solid #eee">${escapeHtml(cell)}</td>`)
          .join('')}</tr>`,
    )
    .join('');

  return `<!doctype html><html><head><title>${escapeHtml(title)}</title><style>body{font-family:Arial,sans-serif;padding:40px;color:#333}.header{text-align:center;border-bottom:2px solid #8b4513;padding-bottom:18px}table{width:100%;border-collapse:collapse;margin-top:20px;font-size:12px}.total{font-weight:bold;text-align:right;margin-top:18px}</style></head><body><div class="header"><h1>ECENCIA ANDINA</h1><p>${escapeHtml(title)}</p><p>Periodo: ${escapeHtml(startDate)} - ${escapeHtml(endDate)}</p></div><table><thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody></table><p class="total">${escapeHtml(totalLabel)}: $${formatMoney(total)}</p></body></html>`;
};

export const downloadTextFile = (content: string, mimeType: string, fileName: string) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};
