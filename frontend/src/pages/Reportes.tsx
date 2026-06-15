import { useState } from 'react';
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Building2,
  Calendar,
  FileDown,
  FileText,
  Filter,
  PieChart,
  TrendingUp,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { openPrintWindow, toFiniteNumber } from '@/lib/html';
import {
  buildReportCsv,
  buildReportPrintHtml,
  buildReportXml,
  calculateReportTotal,
  downloadTextFile,
  getCurrentMonthRange,
  getReportColumnCount,
  isInvalidDateRange,
} from '@/lib/reporting';
import { useClientsAndConvenios } from '@/hooks/useClientsAndConvenios';
import {
  AgreementReportRow,
  OrderReportRow,
  ProductReportRow,
  ReportData,
  ReportType,
  SalesReportRow,
} from '@/types/reporting';

const REPORT_TITLES: Record<ReportType, string> = {
  ventas: 'Resumen general de ingresos',
  estados: 'Pedidos por estado',
  productos: 'Popularidad de productos',
  convenio: 'Consolidado por convenio',
  clientes: 'Consumos por cliente',
};

const money = (value: unknown) =>
  toFiniteNumber(value).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Reportes() {
  const initialRange = getCurrentMonthRange();
  const [reportType, setReportType] = useState<ReportType>('ventas');
  const [startDate, setStartDate] = useState(initialRange.start);
  const [endDate, setEndDate] = useState(initialRange.end);
  const [stateId, setStateId] = useState('all');
  const [clientId, setClientId] = useState('all');
  const [agreementId, setAgreementId] = useState('all');
  const [detailedAgreement, setDetailedAgreement] = useState(false);
  const [reportData, setReportData] = useState<ReportData>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  const { clientes, convenios, isLoading: catalogsLoading } = useClientsAndConvenios();

  const invalidRange = isInvalidDateRange(startDate, endDate);
  const total = calculateReportTotal(reportType, reportData, stateId);
  const columnCount = getReportColumnCount(reportType, detailedAgreement);

  const changeReportType = (value: string) => {
    setReportType(value as ReportType);
    setReportData([]);
    setHasGenerated(false);
  };

  const generateReport = async () => {
    if (!startDate || !endDate) {
      toast.error('Las fechas de inicio y fin son obligatorias.');
      return;
    }
    if (invalidRange) {
      toast.error('La fecha final no puede ser anterior a la fecha inicial.');
      return;
    }
    if (reportType === 'clientes' && clientId === 'all') {
      toast.error('Seleccione un cliente.');
      return;
    }
    if (reportType === 'convenio' && agreementId === 'all') {
      toast.error('Seleccione un convenio.');
      return;
    }

    setIsGenerating(true);
    setHasGenerated(false);
    try {
      const query = new URLSearchParams({ fecha_inicio: startDate, fecha_fin: endDate });
      if (reportType === 'estados') query.set('id_estado', stateId);
      if (reportType === 'clientes') query.set('id_cliente', clientId);
      const endpoint =
        reportType === 'convenio'
          ? `/convenios/${agreementId}/reporte?${query}`
          : `/reportes/${reportType}?${query}`;
      const response = await apiFetch(endpoint);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo generar el reporte');
      setReportData(data as ReportData);
      setHasGenerated(true);
      toast.success('Reporte generado exitosamente');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error de conexion al generar el reporte');
    } finally {
      setIsGenerating(false);
    }
  };

  const getPrintRows = (): { headers: string[]; rows: unknown[][] } => {
    if (reportType === 'ventas') {
      return {
        headers: ['Metodo de pago', 'Cantidad de almuerzos', 'Ingresos'],
        rows: (reportData as SalesReportRow[]).map((row) => [
          row.metodo_pago,
          row.cantidadAlmuerzos,
          `$${money(row.totalConsumo)}`,
        ]),
      };
    }
    if (reportType === 'productos') {
      return {
        headers: ['Producto', 'Categoria', 'Cantidad vendida', 'Ingresos'],
        rows: (reportData as ProductReportRow[]).map((row) => [
          row.nombre,
          row.categoria,
          row.cantidadVendida,
          `$${money(row.ingresosGenerados)}`,
        ]),
      };
    }
    if (reportType === 'convenio') {
      if (detailedAgreement) {
        return {
          headers: ['Colaborador', 'Fecha', 'Producto', 'Cantidad', 'Costo'],
          rows: (reportData as AgreementReportRow[]).flatMap((employee) =>
            employee.consumos.map((consumption) => [
              employee.empleado,
              new Date(consumption.fecha).toLocaleString('es-EC'),
              consumption.producto,
              consumption.cantidad,
              `$${money(consumption.valor)}`,
            ]),
          ),
        };
      }
      return {
        headers: ['Colaborador', 'Cedula', 'Almuerzos consumidos', 'Costo total'],
        rows: (reportData as AgreementReportRow[]).map((employee) => [
          employee.empleado,
          employee.cedula,
          employee.consumos.reduce((sum, item) => sum + toFiniteNumber(item.cantidad), 0),
          `$${money(employee.total)}`,
        ]),
      };
    }
    return {
      headers: [
        'Fecha',
        reportType === 'estados' ? 'Cliente' : 'Convenio',
        'Estado',
        'Descripcion',
        'Costo',
      ],
      rows: (reportData as OrderReportRow[]).map((row) => [
        new Date(row.fecha).toLocaleString('es-EC'),
        reportType === 'estados' ? row.cliente : row.convenio || 'N/A',
        row.estado,
        row.descripcion,
        `$${money(row.totalConsumo)}`,
      ]),
    };
  };

  const exportPdf = () => {
    const printWindow = openPrintWindow();
    if (!printWindow) {
      toast.error('El navegador bloqueo la ventana emergente');
      return;
    }
    const printable = getPrintRows();
    printWindow.document.write(
      buildReportPrintHtml({
        title: REPORT_TITLES[reportType],
        startDate,
        endDate,
        headers: printable.headers,
        rows: printable.rows,
        totalLabel: reportType === 'estados' && stateId === '3' ? 'Total cancelado' : 'Total neto',
        total,
      }),
    );
    printWindow.document.close();
    window.setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 300);
  };

  const exportXml = () => {
    const content = buildReportXml({
      reportType,
      data: reportData,
      startDate,
      endDate,
      detailedAgreement,
      stateFilter: stateId,
    });
    downloadTextFile(content, 'application/xml;charset=utf-8', `reporte_${reportType}_${startDate}_${endDate}.xml`);
  };

  const exportCsv = () => {
    const content = buildReportCsv({
      reportType,
      data: reportData,
      detailedAgreement,
      stateFilter: stateId,
    });
    downloadTextFile(content, 'text/csv;charset=utf-8', `facturacion_${reportType}_${startDate}_${endDate}.csv`);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="bg-gradient-to-r from-cafe to-terracota bg-clip-text text-4xl font-extrabold tracking-tight text-transparent">
          Reportes y Estadisticas
        </h1>
        <p className="text-lg text-muted-foreground">Analisis operativo, consolidacion y exportacion.</p>
      </div>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-cafe" />
            Configuracion del reporte
          </CardTitle>
          <CardDescription>Seleccione el informe y el periodo que desea analizar.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid items-end gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <FileText className="h-4 w-4" /> Tipo de reporte
              </Label>
              <Select value={reportType} onValueChange={changeReportType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ventas"><span className="flex items-center gap-2"><TrendingUp className="h-4 w-4" />Ingresos generales</span></SelectItem>
                  <SelectItem value="estados"><span className="flex items-center gap-2"><PieChart className="h-4 w-4" />Pedidos por estado</span></SelectItem>
                  <SelectItem value="productos"><span className="flex items-center gap-2"><FileText className="h-4 w-4" />Popularidad de productos</span></SelectItem>
                  <SelectItem value="convenio"><span className="flex items-center gap-2"><Building2 className="h-4 w-4" />Consolidado por convenio</span></SelectItem>
                  <SelectItem value="clientes"><span className="flex items-center gap-2"><Users className="h-4 w-4" />Consumos por cliente</span></SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Calendar className="h-4 w-4" />Desde</Label>
              <Input
                type="date"
                className={invalidRange ? 'border-destructive' : ''}
                value={startDate}
                onChange={(event) => { setStartDate(event.target.value); setHasGenerated(false); }}
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Calendar className="h-4 w-4" />Hasta</Label>
              <Input
                type="date"
                className={invalidRange ? 'border-destructive' : ''}
                value={endDate}
                onChange={(event) => { setEndDate(event.target.value); setHasGenerated(false); }}
              />
            </div>

            {reportType === 'estados' && (
              <div className="space-y-2">
                <Label>Estado</Label>
                <Select value={stateId} onValueChange={setStateId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="1">Reservado</SelectItem>
                    <SelectItem value="2">Consumido</SelectItem>
                    <SelectItem value="3">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {reportType === 'clientes' && (
              <div className="space-y-2">
                <Label>Cliente</Label>
                <Select value={clientId} onValueChange={setClientId} disabled={catalogsLoading}>
                  <SelectTrigger><SelectValue placeholder="Seleccione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Seleccione un cliente</SelectItem>
                    {clientes.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.nombre} {client.apellido} ({client.cedula})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {reportType === 'convenio' && (
              <div className="space-y-2">
                <Label>Convenio</Label>
                <Select value={agreementId} onValueChange={setAgreementId} disabled={catalogsLoading}>
                  <SelectTrigger><SelectValue placeholder="Seleccione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Seleccione un convenio</SelectItem>
                    {convenios.filter((agreement) => agreement.activo).map((agreement) => (
                      <SelectItem key={agreement.id} value={agreement.id}>{agreement.nombre_empresa}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {!['estados', 'clientes', 'convenio'].includes(reportType) && <div className="hidden md:block" />}
          </div>

          {invalidRange && <p className="text-xs font-semibold text-destructive">La fecha final no puede ser anterior a la inicial.</p>}

          <div className="flex flex-col gap-4 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {reportType === 'convenio' && (
                <div className="flex items-center gap-2">
                  <Switch id="agreement-detail" checked={detailedAgreement} onCheckedChange={setDetailedAgreement} />
                  <Label htmlFor="agreement-detail" className="cursor-pointer text-xs">
                    Desglosar consumos individuales
                  </Label>
                </div>
              )}
            </div>
            <Button
              onClick={generateReport}
              disabled={isGenerating || invalidRange}
              className="bg-cafe px-8 hover:bg-cafe/90"
            >
              {isGenerating ? 'Calculando...' : 'Generar reporte'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {hasGenerated && (
        <Card className="animate-in fade-in slide-in-from-bottom-4">
          <CardHeader className="flex flex-col gap-4 border-b bg-muted/20 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>{REPORT_TITLES[reportType]}</CardTitle>
              <CardDescription>Periodo: {startDate} al {endDate}</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={exportPdf} disabled={!reportData.length} className="gap-2 bg-slate-800 text-white hover:bg-slate-700">
                <FileDown className="h-4 w-4" /> PDF
              </Button>
              <Button size="sm" variant="outline" onClick={exportXml} disabled={!reportData.length} className="gap-2">
                <FileDown className="h-4 w-4" /> XML
              </Button>
              <Button size="sm" variant="outline" onClick={exportCsv} disabled={!reportData.length} className="gap-2">
                <FileDown className="h-4 w-4" /> CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            {!reportData.length ? (
              <div className="rounded-xl border-2 border-dashed py-12 text-center text-muted-foreground">
                <PieChart className="mx-auto mb-3 h-12 w-12 opacity-20" />
                No se encontraron datos para el periodo seleccionado.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-secondary/20">
                      {reportType === 'ventas' && <>
                        <TableHead>Metodo de pago</TableHead><TableHead className="text-center">Almuerzos</TableHead><TableHead className="text-right">Ingresos</TableHead>
                      </>}
                      {(reportType === 'estados' || reportType === 'clientes') && <>
                        <TableHead>Fecha</TableHead><TableHead>{reportType === 'estados' ? 'Cliente' : 'Convenio'}</TableHead><TableHead>Estado</TableHead><TableHead>Descripcion</TableHead><TableHead className="text-right">Costo</TableHead>
                      </>}
                      {reportType === 'productos' && <>
                        <TableHead>Producto</TableHead><TableHead>Categoria</TableHead><TableHead className="text-center">Cantidad</TableHead><TableHead className="text-right">Ingresos</TableHead>
                      </>}
                      {reportType === 'convenio' && (
                        detailedAgreement
                          ? <><TableHead>Colaborador</TableHead><TableHead>Fecha</TableHead><TableHead>Producto</TableHead><TableHead className="text-center">Cantidad</TableHead><TableHead className="text-right">Costo</TableHead></>
                          : <><TableHead>Colaborador</TableHead><TableHead>Cedula</TableHead><TableHead className="text-center">Almuerzos</TableHead><TableHead className="text-right">Costo total</TableHead></>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportType === 'ventas' && (reportData as SalesReportRow[]).map((row) => (
                      <TableRow key={row.metodo_pago}><TableCell className="font-medium">{row.metodo_pago}</TableCell><TableCell className="text-center">{row.cantidadAlmuerzos}</TableCell><TableCell className="text-right font-semibold">${money(row.totalConsumo)}</TableCell></TableRow>
                    ))}
                    {(reportType === 'estados' || reportType === 'clientes') && (reportData as OrderReportRow[]).map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="whitespace-nowrap text-xs">{new Date(row.fecha).toLocaleString('es-EC')}</TableCell>
                        <TableCell className="font-medium">{reportType === 'estados' ? row.cliente : row.convenio || 'N/A'}</TableCell>
                        <TableCell><span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase text-primary">{row.estado}</span></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{row.descripcion}</TableCell>
                        <TableCell className="text-right">${money(row.totalConsumo)}</TableCell>
                      </TableRow>
                    ))}
                    {reportType === 'productos' && (reportData as ProductReportRow[]).map((row) => (
                      <TableRow key={row.nombre}><TableCell className="font-medium">{row.nombre}</TableCell><TableCell>{row.categoria}</TableCell><TableCell className="text-center">{row.cantidadVendida}</TableCell><TableCell className="text-right font-semibold">${money(row.ingresosGenerados)}</TableCell></TableRow>
                    ))}
                    {reportType === 'convenio' && !detailedAgreement && (reportData as AgreementReportRow[]).map((employee) => (
                      <TableRow key={employee.cedula}><TableCell className="font-medium">{employee.empleado}</TableCell><TableCell>{employee.cedula}</TableCell><TableCell className="text-center">{employee.consumos.reduce((sum, item) => sum + toFiniteNumber(item.cantidad), 0)}</TableCell><TableCell className="text-right font-semibold">${money(employee.total)}</TableCell></TableRow>
                    ))}
                    {reportType === 'convenio' && detailedAgreement && (reportData as AgreementReportRow[]).flatMap((employee) =>
                      employee.consumos.map((consumption, index) => (
                        <TableRow key={`${employee.cedula}-${consumption.fecha}-${index}`}>
                          <TableCell className="font-medium">{employee.empleado}</TableCell><TableCell className="whitespace-nowrap text-xs">{new Date(consumption.fecha).toLocaleString('es-EC')}</TableCell><TableCell>{consumption.producto}</TableCell><TableCell className="text-center">{consumption.cantidad}</TableCell><TableCell className="text-right">${money(consumption.valor)}</TableCell>
                        </TableRow>
                      )),
                    )}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={columnCount - 1} className="text-right font-bold">
                        {reportType === 'estados' && stateId === '3' ? 'Total cancelado' : 'Total neto'}
                      </TableCell>
                      <TableCell className="text-right text-base font-black text-cafe">${money(total)}</TableCell>
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
