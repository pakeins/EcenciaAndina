import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table';
import { FileDown, Calendar, Filter, FileText, PieChart, Users, Building2, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { Convenio, Client } from '@/types';
import { escapeHtml, formatMoney, openPrintWindow, toFiniteNumber } from '@/lib/html';

interface Consumo {
  fecha: string;
  producto: string;
  cantidad: number;
  valor: number;
}

interface ColaboradorConsumo {
  empleado: string;
  cedula: string;
  consumos: Consumo[];
  total: number;
}

const SALES_LUNCH_COLUMNS = [
  { key: 'ejecutivoCompleto', label: 'Ejecutivo completo', xmlTag: 'ejecutivoCompleto' },
  { key: 'ejecutivoSinSopa', label: 'Sin sopa', xmlTag: 'ejecutivoSinSopa' },
  { key: 'ejecutivoSimple', label: 'Ejecutivo simple', xmlTag: 'ejecutivoSimple' },
  { key: 'almuerzoDia', label: 'Almuerzo dia', xmlTag: 'almuerzoDia' },
  { key: 'almuerzoDiaSimple', label: 'Dia simple', xmlTag: 'almuerzoDiaSimple' },
  { key: 'otrosAlmuerzos', label: 'Otros almuerzos', xmlTag: 'otrosAlmuerzos' },
] as const;

export default function Reportes() {
  const [reportType, setReportType] = useState('ventas');
  
  // Filtros
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];
  
  const [fechaInicio, setFechaInicio] = useState(firstDay);
  const [fechaFin, setFechaFin] = useState(lastDay);
  
  const [idEstado, setIdEstado] = useState('all');
  const [idCliente, setIdCliente] = useState('all');
  const [idConvenio, setIdConvenio] = useState('all');

  // Listas de catálogo
  const [clientes, setClientes] = useState<Client[]>([]);
  const [convenios, setConvenios] = useState<Convenio[]>([]);

  // Datos
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [reportData, setReportData] = useState<any[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);

  const isDateRangeInvalid = fechaInicio && fechaFin && new Date(fechaFin) < new Date(fechaInicio);
  const [desglosarConvenio, setDesglosarConvenio] = useState(false);

  const calculateTotal = () => {
    return reportData.reduce((acc, row) => {
      if ((reportType === 'estados' || reportType === 'clientes') && row.estado === 'Cancelado' && idEstado !== '3') {
        return acc;
      }
      if (reportType === 'convenio') {
        return acc + (row.total || 0);
      }
      return acc + (row.totalConsumo || row.ingresosGenerados || 0);
    }, 0);
  };

  const getColSpan = () => {
    if (reportType === 'estados' || reportType === 'clientes') return 4;
    if (reportType === 'convenio') return desglosarConvenio ? 4 : 3;
    if (reportType === 'productos') return 3;
    if (reportType === 'ventas') return 10;
    return 3;
  };

  useEffect(() => {
    fetchCatalogos();
  }, []);

  const fetchCatalogos = async () => {
    try {
      const [cliRes, convRes] = await Promise.all([
        apiFetch('/clientes'),
        apiFetch('/convenios')
      ]);
      if (cliRes.ok) setClientes(await cliRes.json());
      if (convRes.ok) setConvenios(await convRes.json());
    } catch (error) {
      console.error('Error cargando catálogos para reportes', error);
    }
  };

  const handleGenerateReport = async () => {
    if (isDateRangeInvalid) {
      toast.error('La fecha "Hasta" no puede ser inferior a la fecha "Desde".');
      return;
    }

    if (reportType === 'clientes' && idCliente === 'all') {
      toast.error('Debe seleccionar un cliente específico.');
      return;
    }

    if (reportType === 'convenio' && idConvenio === 'all') {
      toast.error('Debe seleccionar un convenio específico.');
      return;
    }

    setIsGenerating(true);
    setHasGenerated(false);
    
    try {
      let endpoint = `/reportes/${reportType}?fecha_inicio=${fechaInicio}&fecha_fin=${fechaFin}`;
      
      if (reportType === 'estados') endpoint += `&id_estado=${idEstado}`;
      if (reportType === 'clientes') endpoint += `&id_cliente=${idCliente}`;
      
      // Convenio usa su propia ruta para reutilizar la lógica ya hecha
      if (reportType === 'convenio') {
        endpoint = `/convenios/${idConvenio}/reporte?fecha_inicio=${fechaInicio}&fecha_fin=${fechaFin}`;
      }

      const response = await apiFetch(endpoint);
      if (response.ok) {
        const data = await response.json();

        // rowId estable para las keys de React (se genera una vez por reporte).
        setReportData(data.map((row: Record<string, unknown>, index: number) => ({ ...row, rowId: `${reportType}-${index}` })));
        setHasGenerated(true);
        toast.success('Reporte generado exitosamente');
      } else {
        const err = await response.json();
        toast.error(err.error || 'Error al generar reporte');
      }
    } catch (error) {
      console.error('Error generando el reporte:', error);
      toast.error('Error de conexión al generar reporte');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExportPDF = () => {
    try {
      const reportTitleMap: Record<string, string> = {
        'ventas': 'Resumen General de Ingresos',
        'estados': 'Reporte de Pedidos por Estado',
        'convenio': 'Consolidado por Convenio Empresa',
        'clientes': 'Consumo Detallado por Cliente',
        'productos': 'Popularidad de Almuerzos y Productos'
      };

      const title = reportTitleMap[reportType] || 'Reporte';
      const safeTitle = escapeHtml(title);
      const safeFechaInicio = escapeHtml(new Date(fechaInicio).toLocaleDateString('es-EC'));
      const safeFechaFin = escapeHtml(new Date(fechaFin).toLocaleDateString('es-EC'));
      
      let htmlRows = '';
      
      if (reportType === 'ventas') {
        const salesLunchHeaderCells = SALES_LUNCH_COLUMNS.map((column) =>
          `<th style="padding: 12px 8px; border-bottom: 2px solid #ddd; text-align: center;">${column.label}</th>`,
        ).join('');
        htmlRows = `
          <tr>
            <th style="padding: 12px 8px; border-bottom: 2px solid #ddd; text-align: left;">Método de Pago</th>
            <th style="padding: 12px 8px; border-bottom: 2px solid #ddd; text-align: center;">Principales</th>
            ${salesLunchHeaderCells}
            <th style="padding: 12px 8px; border-bottom: 2px solid #ddd; text-align: center;">Extras</th>
            <th style="padding: 12px 8px; border-bottom: 2px solid #ddd; text-align: right;">Valor extras</th>
            <th style="padding: 12px 8px; border-bottom: 2px solid #ddd; text-align: right;">Ingresos Generados</th>
          </tr>
        `;
        reportData.forEach(row => {
          const salesLunchCells = SALES_LUNCH_COLUMNS.map((column) =>
            `<td style="padding: 10px 8px; border-bottom: 1px solid #eee; text-align: center;">${toFiniteNumber(row[column.key])}</td>`,
          ).join('');
          htmlRows += `
            <tr>
              <td style="padding: 10px 8px; border-bottom: 1px solid #eee;">${escapeHtml(row.metodo_pago)}</td>
              <td style="padding: 10px 8px; border-bottom: 1px solid #eee; text-align: center;">${toFiniteNumber(row.almuerzosPrincipales ?? row.cantidadAlmuerzos)}</td>
              ${salesLunchCells}
              <td style="padding: 10px 8px; border-bottom: 1px solid #eee; text-align: center;">${toFiniteNumber(row.extrasCantidad)}</td>
              <td style="padding: 10px 8px; border-bottom: 1px solid #eee; text-align: right;">$${formatMoney(row.valorExtras)}</td>
              <td style="padding: 10px 8px; border-bottom: 1px solid #eee; text-align: right;">$${formatMoney(row.totalConsumo)}</td>
            </tr>
          `;
        });
      } else if (reportType === 'estados' || reportType === 'clientes') {
        htmlRows = `
          <tr>
            <th style="padding: 12px 8px; border-bottom: 2px solid #ddd; text-align: left;">Fecha</th>
            ${reportType === 'estados' ? '<th style="padding: 12px 8px; border-bottom: 2px solid #ddd; text-align: left;">Cliente</th>' : ''}
            ${reportType === 'clientes' ? '<th style="padding: 12px 8px; border-bottom: 2px solid #ddd; text-align: left;">Convenio</th>' : ''}
            <th style="padding: 12px 8px; border-bottom: 2px solid #ddd; text-align: left;">Estado</th>
            <th style="padding: 12px 8px; border-bottom: 2px solid #ddd; text-align: left;">Descripción</th>
            <th style="padding: 12px 8px; border-bottom: 2px solid #ddd; text-align: right;">Total</th>
          </tr>
        `;
        reportData.forEach(row => {
          htmlRows += `
            <tr>
              <td style="padding: 10px 8px; border-bottom: 1px solid #eee;">${new Date(row.fecha).toLocaleString()}</td>
              ${reportType === 'estados' ? `<td style="padding: 10px 8px; border-bottom: 1px solid #eee;">${row.cliente}</td>` : ''}
              ${reportType === 'clientes' ? `<td style="padding: 10px 8px; border-bottom: 1px solid #eee;">${row.convenio || 'N/A'}</td>` : ''}
              <td style="padding: 10px 8px; border-bottom: 1px solid #eee;">${row.estado}</td>
              <td style="padding: 10px 8px; border-bottom: 1px solid #eee;">${row.descripcion}</td>
              <td style="padding: 10px 8px; border-bottom: 1px solid #eee; text-align: right;">$${row.totalConsumo.toFixed(2)}</td>
            </tr>
          `;
        });
      } else if (reportType === 'productos') {
        htmlRows = `
          <tr>
            <th style="padding: 12px 8px; border-bottom: 2px solid #ddd; text-align: left;">Producto</th>
            <th style="padding: 12px 8px; border-bottom: 2px solid #ddd; text-align: left;">Categoría</th>
            <th style="padding: 12px 8px; border-bottom: 2px solid #ddd; text-align: center;">Cantidad Vendida</th>
            <th style="padding: 12px 8px; border-bottom: 2px solid #ddd; text-align: right;">Ingresos</th>
          </tr>
        `;
        reportData.forEach(row => {
          htmlRows += `
            <tr>
              <td style="padding: 10px 8px; border-bottom: 1px solid #eee;">${escapeHtml(row.nombre)}</td>
              <td style="padding: 10px 8px; border-bottom: 1px solid #eee;">${escapeHtml(row.categoria)}</td>
              <td style="padding: 10px 8px; border-bottom: 1px solid #eee; text-align: center;">${toFiniteNumber(row.cantidadVendida)}</td>
              <td style="padding: 10px 8px; border-bottom: 1px solid #eee; text-align: right;">$${formatMoney(row.ingresosGenerados)}</td>
            </tr>
          `;
        });
      } else if (reportType === 'convenio') {
        if (!desglosarConvenio) {
          htmlRows = `
            <tr>
              <th style="padding: 12px 8px; border-bottom: 2px solid #ddd; text-align: left;">Colaborador</th>
              <th style="padding: 12px 8px; border-bottom: 2px solid #ddd; text-align: left;">Cédula</th>
              <th style="padding: 12px 8px; border-bottom: 2px solid #ddd; text-align: center;">Almuerzos Consumidos</th>
              <th style="padding: 12px 8px; border-bottom: 2px solid #ddd; text-align: right;">Costo Total</th>
            </tr>
          `;
          reportData.forEach((emp: ColaboradorConsumo) => {
            const totalAlmuerzos = (emp.consumos || []).reduce((sum: number, c: Consumo) => sum + c.cantidad, 0);
            htmlRows += `
              <tr>
                <td style="padding: 10px 8px; border-bottom: 1px solid #eee;">${emp.empleado}</td>
                <td style="padding: 10px 8px; border-bottom: 1px solid #eee;">${emp.cedula}</td>
                <td style="padding: 10px 8px; border-bottom: 1px solid #eee; text-align: center;">${totalAlmuerzos}</td>
                <td style="padding: 10px 8px; border-bottom: 1px solid #eee; text-align: right;">$${emp.total.toFixed(2)}</td>
              </tr>
            `;
          });
        } else {
          htmlRows = `
            <tr>
              <th style="padding: 12px 8px; border-bottom: 2px solid #ddd; text-align: left;">Colaborador</th>
              <th style="padding: 12px 8px; border-bottom: 2px solid #ddd; text-align: left;">Fecha / Hora</th>
              <th style="padding: 12px 8px; border-bottom: 2px solid #ddd; text-align: left;">Tipo de Almuerzo</th>
              <th style="padding: 12px 8px; border-bottom: 2px solid #ddd; text-align: center;">Cantidad</th>
              <th style="padding: 12px 8px; border-bottom: 2px solid #ddd; text-align: right;">Costo Total</th>
            </tr>
          `;
          reportData.forEach((emp: ColaboradorConsumo) => {
            (emp.consumos || []).forEach((c: Consumo) => {
              htmlRows += `
                <tr>
                  <td style="padding: 10px 8px; border-bottom: 1px solid #eee;">${emp.empleado}</td>
                  <td style="padding: 10px 8px; border-bottom: 1px solid #eee;">${new Date(c.fecha).toLocaleString()}</td>
                  <td style="padding: 10px 8px; border-bottom: 1px solid #eee;">${c.producto}</td>
                  <td style="padding: 10px 8px; border-bottom: 1px solid #eee; text-align: center;">${c.cantidad}</td>
                  <td style="padding: 10px 8px; border-bottom: 1px solid #eee; text-align: right;">$${c.valor.toFixed(2)}</td>
                </tr>
              `;
            });
          });
        }
      }

      const totalAmount = calculateTotal();
      htmlRows += `
        <tr style="background-color: #f8f9fa;">
          <td colspan="${getColSpan()}" style="padding: 12px 8px; text-align: right; font-weight: bold; font-size: 14px; border-top: 2px solid #ddd;">${
            reportType === 'estados' && idEstado === '3' 
              ? 'Total Cancelado:' 
              : 'Total Neto:'
          }</td>
          <td style="padding: 12px 8px; text-align: right; font-weight: bold; font-size: 14px; border-top: 2px solid #ddd; color: #7A402E;">$${totalAmount.toFixed(2)}</td>
        </tr>
      `;

      const contenido = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Reporte ECencia Andina</title>
            <style>
              body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #2F4D49; }
              .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #7A402E; padding-bottom: 20px; }
              .title { font-size: 24px; font-weight: bold; color: #7A402E; margin: 0 0 10px 0; }
              .subtitle { font-size: 14px; color: #61603C; margin: 0; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
              .footer { margin-top: 40px; text-align: center; font-size: 10px; color: #999; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1 class="title">ECENCIA ANDINA</h1>
              <p class="subtitle">${safeTitle}</p>
              <p class="subtitle">Período: ${safeFechaInicio} - ${safeFechaFin}</p>
            </div>
            <table>
              ${htmlRows}
            </table>
            <div class="footer">
              Generado el ${escapeHtml(new Date().toLocaleString('es-EC'))}
            </div>
          </body>
        </html>
      `;

      const printWindow = openPrintWindow(contenido);
      if (!printWindow) {
        toast.error('El navegador bloqueó la ventana emergente');
        return;
      }

      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
      }, 500);
    } catch (err) {
      console.error('Error generando el PDF del reporte:', err);
      toast.error('Error al generar el documento PDF');
    }
  };

  const handleExportXML = () => {
    try {
      let xmlContent = '<?xml version="1.0" encoding="UTF-8"?>\n';
      xmlContent += `<reporte tipo="${reportType}" fechaInicio="${fechaInicio}" fechaFin="${fechaFin}">\n`;
      xmlContent += `  <metadatos>\n`;
      xmlContent += `    <generadoPor>Sistema ECencia Andina</generadoPor>\n`;
      xmlContent += `    <fechaGenerado>${new Date().toISOString()}</fechaGenerado>\n`;
      xmlContent += `  </metadatos>\n`;
      xmlContent += `  <datos>\n`;

      if (reportType === 'ventas') {
        reportData.forEach(row => {
          xmlContent += `    <item>\n`;
          xmlContent += `      <metodoPago>${row.metodo_pago}</metodoPago>\n`;
          xmlContent += `      <almuerzosPrincipales>${toFiniteNumber(row.almuerzosPrincipales ?? row.cantidadAlmuerzos)}</almuerzosPrincipales>\n`;
          SALES_LUNCH_COLUMNS.forEach((column) => {
            xmlContent += `      <${column.xmlTag}>${toFiniteNumber(row[column.key])}</${column.xmlTag}>\n`;
          });
          xmlContent += `      <extrasCantidad>${toFiniteNumber(row.extrasCantidad)}</extrasCantidad>\n`;
          xmlContent += `      <valorExtras>${formatMoney(row.valorExtras)}</valorExtras>\n`;
          xmlContent += `      <totalConsumo>${row.totalConsumo.toFixed(2)}</totalConsumo>\n`;
          xmlContent += `    </item>\n`;
        });
      } else if (reportType === 'estados' || reportType === 'clientes') {
        reportData.forEach(row => {
          xmlContent += `    <item>\n`;
          xmlContent += `      <idOrden>${row.id}</idOrden>\n`;
          xmlContent += `      <fecha>${row.fecha}</fecha>\n`;
          if (reportType === 'estados') {
            xmlContent += `      <cliente>${row.cliente}</cliente>\n`;
          } else {
            xmlContent += `      <convenio>${row.convenio || 'N/A'}</convenio>\n`;
          }
          xmlContent += `      <estado>${row.estado}</estado>\n`;
          xmlContent += `      <descripcion>${row.descripcion}</descripcion>\n`;
          xmlContent += `      <totalConsumo>${row.totalConsumo.toFixed(2)}</totalConsumo>\n`;
          xmlContent += `    </item>\n`;
        });
      } else if (reportType === 'productos') {
        reportData.forEach(row => {
          xmlContent += `    <item>\n`;
          xmlContent += `      <nombre>${row.nombre}</nombre>\n`;
          xmlContent += `      <categoria>${row.categoria}</categoria>\n`;
          xmlContent += `      <cantidadVendida>${row.cantidadVendida}</cantidadVendida>\n`;
          xmlContent += `      <ingresosGenerados>${row.ingresosGenerados.toFixed(2)}</ingresosGenerados>\n`;
          xmlContent += `    </item>\n`;
        });
      } else if (reportType === 'convenio') {
        if (!desglosarConvenio) {
          reportData.forEach((emp: ColaboradorConsumo) => {
            const totalAlmuerzos = (emp.consumos || []).reduce((sum: number, c: Consumo) => sum + c.cantidad, 0);
            xmlContent += `    <colaborador>\n`;
            xmlContent += `      <nombre>${emp.empleado}</nombre>\n`;
            xmlContent += `      <cedula>${emp.cedula}</cedula>\n`;
            xmlContent += `      <cantidadAlmuerzos>${totalAlmuerzos}</cantidadAlmuerzos>\n`;
            xmlContent += `      <costoTotal>${emp.total.toFixed(2)}</costoTotal>\n`;
            xmlContent += `    </colaborador>\n`;
          });
        } else {
          reportData.forEach((emp: ColaboradorConsumo) => {
            (emp.consumos || []).forEach((c: Consumo) => {
              xmlContent += `    <consumo>\n`;
              xmlContent += `      <colaborador>${emp.empleado}</colaborador>\n`;
              xmlContent += `      <fecha>${c.fecha}</fecha>\n`;
              xmlContent += `      <producto>${c.producto}</producto>\n`;
              xmlContent += `      <cantidad>${c.cantidad}</cantidad>\n`;
              xmlContent += `      <costo>${c.valor.toFixed(2)}</costo>\n`;
              xmlContent += `    </consumo>\n`;
            });
          });
        }
      }

      xmlContent += `  </datos>\n`;
      xmlContent += `  <resumen>\n`;
      xmlContent += `    <totalNeto>${calculateTotal().toFixed(2)}</totalNeto>\n`;
      xmlContent += `  </resumen>\n`;
      xmlContent += `</reporte>\n`;

      const blob = new Blob([xmlContent], { type: 'application/xml;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `reporte_${reportType}_${fechaInicio}_al_${fechaFin}.xml`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Archivo XML descargado exitosamente');
    } catch (err) {
      console.error('Error exportando el reporte a XML:', err);
      toast.error('Error al exportar reporte a XML');
    }
  };

  const handleExportCSV = () => {
    try {
      const csvContent = '\uFEFF'; // UTF-8 BOM for Excel compatibility
      let headers: string[] = [];
      let rows: string[][] = [];

      if (reportType === 'ventas') {
        headers = [
          'Método de Pago',
          'Almuerzos Principales',
          ...SALES_LUNCH_COLUMNS.map((column) => column.label),
          'Extras',
          'Valor Extras',
          'Ingresos Generados'
        ];
        rows = reportData.map(row => [
          row.metodo_pago,
          toFiniteNumber(row.almuerzosPrincipales ?? row.cantidadAlmuerzos).toString(),
          ...SALES_LUNCH_COLUMNS.map((column) => toFiniteNumber(row[column.key]).toString()),
          toFiniteNumber(row.extrasCantidad).toString(),
          `$${formatMoney(row.valorExtras)}`,
          `$${formatMoney(row.totalConsumo)}`
        ]);
      } else if (reportType === 'estados' || reportType === 'clientes') {
        headers = [
          'Fecha/Hora',
          reportType === 'estados' ? 'Cliente' : 'Convenio',
          'Estado',
          'Descripción',
          'Costo'
        ];
        rows = reportData.map(row => [
          new Date(row.fecha).toLocaleString(),
          reportType === 'estados' ? row.cliente : (row.convenio || 'N/A'),
          row.estado,
          row.descripcion,
          `$${row.totalConsumo.toFixed(2)}`
        ]);
      } else if (reportType === 'productos') {
        headers = ['Producto', 'Categoría', 'Cantidad Vendida', 'Ingresos Estimados'];
        rows = reportData.map(row => [
          row.nombre,
          row.categoria,
          row.cantidadVendida.toString(),
          `$${row.ingresosGenerados.toFixed(2)}`
        ]);
      } else if (reportType === 'convenio') {
        if (!desglosarConvenio) {
          headers = ['Colaborador', 'Cédula', 'Almuerzos Consumidos', 'Costo Total'];
          rows = reportData.map((emp: ColaboradorConsumo) => {
            const totalAlmuerzos = (emp.consumos || []).reduce((sum: number, c: Consumo) => sum + c.cantidad, 0);
            return [
              emp.empleado,
              emp.cedula,
              totalAlmuerzos.toString(),
              `$${emp.total.toFixed(2)}`
            ];
          });
        } else {
          headers = ['Colaborador', 'Fecha/Hora', 'Tipo de Almuerzo', 'Cantidad', 'Costo Total'];
          reportData.forEach((emp: ColaboradorConsumo) => {
            (emp.consumos || []).forEach((c: Consumo) => {
              rows.push([
                emp.empleado,
                new Date(c.fecha).toLocaleString(),
                c.producto,
                c.cantidad.toString(),
                `$${c.valor.toFixed(2)}`
              ]);
            });
          });
        }
      }

      // Prepend headers
      const csvRows = [headers.map(h => `"${h.replace(/"/g, '""')}"`).join(',')];
      
      // Map rows escaping fields
      rows.forEach(row => {
        csvRows.push(row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(','));
      });

      // Add Total row
      const totalAmount = calculateTotal();
      const totalLabel = reportType === 'estados' && idEstado === '3' ? 'Total Cancelado' : 'Total Neto';
      
      // Match total column length
      const totalRow = new Array(headers.length).fill('');
      totalRow[headers.length - 2] = totalLabel;
      totalRow[headers.length - 1] = `$${totalAmount.toFixed(2)}`;
      csvRows.push(totalRow.map(cell => `"${cell}"`).join(','));

      const fullCsv = csvRows.join('\n');
      const blob = new Blob([csvContent + fullCsv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `facturacion_${reportType}_${fechaInicio}_al_${fechaFin}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Archivo de facturación CSV descargado exitosamente');
    } catch (err) {
      console.error('Error generando el CSV de facturación:', err);
      toast.error('Error al generar archivo de facturación CSV');
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-4xl font-extrabold tracking-tight text-foreground bg-clip-text text-transparent bg-gradient-to-r from-cafe to-terracota">
          Reportes y Estadísticas
        </h1>
        <p className="text-muted-foreground text-lg">Centro de análisis y generación de informes operativos.</p>
      </div>

      <Card className="border-border shadow-md">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-cafe" />
            Configuración del Reporte
          </CardTitle>
          <CardDescription>
            Seleccione el tipo de informe que desea generar y ajuste los parámetros necesarios.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid gap-4 grid-cols-1 md:grid-cols-4 items-end">
              
              {/* 1. Tipo de Reporte */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-cafe" /> Tipo de Reporte
                </Label>
                <Select value={reportType} onValueChange={(val) => { setReportType(val); setHasGenerated(false); }}>
                  <SelectTrigger className="border-primary/20">
                    <SelectValue placeholder="Seleccione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ventas"><div className="flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Ingresos Generales</div></SelectItem>
                    <SelectItem value="estados"><div className="flex items-center gap-2"><PieChart className="h-4 w-4" /> Pedidos por Estado</div></SelectItem>
                    <SelectItem value="productos"><div className="flex items-center gap-2"><FileText className="h-4 w-4" /> Popularidad de Productos</div></SelectItem>
                    <SelectItem value="convenio"><div className="flex items-center gap-2"><Building2 className="h-4 w-4" /> Consolidado por Convenio</div></SelectItem>
                    <SelectItem value="clientes"><div className="flex items-center gap-2"><Users className="h-4 w-4" /> Consumos por Cliente</div></SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* 2. Desde */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><Calendar className="h-4 w-4 text-cafe" /> Desde</Label>
                <Input 
                  type="date" 
                  value={fechaInicio} 
                  onChange={(e) => {setFechaInicio(e.target.value); setHasGenerated(false);}} 
                  className={isDateRangeInvalid ? "border-destructive focus-visible:ring-destructive" : ""}
                />
              </div>

              {/* 3. Hasta */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><Calendar className="h-4 w-4 text-cafe" /> Hasta</Label>
                <Input 
                  type="date" 
                  value={fechaFin} 
                  onChange={(e) => {setFechaFin(e.target.value); setHasGenerated(false);}} 
                  className={isDateRangeInvalid ? "border-destructive focus-visible:ring-destructive" : ""}
                />
              </div>

              {/* 4. Filtro Específico (si aplica) */}
              {reportType === 'estados' && (
                <div className="space-y-2">
                  <Label>Estado de Pedido</Label>
                  <Select value={idEstado} onValueChange={setIdEstado}>
                    <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los estados</SelectItem>
                      <SelectItem value="1">Reservado</SelectItem>
                      <SelectItem value="2">Consumido</SelectItem>
                      <SelectItem value="3">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {reportType === 'clientes' && (
                <div className="space-y-2">
                  <Label>Seleccionar Cliente</Label>
                  <Select value={idCliente} onValueChange={setIdCliente}>
                    <SelectTrigger><SelectValue placeholder="Seleccione cliente..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">-- Seleccione --</SelectItem>
                      {clientes.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.nombre} {c.apellido} ({c.cedula})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {reportType === 'convenio' && (
                <div className="space-y-2">
                  <Label>Seleccionar Convenio Empresa</Label>
                  <Select value={idConvenio} onValueChange={setIdConvenio}>
                    <SelectTrigger><SelectValue placeholder="Seleccione convenio..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">-- Seleccione --</SelectItem>
                      {convenios.filter(c => c.activo).map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.nombre_empresa}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {/* Celda vacía para mantener alineación del grid cuando no hay filtro extra */}
              {!['estados', 'clientes', 'convenio'].includes(reportType) && (
                <div className="hidden md:block h-[38px]" />
              )}

            </div>

            {/* Alerta de validación de fechas */}
            {isDateRangeInvalid && (
              <p className="text-xs font-semibold text-destructive mt-1">
                ⚠️ La fecha "Hasta" no puede ser anterior a la fecha "Desde".
              </p>
            )}

            {/* Fila de acciones al fondo */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-4 border-t border-border/50 mt-2">
              <div className="flex-1">
                {reportType === 'convenio' && (
                  <div className="flex items-center gap-2">
                    <Switch 
                      id="desglosar-convenio"
                      checked={desglosarConvenio} 
                      onCheckedChange={(checked) => { setDesglosarConvenio(checked); }} 
                    />
                    <Label htmlFor="desglosar-convenio" className="font-semibold text-xs text-muted-foreground cursor-pointer">
                      Desglosar consumos individuales por colaborador
                    </Label>
                  </div>
                )}
              </div>
              
              <Button 
                onClick={handleGenerateReport} 
                disabled={isGenerating || isDateRangeInvalid}
                className="bg-cafe hover:bg-cafe/90 shadow-lg px-8 font-bold h-10 w-full sm:w-auto"
              >
                {isGenerating ? 'Calculando...' : 'Generar Reporte'}
              </Button>
            </div>
            
          </div>
        </CardContent>
      </Card>

      {/* Resultados */}
      {hasGenerated && (
        <Card className="border-border shadow-sm animate-in fade-in slide-in-from-bottom-4">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-muted/20 border-b pb-4 gap-4">
            <div>
              <CardTitle className="text-foreground text-xl">Resultados del Análisis</CardTitle>
              <CardDescription>Período analizado: {new Date(fechaInicio).toLocaleDateString('es-EC')} al {new Date(fechaFin).toLocaleDateString('es-EC')}</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={handleExportPDF} className="gap-2 bg-slate-800 hover:bg-slate-700 text-white shadow-md h-9 text-xs">
                <FileDown className="h-4 w-4" /> Exportar PDF
              </Button>
              <Button onClick={handleExportXML} variant="outline" className="gap-2 border-primary/30 text-primary hover:bg-primary/10 h-9 text-xs">
                <FileDown className="h-4 w-4" /> Exportar XML
              </Button>
              <Button onClick={handleExportCSV} variant="outline" className="gap-2 border-cafe/30 text-cafe hover:bg-cafe/10 h-9 text-xs">
                <FileDown className="h-4 w-4" /> Exportar CSV
              </Button>
            </div>
          </CardHeader>
          
          <CardContent className="pt-6">
            
            {reportData.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground bg-muted/10 border-2 border-dashed rounded-xl">
                <PieChart className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p>No se encontraron datos para los parámetros seleccionados.</p>
              </div>
            ) : (
              <div className="rounded-xl border border-border overflow-x-auto shadow-sm">
                <Table className={reportType === 'ventas' ? 'min-w-[1240px]' : undefined}>
                  <TableHeader>
                    <TableRow className="bg-secondary/20 hover:bg-secondary/20">
                      
                      {reportType === 'ventas' && (
                        <>
                          <TableHead className="text-cafe font-bold">Método de Pago</TableHead>
                          <TableHead className="text-center text-cafe font-bold">Principales</TableHead>
                          {SALES_LUNCH_COLUMNS.map((column) => (
                            <TableHead key={column.key} className="text-center text-cafe font-bold">{column.label}</TableHead>
                          ))}
                          <TableHead className="text-center text-cafe font-bold">Extras</TableHead>
                          <TableHead className="text-right text-cafe font-bold">Valor extras</TableHead>
                          <TableHead className="text-right text-cafe font-bold">Ingresos Generados</TableHead>
                        </>
                      )}
                      
                      {(reportType === 'estados' || reportType === 'clientes') && (
                        <>
                          <TableHead className="text-cafe font-bold">Fecha / Hora</TableHead>
                          {reportType === 'estados' && <TableHead className="text-cafe font-bold">Cliente</TableHead>}
                          {reportType === 'clientes' && <TableHead className="text-cafe font-bold">Convenio</TableHead>}
                          <TableHead className="text-cafe font-bold">Estado</TableHead>
                          <TableHead className="text-cafe font-bold">Descripción</TableHead>
                          <TableHead className="text-right text-cafe font-bold">Costo</TableHead>
                        </>
                      )}

                      {reportType === 'productos' && (
                        <>
                          <TableHead className="text-cafe font-bold">Producto</TableHead>
                          <TableHead className="text-cafe font-bold">Categoría</TableHead>
                          <TableHead className="text-center text-cafe font-bold">Cant. Vendida</TableHead>
                          <TableHead className="text-right text-cafe font-bold">Ingresos Estimados</TableHead>
                        </>
                      )}

                      {reportType === 'convenio' && (
                        <>
                          <TableHead className="text-cafe font-bold">Colaborador</TableHead>
                          {!desglosarConvenio ? (
                            <>
                              <TableHead className="text-cafe font-bold">Cédula</TableHead>
                              <TableHead className="text-center text-cafe font-bold">Almuerzos Consumidos</TableHead>
                            </>
                          ) : (
                            <>
                              <TableHead className="text-cafe font-bold">Fecha / Hora</TableHead>
                              <TableHead className="text-cafe font-bold">Tipo de Almuerzo</TableHead>
                              <TableHead className="text-center text-cafe font-bold">Cantidad</TableHead>
                            </>
                          )}
                          <TableHead className="text-right text-cafe font-bold">Costo Total</TableHead>
                        </>
                      )}

                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportType === 'ventas' && reportData.map((row) => (
                      <TableRow key={row.rowId}>
                        <TableCell className="font-medium">{row.metodo_pago}</TableCell>
                        <TableCell className="text-center">{toFiniteNumber(row.almuerzosPrincipales ?? row.cantidadAlmuerzos)}</TableCell>
                        {SALES_LUNCH_COLUMNS.map((column) => (
                          <TableCell key={column.key} className="text-center">{toFiniteNumber(row[column.key])}</TableCell>
                        ))}
                        <TableCell className="text-center">{toFiniteNumber(row.extrasCantidad)}</TableCell>
                        <TableCell className="text-right font-semibold text-cafe">${formatMoney(row.valorExtras)}</TableCell>
                        <TableCell className="text-right font-semibold text-cafe">${formatMoney(row.totalConsumo)}</TableCell>
                      </TableRow>
                    ))}

                    {(reportType === 'estados' || reportType === 'clientes') && reportData.map((row) => (
                      <TableRow key={row.rowId}>
                        <TableCell className="text-xs">{new Date(row.fecha).toLocaleString()}</TableCell>
                        {reportType === 'estados' && <TableCell className="font-medium">{row.cliente}</TableCell>}
                        {reportType === 'clientes' && <TableCell className="font-medium">{row.convenio || 'N/A'}</TableCell>}
                        <TableCell>
                          <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${
                            row.estado === 'Consumido' ? 'bg-green-100 text-green-700' :
                            row.estado === 'Reservado' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {row.estado}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{row.descripcion}</TableCell>
                        <TableCell className="text-right font-medium">${row.totalConsumo.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}

                    {reportType === 'productos' && reportData.map((row) => (
                      <TableRow key={row.rowId}>
                        <TableCell className="font-medium">{row.nombre}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{row.categoria}</TableCell>
                        <TableCell className="text-center">{row.cantidadVendida}</TableCell>
                        <TableCell className="text-right font-semibold text-green-700">${row.ingresosGenerados.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}

                    {reportType === 'convenio' && !desglosarConvenio && reportData.map((emp: ColaboradorConsumo) => {
                      const totalAlmuerzos = (emp.consumos || []).reduce((sum: number, c: Consumo) => sum + c.cantidad, 0);
                      return (
                        <TableRow key={emp.cedula}>
                          <TableCell className="font-medium">{emp.empleado}</TableCell>
                          <TableCell>{emp.cedula}</TableCell>
                          <TableCell className="text-center">{totalAlmuerzos}</TableCell>
                          <TableCell className="text-right font-semibold text-green-700">${emp.total.toFixed(2)}</TableCell>
                        </TableRow>
                      );
                    })}

                    {reportType === 'convenio' && desglosarConvenio && reportData.flatMap((emp: ColaboradorConsumo) =>
                      (emp.consumos || []).map((c: Consumo) => ({
                        rowId: `${emp.cedula}|${c.fecha}|${c.producto}|${c.cantidad}|${c.valor}`,
                        cliente: emp.empleado,
                        fecha: c.fecha,
                        producto: c.producto,
                        cantidad: c.cantidad,
                        valor: c.valor
                      }))
                    ).map((row) => (
                      <TableRow key={row.rowId}>
                        <TableCell className="font-medium">{row.cliente}</TableCell>
                        <TableCell className="text-xs">{new Date(row.fecha).toLocaleString()}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{row.producto}</TableCell>
                        <TableCell className="text-center">{row.cantidad}</TableCell>
                        <TableCell className="text-right font-semibold text-green-700">${row.valor.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={getColSpan()} className="text-right font-bold text-[15px]">
                        {reportType === 'estados' && idEstado === '3' 
                          ? 'Total Cancelado' 
                          : 'Total Neto (sin cancelados)'}
                      </TableCell>
                      <TableCell className="text-right font-black text-[16px] text-cafe">
                        ${calculateTotal().toFixed(2)}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            )}
            
          </CardContent>
        </Card>
      )}
    </div>
  );
}
