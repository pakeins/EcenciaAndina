import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
} from '@/components/ui/table';
import { FileDown, Calendar, Filter, FileText, PieChart, Users, Building2, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { Convenio, Client } from '@/types';
import { escapeHtml, formatMoney, openPrintWindow, toFiniteNumber } from '@/lib/html';

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
    if (!fechaInicio || !fechaFin) {
      toast.error('Las fechas Desde y Hasta son obligatorias.');
      return;
    }
    
    if (new Date(fechaFin) < new Date(fechaInicio)) {
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
        let data = await response.json();
        
        // Aplanar datos para convenio según HU Jira
        if (reportType === 'convenio') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data = data.flatMap((emp: any) => 
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (emp.consumos || []).map((c: any) => ({
              cliente: emp.empleado,
              fecha: c.fecha,
              producto: c.producto,
              cantidad: c.cantidad,
              totalConsumo: c.valor
            }))
          );
        }
        
        setReportData(data);
        setHasGenerated(true);
        toast.success('Reporte generado exitosamente');
      } else {
        const err = await response.json();
        toast.error(err.error || 'Error al generar reporte');
      }
    } catch (error) {
      toast.error('Error de conexión al generar reporte');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExportPDF = () => {
    try {
      const printWindow = openPrintWindow();
      if (!printWindow) {
        toast.error('El navegador bloqueó la ventana emergente');
        return;
      }

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
        htmlRows = `
          <tr>
            <th style="padding: 12px 8px; border-bottom: 2px solid #ddd; text-align: left;">Método de Pago</th>
            <th style="padding: 12px 8px; border-bottom: 2px solid #ddd; text-align: center;">Cantidad Almuerzos</th>
            <th style="padding: 12px 8px; border-bottom: 2px solid #ddd; text-align: right;">Ingresos Generados</th>
          </tr>
        `;
        reportData.forEach(row => {
          htmlRows += `
            <tr>
              <td style="padding: 10px 8px; border-bottom: 1px solid #eee;">${escapeHtml(row.metodo_pago)}</td>
              <td style="padding: 10px 8px; border-bottom: 1px solid #eee; text-align: center;">${toFiniteNumber(row.cantidadAlmuerzos)}</td>
              <td style="padding: 10px 8px; border-bottom: 1px solid #eee; text-align: right;">$${formatMoney(row.totalConsumo)}</td>
            </tr>
          `;
        });
      } else if (reportType === 'estados' || reportType === 'clientes') {
        htmlRows = `
          <tr>
            <th style="padding: 12px 8px; border-bottom: 2px solid #ddd; text-align: left;">Fecha</th>
            ${reportType === 'estados' ? '<th style="padding: 12px 8px; border-bottom: 2px solid #ddd; text-align: left;">Cliente</th>' : ''}
            <th style="padding: 12px 8px; border-bottom: 2px solid #ddd; text-align: left;">Estado</th>
            <th style="padding: 12px 8px; border-bottom: 2px solid #ddd; text-align: left;">Descripción</th>
            <th style="padding: 12px 8px; border-bottom: 2px solid #ddd; text-align: right;">Total</th>
          </tr>
        `;
        reportData.forEach(row => {
          htmlRows += `
            <tr>
              <td style="padding: 10px 8px; border-bottom: 1px solid #eee;">${escapeHtml(new Date(row.fecha).toLocaleString())}</td>
              ${reportType === 'estados' ? `<td style="padding: 10px 8px; border-bottom: 1px solid #eee;">${escapeHtml(row.cliente)}</td>` : ''}
              <td style="padding: 10px 8px; border-bottom: 1px solid #eee;">${escapeHtml(row.estado)}</td>
              <td style="padding: 10px 8px; border-bottom: 1px solid #eee;">${escapeHtml(row.descripcion)}</td>
              <td style="padding: 10px 8px; border-bottom: 1px solid #eee; text-align: right;">$${formatMoney(row.totalConsumo)}</td>
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
         htmlRows = `
          <tr>
            <th style="padding: 12px 8px; border-bottom: 2px solid #ddd; text-align: left;">Colaborador</th>
            <th style="padding: 12px 8px; border-bottom: 2px solid #ddd; text-align: left;">Fecha / Hora</th>
            <th style="padding: 12px 8px; border-bottom: 2px solid #ddd; text-align: left;">Tipo de Almuerzo</th>
            <th style="padding: 12px 8px; border-bottom: 2px solid #ddd; text-align: center;">Cantidad</th>
            <th style="padding: 12px 8px; border-bottom: 2px solid #ddd; text-align: right;">Costo Total</th>
          </tr>
        `;
        reportData.forEach(row => {
          htmlRows += `
            <tr>
              <td style="padding: 10px 8px; border-bottom: 1px solid #eee;">${escapeHtml(row.cliente)}</td>
              <td style="padding: 10px 8px; border-bottom: 1px solid #eee;">${escapeHtml(new Date(row.fecha).toLocaleString())}</td>
              <td style="padding: 10px 8px; border-bottom: 1px solid #eee;">${escapeHtml(row.producto)}</td>
              <td style="padding: 10px 8px; border-bottom: 1px solid #eee; text-align: center;">${toFiniteNumber(row.cantidad)}</td>
              <td style="padding: 10px 8px; border-bottom: 1px solid #eee; text-align: right;">$${formatMoney(row.totalConsumo)}</td>
            </tr>
          `;
        });
      }

      const contenido = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Reporte ECencia Andina</title>
            <style>
              body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #333; }
              .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #8B4513; padding-bottom: 20px; }
              .title { font-size: 24px; font-weight: bold; color: #8B4513; margin: 0 0 10px 0; }
              .subtitle { font-size: 14px; color: #666; margin: 0; }
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

      printWindow.document.write(contenido);
      printWindow.document.close();
      
      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
      }, 500);
    } catch (err) {
      toast.error('Error al generar el documento PDF');
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
          <div className="grid gap-6 md:grid-cols-4">
            
            {/* 1. Tipo de Reporte */}
            <div className="space-y-2 md:col-span-1">
              <Label className="flex items-center gap-2">
                <FileText className="h-4 w-4" /> Tipo de Reporte
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

            {/* 2. Filtros Dinámicos */}
            <div className="md:col-span-2 grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><Calendar className="h-4 w-4" /> Desde</Label>
                <Input type="date" value={fechaInicio} onChange={(e) => {setFechaInicio(e.target.value); setHasGenerated(false);}} />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><Calendar className="h-4 w-4" /> Hasta</Label>
                <Input type="date" value={fechaFin} onChange={(e) => {setFechaFin(e.target.value); setHasGenerated(false);}} />
              </div>

              {/* Filtro extra según tipo */}
              {reportType === 'estados' && (
                <div className="space-y-2 col-span-2">
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
                <div className="space-y-2 col-span-2">
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
                <div className="space-y-2 col-span-2">
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
            </div>

            {/* 3. Acción */}
            <div className="flex flex-col justify-end pb-2 md:col-span-1">
              <Button 
                onClick={handleGenerateReport} 
                disabled={isGenerating}
                className="w-full bg-cafe hover:bg-cafe/90 shadow-lg"
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
          <CardHeader className="flex flex-row items-center justify-between bg-muted/20 border-b pb-4">
            <div>
              <CardTitle className="text-foreground text-xl">Resultados del Análisis</CardTitle>
              <CardDescription>Período analizado: {new Date(fechaInicio).toLocaleDateString('es-EC')} al {new Date(fechaFin).toLocaleDateString('es-EC')}</CardDescription>
            </div>
            <Button onClick={handleExportPDF} className="gap-2 bg-slate-800 hover:bg-slate-700 text-white shadow-md">
              <FileDown className="h-4 w-4" /> Exportar PDF
            </Button>
          </CardHeader>
          
          <CardContent className="pt-6">
            
            {reportData.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground bg-muted/10 border-2 border-dashed rounded-xl">
                <PieChart className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p>No se encontraron datos para los parámetros seleccionados.</p>
              </div>
            ) : (
              <div className="rounded-xl border border-border overflow-hidden shadow-sm">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-secondary/20 hover:bg-secondary/20">
                      
                      {reportType === 'ventas' && (
                        <>
                          <TableHead className="text-cafe font-bold">Método de Pago</TableHead>
                          <TableHead className="text-center text-cafe font-bold">Cant. Almuerzos</TableHead>
                          <TableHead className="text-right text-cafe font-bold">Ingresos Generados</TableHead>
                        </>
                      )}
                      
                      {(reportType === 'estados' || reportType === 'clientes') && (
                        <>
                          <TableHead className="text-cafe font-bold">Fecha / Hora</TableHead>
                          {reportType === 'estados' && <TableHead className="text-cafe font-bold">Cliente</TableHead>}
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
                          <TableHead className="text-cafe font-bold">Fecha / Hora</TableHead>
                          <TableHead className="text-cafe font-bold">Tipo de Almuerzo</TableHead>
                          <TableHead className="text-center text-cafe font-bold">Cantidad</TableHead>
                          <TableHead className="text-right text-cafe font-bold">Costo Total</TableHead>
                        </>
                      )}

                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportType === 'ventas' && reportData.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{row.metodo_pago}</TableCell>
                        <TableCell className="text-center">{row.cantidadAlmuerzos}</TableCell>
                        <TableCell className="text-right font-semibold text-green-700">${row.totalConsumo.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}

                    {(reportType === 'estados' || reportType === 'clientes') && reportData.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">{new Date(row.fecha).toLocaleString()}</TableCell>
                        {reportType === 'estados' && <TableCell className="font-medium">{row.cliente}</TableCell>}
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

                    {reportType === 'productos' && reportData.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{row.nombre}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{row.categoria}</TableCell>
                        <TableCell className="text-center">{row.cantidadVendida}</TableCell>
                        <TableCell className="text-right font-semibold text-green-700">${row.ingresosGenerados.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}

                    {reportType === 'convenio' && reportData.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{row.cliente}</TableCell>
                        <TableCell className="text-xs">{new Date(row.fecha).toLocaleString()}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{row.producto}</TableCell>
                        <TableCell className="text-center">{row.cantidad}</TableCell>
                        <TableCell className="text-right font-semibold text-green-700">${row.totalConsumo.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            
          </CardContent>
        </Card>
      )}
    </div>
  );
}
