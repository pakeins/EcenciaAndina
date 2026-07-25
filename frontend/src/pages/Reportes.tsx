import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
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
import { FileDown, FileSpreadsheet, Calendar, Filter, FileText, PieChart, Users, Building2, TrendingUp } from 'lucide-react';
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
      const selectedConvenioObj = convenios.find(c => String(c.id) === String(idConvenio) || String(c.id_convenio) === String(idConvenio));
      const selectedClientObj = clientes.find(c => String(c.id) === String(idCliente) || String(c.id_cliente) === String(idCliente));

      const reportTitleMap: Record<string, string> = {
        'ventas': 'Resumen General de Ingresos',
        'estados': 'Reporte de Pedidos por Estado',
        'convenio': 'Consolidado Mensual por Convenio Empresa',
        'clientes': 'Consumo Detallado por Cliente',
        'productos': 'Popularidad de Almuerzos y Productos'
      };

      const title = reportTitleMap[reportType] || 'Reporte de Consumos';
      const safeTitle = escapeHtml(title);
      const safeFechaInicio = escapeHtml(new Date(fechaInicio).toLocaleDateString('es-EC'));
      const safeFechaFin = escapeHtml(new Date(fechaFin).toLocaleDateString('es-EC'));

      // Datos de la empresa/cliente destinatario
      let targetEmpresa = 'Consolidado General';
      let targetRuc = 'N/A';
      let targetRepresentante = 'N/A';
      let targetContacto = 'N/A';

      if (reportType === 'convenio' && selectedConvenioObj) {
        targetEmpresa = selectedConvenioObj.nombre_empresa;
        targetRuc = selectedConvenioObj.ruc || 'N/A';
        targetRepresentante = selectedConvenioObj.representante || 'N/A';
        targetContacto = `${selectedConvenioObj.email || ''} ${selectedConvenioObj.telefono ? '| ' + selectedConvenioObj.telefono : ''}`.trim() || 'N/A';
      } else if (reportType === 'clientes' && selectedClientObj) {
        targetEmpresa = `${selectedClientObj.nombre} ${selectedClientObj.apellido}`.trim();
        targetRuc = selectedClientObj.cedula || 'N/A';
        targetContacto = selectedClientObj.email || 'N/A';
      } else if (reportType === 'convenio') {
        targetEmpresa = 'Todas las Empresas de Convenio';
      }
      
      let htmlRows = '';
      
      if (reportType === 'ventas') {
        const salesLunchHeaderCells = SALES_LUNCH_COLUMNS.map((column) =>
          `<th style="padding: 10px 8px; border-bottom: 2px solid #7A402E; text-align: center; background-color: #f4efe9; color: #5a2e20; font-size: 11px;">${column.label}</th>`,
        ).join('');
        htmlRows = `
          <thead>
            <tr>
              <th style="padding: 10px 8px; border-bottom: 2px solid #7A402E; text-align: left; background-color: #f4efe9; color: #5a2e20; font-size: 11px;">Método de Pago</th>
              <th style="padding: 10px 8px; border-bottom: 2px solid #7A402E; text-align: center; background-color: #f4efe9; color: #5a2e20; font-size: 11px;">Principales</th>
              ${salesLunchHeaderCells}
              <th style="padding: 10px 8px; border-bottom: 2px solid #7A402E; text-align: center; background-color: #f4efe9; color: #5a2e20; font-size: 11px;">Extras</th>
              <th style="padding: 10px 8px; border-bottom: 2px solid #7A402E; text-align: right; background-color: #f4efe9; color: #5a2e20; font-size: 11px;">Valor extras</th>
              <th style="padding: 10px 8px; border-bottom: 2px solid #7A402E; text-align: right; background-color: #f4efe9; color: #5a2e20; font-size: 11px;">Ingresos Generados</th>
            </tr>
          </thead>
          <tbody>
        `;
        reportData.forEach((row, index) => {
          const bg = index % 2 === 0 ? '#ffffff' : '#faf8f5';
          const salesLunchCells = SALES_LUNCH_COLUMNS.map((column) =>
            `<td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${toFiniteNumber(row[column.key])}</td>`,
          ).join('');
          htmlRows += `
            <tr style="background-color: ${bg};">
              <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: 600;">${escapeHtml(row.metodo_pago)}</td>
              <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${toFiniteNumber(row.almuerzosPrincipales ?? row.cantidadAlmuerzos)}</td>
              ${salesLunchCells}
              <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${toFiniteNumber(row.extrasCantidad)}</td>
              <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">$${formatMoney(row.valorExtras)}</td>
              <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold;">$${formatMoney(row.totalConsumo)}</td>
            </tr>
          `;
        });
        htmlRows += `</tbody>`;
      } else if (reportType === 'estados' || reportType === 'clientes') {
        htmlRows = `
          <thead>
            <tr>
              <th style="padding: 10px 8px; border-bottom: 2px solid #7A402E; text-align: left; background-color: #f4efe9; color: #5a2e20; font-size: 11px;">Fecha / Hora</th>
              ${reportType === 'estados' ? '<th style="padding: 10px 8px; border-bottom: 2px solid #7A402E; text-align: left; background-color: #f4efe9; color: #5a2e20; font-size: 11px;">Cliente</th>' : ''}
              ${reportType === 'clientes' ? '<th style="padding: 10px 8px; border-bottom: 2px solid #7A402E; text-align: left; background-color: #f4efe9; color: #5a2e20; font-size: 11px;">Convenio</th>' : ''}
              <th style="padding: 10px 8px; border-bottom: 2px solid #7A402E; text-align: left; background-color: #f4efe9; color: #5a2e20; font-size: 11px;">Estado</th>
              <th style="padding: 10px 8px; border-bottom: 2px solid #7A402E; text-align: left; background-color: #f4efe9; color: #5a2e20; font-size: 11px;">Descripción</th>
              <th style="padding: 10px 8px; border-bottom: 2px solid #7A402E; text-align: right; background-color: #f4efe9; color: #5a2e20; font-size: 11px;">Total</th>
            </tr>
          </thead>
          <tbody>
        `;
        reportData.forEach((row, index) => {
          const bg = index % 2 === 0 ? '#ffffff' : '#faf8f5';
          htmlRows += `
            <tr style="background-color: ${bg};">
              <td style="padding: 8px; border-bottom: 1px solid #eee; font-size: 11px;">${new Date(row.fecha).toLocaleString('es-EC')}</td>
              ${reportType === 'estados' ? `<td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: 600;">${escapeHtml(row.cliente)}</td>` : ''}
              ${reportType === 'clientes' ? `<td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(row.convenio || 'N/A')}</td>` : ''}
              <td style="padding: 8px; border-bottom: 1px solid #eee;"><span style="padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; background: #eef2ff;">${escapeHtml(row.estado)}</span></td>
              <td style="padding: 8px; border-bottom: 1px solid #eee; font-size: 11px; color: #555;">${escapeHtml(row.descripcion)}</td>
              <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold;">$${row.totalConsumo.toFixed(2)}</td>
            </tr>
          `;
        });
        htmlRows += `</tbody>`;
      } else if (reportType === 'productos') {
        htmlRows = `
          <thead>
            <tr>
              <th style="padding: 10px 8px; border-bottom: 2px solid #7A402E; text-align: left; background-color: #f4efe9; color: #5a2e20; font-size: 11px;">Producto</th>
              <th style="padding: 10px 8px; border-bottom: 2px solid #7A402E; text-align: left; background-color: #f4efe9; color: #5a2e20; font-size: 11px;">Categoría</th>
              <th style="padding: 10px 8px; border-bottom: 2px solid #7A402E; text-align: center; background-color: #f4efe9; color: #5a2e20; font-size: 11px;">Cantidad Vendida</th>
              <th style="padding: 10px 8px; border-bottom: 2px solid #7A402E; text-align: right; background-color: #f4efe9; color: #5a2e20; font-size: 11px;">Ingresos Estimados</th>
            </tr>
          </thead>
          <tbody>
        `;
        reportData.forEach((row, index) => {
          const bg = index % 2 === 0 ? '#ffffff' : '#faf8f5';
          htmlRows += `
            <tr style="background-color: ${bg};">
              <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: 600;">${escapeHtml(row.nombre)}</td>
              <td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(row.categoria)}</td>
              <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${toFiniteNumber(row.cantidadVendida)}</td>
              <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold;">$${formatMoney(row.ingresosGenerados)}</td>
            </tr>
          `;
        });
        htmlRows += `</tbody>`;
      } else if (reportType === 'convenio') {
        if (!desglosarConvenio) {
          htmlRows = `
            <thead>
              <tr>
                <th style="padding: 10px 8px; border-bottom: 2px solid #7A402E; text-align: left; background-color: #f4efe9; color: #5a2e20; font-size: 11px;">Colaborador</th>
                <th style="padding: 10px 8px; border-bottom: 2px solid #7A402E; text-align: left; background-color: #f4efe9; color: #5a2e20; font-size: 11px;">Cédula</th>
                <th style="padding: 10px 8px; border-bottom: 2px solid #7A402E; text-align: center; background-color: #f4efe9; color: #5a2e20; font-size: 11px;">Almuerzos Consumidos</th>
                <th style="padding: 10px 8px; border-bottom: 2px solid #7A402E; text-align: right; background-color: #f4efe9; color: #5a2e20; font-size: 11px;">Costo Total</th>
              </tr>
            </thead>
            <tbody>
          `;
          reportData.forEach((emp: ColaboradorConsumo, index: number) => {
            const bg = index % 2 === 0 ? '#ffffff' : '#faf8f5';
            const totalAlmuerzos = (emp.consumos || []).reduce((sum: number, c: Consumo) => sum + c.cantidad, 0);
            htmlRows += `
              <tr style="background-color: ${bg};">
                <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: 600;">${escapeHtml(emp.empleado)}</td>
                <td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(emp.cedula)}</td>
                <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${totalAlmuerzos}</td>
                <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold; color: #2e5a36;">$${emp.total.toFixed(2)}</td>
              </tr>
            `;
          });
          htmlRows += `</tbody>`;
        } else {
          htmlRows = `
            <thead>
              <tr>
                <th style="padding: 10px 8px; border-bottom: 2px solid #7A402E; text-align: left; background-color: #f4efe9; color: #5a2e20; font-size: 11px;">Colaborador</th>
                <th style="padding: 10px 8px; border-bottom: 2px solid #7A402E; text-align: left; background-color: #f4efe9; color: #5a2e20; font-size: 11px;">Fecha / Hora</th>
                <th style="padding: 10px 8px; border-bottom: 2px solid #7A402E; text-align: left; background-color: #f4efe9; color: #5a2e20; font-size: 11px;">Tipo de Almuerzo</th>
                <th style="padding: 10px 8px; border-bottom: 2px solid #7A402E; text-align: center; background-color: #f4efe9; color: #5a2e20; font-size: 11px;">Cantidad</th>
                <th style="padding: 10px 8px; border-bottom: 2px solid #7A402E; text-align: right; background-color: #f4efe9; color: #5a2e20; font-size: 11px;">Costo Total</th>
              </tr>
            </thead>
            <tbody>
          `;
          let rowCounter = 0;
          reportData.forEach((emp: ColaboradorConsumo) => {
            (emp.consumos || []).forEach((c: Consumo) => {
              const bg = rowCounter++ % 2 === 0 ? '#ffffff' : '#faf8f5';
              htmlRows += `
                <tr style="background-color: ${bg};">
                  <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: 600;">${escapeHtml(emp.empleado)}</td>
                  <td style="padding: 8px; border-bottom: 1px solid #eee; font-size: 11px;">${new Date(c.fecha).toLocaleString('es-EC')}</td>
                  <td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(c.producto)}</td>
                  <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${c.cantidad}</td>
                  <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold; color: #2e5a36;">$${c.valor.toFixed(2)}</td>
                </tr>
              `;
            });
          });
          htmlRows += `</tbody>`;
        }
      }

      const totalAmount = calculateTotal();
      let totalLunches = 0;
      if (reportType === 'convenio') {
        totalLunches = reportData.reduce((sum, emp: ColaboradorConsumo) => sum + (emp.consumos || []).reduce((s: number, c: Consumo) => s + c.cantidad, 0), 0);
      } else if (reportType === 'ventas') {
        totalLunches = reportData.reduce((sum, row) => sum + (row.almuerzosPrincipales || row.cantidadAlmuerzos || 0), 0);
      } else if (reportType === 'estados' || reportType === 'clientes') {
        totalLunches = reportData.filter(r => r.estado !== 'Cancelado').length;
      }

      const contenido = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Reporte ${safeTitle} - ECencia Andina</title>
            <style>
              @page { size: A4; margin: 15mm; }
              body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; margin: 0; padding: 0; color: #2F4D49; background: #fff; line-height: 1.4; }
              .header-banner { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #7A402E; padding-bottom: 12px; margin-bottom: 20px; }
              .company-brand { text-align: left; }
              .company-title { font-size: 22px; font-weight: 800; color: #7A402E; margin: 0; letter-spacing: -0.5px; }
              .company-subtitle { font-size: 11px; color: #61603C; margin: 2px 0 0 0; text-transform: uppercase; font-weight: 600; }
              .company-details { font-size: 10px; color: #666; margin-top: 4px; }
              .doc-badge { text-align: right; background: #fcf8f5; border: 1px solid #e8d7cd; padding: 10px 14px; border-radius: 8px; }
              .doc-type { font-size: 13px; font-weight: bold; color: #7A402E; margin: 0; text-transform: uppercase; }
              .doc-period { font-size: 10px; color: #555; margin: 4px 0 0 0; }
              
              .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; }
              .info-card { background: #faf8f5; border: 1px solid #e8dfd8; border-radius: 6px; padding: 12px; font-size: 11px; }
              .info-card-title { font-size: 10px; font-weight: bold; color: #7A402E; text-transform: uppercase; border-bottom: 1px solid #e8dfd8; padding-bottom: 4px; margin-bottom: 8px; }
              .info-row { display: flex; justify-content: space-between; margin-bottom: 4px; }
              .info-label { color: #666; font-weight: 500; }
              .info-val { font-weight: 700; color: #222; text-align: right; }
              
              .kpi-banner { display: flex; justify-content: space-around; background: #7A402E; color: white; border-radius: 6px; padding: 12px; margin-bottom: 20px; text-align: center; }
              .kpi-item { flex: 1; }
              .kpi-item:not(:last-child) { border-right: 1px solid rgba(255,255,255,0.2); }
              .kpi-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.9; }
              .kpi-val { font-size: 18px; font-weight: 800; margin-top: 2px; }

              table { width: 100%; border-collapse: collapse; margin-bottom: 25px; font-size: 11px; }
              th, td { word-wrap: break-word; }
              
              .totals-table { width: 45%; margin-left: auto; border: 1px solid #7A402E; border-radius: 6px; overflow: hidden; margin-bottom: 30px; }
              .totals-row { display: flex; justify-content: space-between; padding: 8px 12px; font-size: 11px; background: #fffaf5; }
              .totals-row:not(:last-child) { border-bottom: 1px solid #e8dfd8; }
              .totals-row.grand-total { background: #7A402E; color: white; font-weight: bold; font-size: 13px; }

              .signatures-block { margin-top: 50px; display: flex; justify-content: space-between; page-break-inside: avoid; }
              .signature-box { width: 42%; text-align: center; border-top: 1px solid #7A402E; padding-top: 8px; }
              .signature-title { font-weight: bold; font-size: 11px; color: #333; margin: 0; }
              .signature-sub { font-size: 10px; color: #777; margin: 2px 0 0 0; }

              .footer { margin-top: 30px; border-top: 1px solid #eee; padding-top: 10px; text-align: center; font-size: 9px; color: #888; }
            </style>
          </head>
          <body>
            <div class="header-banner">
              <div class="company-brand">
                <h1 class="company-title">ECENCIA ANDINA</h1>
                <p class="company-subtitle">Servicios de Alimentación y Catering Empresarial</p>
                <div class="company-details">
                  RUC: 1792345678001 | Quito - Ecuador | Tel: +593 2 2999 000<br/>
                  Email: facturacion@ecenciaandina.com
                </div>
              </div>
              <div class="doc-badge">
                <p class="doc-type">${safeTitle}</p>
                <p class="doc-period">Período: ${safeFechaInicio} al ${safeFechaFin}</p>
              </div>
            </div>

            <div class="info-grid">
              <div class="info-card">
                <div class="info-card-title">1. Datos del Emisor</div>
                <div class="info-row"><span class="info-label">Razón Social:</span><span class="info-val">ECENCIA ANDINA S.A.</span></div>
                <div class="info-row"><span class="info-label">RUC:</span><span class="info-val">1792345678001</span></div>
                <div class="info-row"><span class="info-label">Matriz:</span><span class="info-val">Quito, Ecuador</span></div>
                <div class="info-row"><span class="info-label">Obligado a Contabilidad:</span><span class="info-val">SÍ</span></div>
              </div>
              <div class="info-card">
                <div class="info-card-title">2. Datos del Destinatario / Convenio</div>
                <div class="info-row"><span class="info-label">Empresa / Cliente:</span><span class="info-val">${escapeHtml(targetEmpresa)}</span></div>
                <div class="info-row"><span class="info-label">RUC / Cédula:</span><span class="info-val">${escapeHtml(targetRuc)}</span></div>
                <div class="info-row"><span class="info-label">Representante:</span><span class="info-val">${escapeHtml(targetRepresentante)}</span></div>
                <div class="info-row"><span class="info-label">Contacto:</span><span class="info-val">${escapeHtml(targetContacto)}</span></div>
              </div>
            </div>

            <div class="kpi-banner">
              <div class="kpi-item">
                <div class="kpi-label">Período Analizado</div>
                <div class="kpi-val" style="font-size: 14px; margin-top: 4px;">${safeFechaInicio} - ${safeFechaFin}</div>
              </div>
              <div class="kpi-item">
                <div class="kpi-label">Total Almuerzos / Ítems</div>
                <div class="kpi-val">${totalLunches}</div>
              </div>
              <div class="kpi-item">
                <div class="kpi-label">Monto Total Consolidado</div>
                <div class="kpi-val">$${totalAmount.toFixed(2)}</div>
              </div>
            </div>

            <table>
              ${htmlRows}
            </table>

            <div class="totals-table">
              <div class="totals-row">
                <span>Subtotal Consumos:</span>
                <span>$${totalAmount.toFixed(2)}</span>
              </div>
              <div class="totals-row">
                <span>IVA (0% Alimentación):</span>
                <span>$0.00</span>
              </div>
              <div class="totals-row grand-total">
                <span>GRAN TOTAL A FACTURAR:</span>
                <span>$${totalAmount.toFixed(2)}</span>
              </div>
            </div>

            ${reportType === 'convenio' ? `
            <div class="signatures-block">
              <div class="signature-box">
                <p class="signature-title">ECENCIA ANDINA RESTAURANTE</p>
                <p class="signature-sub">Firma Autorizada y Sello</p>
              </div>
              <div class="signature-box">
                <p class="signature-title">${escapeHtml(targetEmpresa)}</p>
                <p class="signature-sub">Recibido Conforme / Firma y Sello Empresa</p>
              </div>
            </div>
            ` : ''}

            <div class="footer">
              Este documento es un informe de consolidación operativa generado por el Sistema ECencia Andina v1.0 el ${escapeHtml(new Date().toLocaleString('es-EC'))}.
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
      const selectedConvenioObj = convenios.find(c => String(c.id) === String(idConvenio) || String(c.id_convenio) === String(idConvenio));
      const selectedClientObj = clientes.find(c => String(c.id) === String(idCliente) || String(c.id_cliente) === String(idCliente));

      const receptorRuc = selectedConvenioObj?.ruc || selectedClientObj?.cedula || '1792345678001';
      const receptorNombre = selectedConvenioObj?.nombre_empresa || (selectedClientObj ? `${selectedClientObj.nombre} ${selectedClientObj.apellido}` : 'CLIENTE GENERAL');
      const receptorEmail = selectedConvenioObj?.email || 'convenio@empresa.com';
      const receptorTelefono = selectedConvenioObj?.telefono || '+593 99 000 0000';

      const totalCalculado = calculateTotal();
      const subtotal0 = totalCalculado;
      const subtotal15 = 0.00;
      const montoIva = 0.00;

      let xmlContent = '<?xml version="1.0" encoding="UTF-8"?>\n';
      xmlContent += `<reporteConsolidado version="2.1.0" xmlns="http://ecenciaandina.com/schema/reportes" tipo="${reportType}">\n`;
      
      // Bloque Emisor
      xmlContent += `  <emisor>\n`;
      xmlContent += `    <razonSocial>ECENCIA ANDINA - SERVICIOS DE ALIMENTACION</razonSocial>\n`;
      xmlContent += `    <nombreComercial>ECencia Andina</nombreComercial>\n`;
      xmlContent += `    <ruc>1792345678001</ruc>\n`;
      xmlContent += `    <direccionMatriz>Av. Universitaria s/n y Queri, Quito, Ecuador</direccionMatriz>\n`;
      xmlContent += `    <telefono>+593 2 2999 000</telefono>\n`;
      xmlContent += `    <email>facturacion@ecenciaandina.com</email>\n`;
      xmlContent += `    <obligadoContabilidad>SI</obligadoContabilidad>\n`;
      xmlContent += `    <contribuyenteEspecial>NO</contribuyenteEspecial>\n`;
      xmlContent += `  </emisor>\n`;

      // Bloque Receptor / Convenio
      xmlContent += `  <receptor>\n`;
      xmlContent += `    <razonSocial>${escapeHtml(receptorNombre)}</razonSocial>\n`;
      xmlContent += `    <identificacion>${receptorRuc}</identificacion>\n`;
      xmlContent += `    <tipoIdentificacion>${receptorRuc.length === 13 ? 'RUC' : 'CEDULA'}</tipoIdentificacion>\n`;
      xmlContent += `    <email>${receptorEmail}</email>\n`;
      xmlContent += `    <telefono>${receptorTelefono}</telefono>\n`;
      if (selectedConvenioObj?.representante) {
        xmlContent += `    <representanteLegal>${escapeHtml(selectedConvenioObj.representante)}</representanteLegal>\n`;
      }
      xmlContent += `  </receptor>\n`;

      // Bloque Auditoria
      xmlContent += `  <metadatosAuditoria>\n`;
      xmlContent += `    <periodoInicio>${fechaInicio}</periodoInicio>\n`;
      xmlContent += `    <periodoFin>${fechaFin}</periodoFin>\n`;
      xmlContent += `    <fechaGeneracion>${new Date().toISOString()}</fechaGeneracion>\n`;
      xmlContent += `    <generadoPor>Sistema ECencia Andina v1.0</generadoPor>\n`;
      xmlContent += `    <ambiente>PRODUCCION</ambiente>\n`;
      const randomBuffer = new Uint8Array(6);
      window.crypto.getRandomValues(randomBuffer);
      const hashIntegridad = Array.from(randomBuffer, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();

      xmlContent += `    <hashIntegridad>${hashIntegridad}</hashIntegridad>\n`;
      xmlContent += `  </metadatosAuditoria>\n`;

      // Bloque Datos / Detalles
      xmlContent += `  <detallesConsumo>\n`;

      if (reportType === 'ventas') {
        reportData.forEach((row, idx) => {
          xmlContent += `    <registro index="${idx + 1}">\n`;
          xmlContent += `      <metodoPago>${row.metodo_pago}</metodoPago>\n`;
          xmlContent += `      <almuerzosPrincipales>${toFiniteNumber(row.almuerzosPrincipales ?? row.cantidadAlmuerzos)}</almuerzosPrincipales>\n`;
          SALES_LUNCH_COLUMNS.forEach((column) => {
            xmlContent += `      <${column.xmlTag}>${toFiniteNumber(row[column.key])}</${column.xmlTag}>\n`;
          });
          xmlContent += `      <extrasCantidad>${toFiniteNumber(row.extrasCantidad)}</extrasCantidad>\n`;
          xmlContent += `      <valorExtras>${formatMoney(row.valorExtras)}</valorExtras>\n`;
          xmlContent += `      <totalConsumo>${row.totalConsumo.toFixed(2)}</totalConsumo>\n`;
          xmlContent += `    </registro>\n`;
        });
      } else if (reportType === 'estados' || reportType === 'clientes') {
        reportData.forEach((row, idx) => {
          xmlContent += `    <orden index="${idx + 1}">\n`;
          xmlContent += `      <idOrden>${row.id}</idOrden>\n`;
          xmlContent += `      <fecha>${row.fecha}</fecha>\n`;
          if (reportType === 'estados') {
            xmlContent += `      <cliente>${escapeHtml(row.cliente)}</cliente>\n`;
          } else {
            xmlContent += `      <convenio>${escapeHtml(row.convenio || 'N/A')}</convenio>\n`;
          }
          xmlContent += `      <estado>${row.estado}</estado>\n`;
          xmlContent += `      <descripcion>${escapeHtml(row.descripcion)}</descripcion>\n`;
          xmlContent += `      <totalConsumo>${row.totalConsumo.toFixed(2)}</totalConsumo>\n`;
          xmlContent += `    </orden>\n`;
        });
      } else if (reportType === 'productos') {
        reportData.forEach((row, idx) => {
          xmlContent += `    <producto index="${idx + 1}">\n`;
          xmlContent += `      <nombre>${escapeHtml(row.nombre)}</nombre>\n`;
          xmlContent += `      <categoria>${escapeHtml(row.categoria)}</categoria>\n`;
          xmlContent += `      <cantidadVendida>${row.cantidadVendida}</cantidadVendida>\n`;
          xmlContent += `      <ingresosGenerados>${row.ingresosGenerados.toFixed(2)}</ingresosGenerados>\n`;
          xmlContent += `    </producto>\n`;
        });
      } else if (reportType === 'convenio') {
        if (!desglosarConvenio) {
          reportData.forEach((emp: ColaboradorConsumo, idx: number) => {
            const totalAlmuerzos = (emp.consumos || []).reduce((sum: number, c: Consumo) => sum + c.cantidad, 0);
            xmlContent += `    <colaborador index="${idx + 1}">\n`;
            xmlContent += `      <nombre>${escapeHtml(emp.empleado)}</nombre>\n`;
            xmlContent += `      <cedula>${emp.cedula}</cedula>\n`;
            xmlContent += `      <cantidadAlmuerzos>${totalAlmuerzos}</cantidadAlmuerzos>\n`;
            xmlContent += `      <costoTotal>${emp.total.toFixed(2)}</costoTotal>\n`;
            xmlContent += `    </colaborador>\n`;
          });
        } else {
          reportData.forEach((emp: ColaboradorConsumo, idx: number) => {
            (emp.consumos || []).forEach((c: Consumo, cIdx: number) => {
              xmlContent += `    <itemConsumo id="${idx + 1}-${cIdx + 1}">\n`;
              xmlContent += `      <colaborador>${escapeHtml(emp.empleado)}</colaborador>\n`;
              xmlContent += `      <cedula>${emp.cedula}</cedula>\n`;
              xmlContent += `      <fecha>${c.fecha}</fecha>\n`;
              xmlContent += `      <producto>${escapeHtml(c.producto)}</producto>\n`;
              xmlContent += `      <cantidad>${c.cantidad}</cantidad>\n`;
              xmlContent += `      <valorUnitario>${(c.valor / (c.cantidad || 1)).toFixed(2)}</valorUnitario>\n`;
              xmlContent += `      <costoTotal>${c.valor.toFixed(2)}</costoTotal>\n`;
              xmlContent += `    </itemConsumo>\n`;
            });
          });
        }
      }

      xmlContent += `  </detallesConsumo>\n`;

      // Bloque Resumen Financiero
      xmlContent += `  <resumenFinanciero>\n`;
      xmlContent += `    <subtotalTarifa0>${subtotal0.toFixed(2)}</subtotalTarifa0>\n`;
      xmlContent += `    <subtotalTarifa15>${subtotal15.toFixed(2)}</subtotalTarifa15>\n`;
      xmlContent += `    <montoIva15>${montoIva.toFixed(2)}</montoIva15>\n`;
      xmlContent += `    <totalDescuentos>0.00</totalDescuentos>\n`;
      xmlContent += `    <montoTotalBruto>${totalCalculado.toFixed(2)}</montoTotalBruto>\n`;
      xmlContent += `    <montoTotalNeto>${totalCalculado.toFixed(2)}</montoTotalNeto>\n`;
      xmlContent += `  </resumenFinanciero>\n`;
      xmlContent += `</reporteConsolidado>\n`;

      const blob = new Blob([xmlContent], { type: 'application/xml;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `reporte_${reportType}_${fechaInicio}_al_${fechaFin}.xml`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Archivo XML estructurado descargado exitosamente');
    } catch (err) {
      console.error('Error exportando el reporte a XML:', err);
      toast.error('Error al exportar reporte a XML');
    }
  };

  const handleExportCSV = () => {
    try {
      const csvContent = '\uFEFF'; // UTF-8 BOM para compatibilidad con Excel
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
          new Date(row.fecha).toLocaleString('es-EC'),
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
                new Date(c.fecha).toLocaleString('es-EC'),
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

  const handleExportContifico = () => {
    try {
      if (!reportData || reportData.length === 0) {
        toast.error('No hay datos para exportar en el reporte actual.');
        return;
      }

      const headers = [
        'Tipo de Registro',
        'Tipo de Documento',
        'Número de Documento',
        'Identificación del Cliente',
        'Razón Social / Cliente',
        'Fecha de Emisión',
        'Fecha de Vencimiento',
        'Código Producto / Servicio',
        'Descripción',
        'Cantidad',
        'Precio Unitario',
        'Porcentaje Descuento',
        'Porcentaje IVA',
        'Estado'
      ];

      const formatDate = (dateStr: string) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
      };

      const rows: (string | number)[][] = [];

      if (reportType === 'convenio') {
        // Validar si es un convenio especifico o varios
        const selectedConv = convenios.find(c => String(c.id) === String(idConvenio) || String(c.id_convenio) === String(idConvenio));

        if (idConvenio !== 'all' && selectedConv) {
          if (!selectedConv.ruc || !selectedConv.nombre_empresa) {
            toast.error(`No se puede exportar a Contífico: La empresa "${selectedConv.nombre_empresa || 'seleccionada'}" no tiene registrado su RUC o Razón Social.`);
            return;
          }
        }

        let secCounter = 1;
        const companySecMap = new Map<string, string>();

        const getSecuencialForCompany = (compRuc: string) => {
          if (!companySecMap.has(compRuc)) {
            companySecMap.set(compRuc, `001-001-${String(secCounter++).padStart(9, '0')}`);
          }
          return companySecMap.get(compRuc)!;
        };

        if (!desglosarConvenio) {
          for (const emp of (reportData as ColaboradorConsumo[])) {
            const convObj = selectedConv || convenios.find(c => (c.nombre_empresa && emp.empleado && c.nombre_empresa.toLowerCase().includes(emp.empleado.toLowerCase()))) || convenios[0];
            const targetRuc = convObj?.ruc || emp.cedula;
            const targetNombre = convObj?.nombre_empresa || emp.empleado;

            if (!targetRuc || !targetNombre) {
              toast.error(`No se puede exportar a Contífico: Faltan datos tributarios obligatorios (RUC o Razón Social) para ${emp.empleado}.`);
              return;
            }

            const totalAlmuerzos = (emp.consumos || []).reduce((sum: number, c: Consumo) => sum + c.cantidad, 0);
            const qty = totalAlmuerzos || 1;
            const precioUnit = Number((emp.total / qty).toFixed(2));
            const secuencial = getSecuencialForCompany(targetRuc);
            const fechaEmis = formatDate(fechaFin || new Date().toISOString());

            rows.push([
              'CLI',
              'FAC',
              secuencial,
              targetRuc,
              targetNombre,
              fechaEmis,
              fechaEmis,
              'ALM-CONV',
              `Consumo Almuerzos - Colaborador: ${emp.empleado} (CI: ${emp.cedula || 'N/A'})`,
              qty,
              precioUnit,
              0,
              0,
              'P'
            ]);
          }
        } else {
          for (const emp of (reportData as ColaboradorConsumo[])) {
            const convObj = selectedConv || convenios.find(c => (c.nombre_empresa && emp.empleado && c.nombre_empresa.toLowerCase().includes(emp.empleado.toLowerCase()))) || convenios[0];
            const targetRuc = convObj?.ruc || emp.cedula;
            const targetNombre = convObj?.nombre_empresa || emp.empleado;

            if (!targetRuc || !targetNombre) {
              toast.error(`No se puede exportar a Contífico: Faltan datos tributarios obligatorios (RUC o Razón Social) para ${emp.empleado}.`);
              return;
            }

            const secuencial = getSecuencialForCompany(targetRuc);

            for (const c of (emp.consumos || [])) {
              const qty = c.cantidad || 1;
              const precioUnit = Number((c.valor / qty).toFixed(2));
              const fechaEmis = formatDate(c.fecha || fechaFin);

              rows.push([
                'CLI',
                'FAC',
                secuencial,
                targetRuc,
                targetNombre,
                fechaEmis,
                fechaEmis,
                'ALM-CONV',
                `Consumo ${c.producto} - Colaborador: ${emp.empleado} (CI: ${emp.cedula || 'N/A'})`,
                qty,
                precioUnit,
                0,
                0,
                'P'
              ]);
            }
          }
        }
      } else {
        let secCounter = 1;
        const targetRuc = selectedConvenioObj?.ruc || selectedClientObj?.cedula;
        const targetNombre = selectedConvenioObj?.nombre_empresa || (selectedClientObj ? `${selectedClientObj.nombre} ${selectedClientObj.apellido}` : undefined);

        for (const row of reportData) {
          const clienteNombre = row.cliente || row.convenio || row.empleado || row.nombre || targetNombre;
          const clienteIdent = row.cedula || targetRuc;

          if (!clienteNombre || !clienteIdent) {
            toast.error('No se puede exportar a Contífico: Se encontraron registros sin identificación o Razón Social de cliente.');
            return;
          }

          const secuencial = `001-001-${String(secCounter++).padStart(9, '0')}`;
          const fechaEmis = formatDate(row.fecha || fechaFin || new Date().toISOString());
          const totalVal = row.totalConsumo ?? row.ingresosGenerados ?? row.valorExtras ?? 0;
          const qty = row.cantidadVendida || row.almuerzosPrincipales || 1;
          const precioUnit = Number((totalVal / qty).toFixed(2));

          rows.push([
            'CLI',
            'FAC',
            secuencial,
            clienteIdent,
            clienteNombre,
            fechaEmis,
            fechaEmis,
            'ALM-CONV',
            `Consumo ${reportType} - ${clienteNombre}`,
            qty,
            precioUnit,
            0,
            0,
            'P'
          ]);
        }
      }

      if (rows.length === 0) {
        toast.error('No se encontraron registros válidos para exportar.');
        return;
      }

      // Crear libro de trabajo Excel nativo (.xlsx) con hoja 'Documentos'
      const worksheetData = [headers, ...rows];
      const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Documentos');

      // Exportar en formato binario .xlsx nativo
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `importacion_contifico_${fechaInicio}_al_${fechaFin}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Archivo Excel nativo (.xlsx) para Siigo Contífico generado exitosamente');
    } catch (err) {
      console.error('Error generando plantilla para Contífico:', err);
      toast.error('Error al generar plantilla Excel nativa para Contífico');
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
              {reportType === 'convenio' && (
                <Button onClick={handleExportContifico} variant="outline" className="gap-2 border-emerald-600/30 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30 h-9 text-xs font-semibold">
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Exportar a Contífico
                </Button>
              )}
            </div>
          </CardHeader>
          
          <CardContent className="pt-6">
            
            {reportData.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground bg-muted/10 border-2 border-dashed rounded-xl">
                <PieChart className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p>No se encontraron datos para los parámetros seleccionados.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {reportType === 'estados' && (
                  <div className="p-4 rounded-xl border border-red-200 bg-red-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-sm">
                    <div>
                      <h3 className="font-bold text-red-800 flex items-center gap-2">
                        <PieChart className="h-5 w-5" />
                        Resumen de Mermas (Pedidos Cancelados)
                      </h3>
                      <p className="text-sm text-red-600">Total de pedidos y valor económico de platos que fueron cancelados y no se consumieron.</p>
                    </div>
                    <div className="flex gap-6 text-right">
                      <div>
                        <p className="text-xs font-semibold text-red-700 uppercase">Cantidad</p>
                        <p className="text-2xl font-black text-red-900">
                          {reportData.filter(r => r.estado === 'Cancelado').length}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-red-700 uppercase">Pérdida Estimada</p>
                        <p className="text-2xl font-black text-red-900">
                          ${reportData.filter(r => r.estado === 'Cancelado').reduce((sum, r) => sum + (r.totalConsumo || 0), 0).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
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
            </div>
            )}
            
          </CardContent>
        </Card>
      )}
    </div>
  );
}
