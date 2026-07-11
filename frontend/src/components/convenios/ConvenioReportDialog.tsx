import { Convenio } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FileDown } from 'lucide-react';

interface ReportConsumo {
  fecha: string;
  producto: string;
  cantidad: number;
  valor: number;
}

interface ReportEmployee {
  empleado: string;
  cedula: string;
  total: number;
  consumos: ReportConsumo[];
}

interface ReportDates {
  desde: string;
  hasta: string;
}

interface ConvenioReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportConvenio: Convenio | null;
  reportDates: ReportDates;
  setReportDates: (dates: ReportDates) => void;
  reportData: ReportEmployee[];
  setReportData: (data: ReportEmployee[]) => void;
  isGeneratingReport: boolean;
  onGenerateReport: () => void;
  onExportReportPDF: () => void;
}

export function ConvenioReportDialog({
  open,
  onOpenChange,
  reportConvenio,
  reportDates,
  setReportDates,
  reportData,
  setReportData,
  isGeneratingReport,
  onGenerateReport,
  onExportReportPDF,
}: ConvenioReportDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reporte de Consumos - {reportConvenio?.nombre_empresa}</DialogTitle>
          <DialogDescription>Generar reporte de consumos por periodo.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-4 items-end mb-4 bg-muted/20 p-4 rounded-lg border">
          <div className="space-y-2">
            <Label>Desde</Label>
            <Input type="date" value={reportDates.desde} onChange={e => setReportDates({ ...reportDates, desde: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Hasta</Label>
            <Input type="date" value={reportDates.hasta} onChange={e => setReportDates({ ...reportDates, hasta: e.target.value })} />
          </div>
          <Button
            onClick={() => {
              setReportData([]);
              onGenerateReport();
            }}
            disabled={isGeneratingReport}
            className="bg-cafe hover:bg-cafe/90"
          >
            {isGeneratingReport ? 'Generando...' : 'Generar Reporte'}
          </Button>
        </div>

        {reportData.length > 0 ? (
          <div className="space-y-6">
            <div className="flex justify-between items-center bg-primary/10 p-4 rounded-xl border border-primary/20">
              <span className="font-bold text-lg text-primary">Total Consumo Mensual</span>
              <div className="flex items-center gap-4">
                <span className="text-2xl font-black text-primary">
                  ${reportData.reduce((acc, curr) => acc + curr.total, 0).toFixed(2)}
                </span>
                <Button
                  onClick={onExportReportPDF}
                  variant="outline"
                  className="gap-2 border-cafe text-cafe hover:bg-cafe/10"
                >
                  <FileDown className="h-4 w-4" /> Exportar / Imprimir
                </Button>
              </div>
            </div>
            <div className="grid gap-4 grid-cols-1">
              {reportData.map((emp: ReportEmployee) => (
                <Card key={emp.cedula} className="border shadow-sm">
                  <CardHeader className="py-3 px-4 bg-muted/20 border-b">
                    <div className="flex justify-between items-center">
                      <div>
                        <CardTitle className="text-sm font-bold text-cafe">{emp.empleado}</CardTitle>
                        <CardDescription className="text-xs">C.I: {emp.cedula}</CardDescription>
                      </div>
                      <Badge variant="secondary" className="font-bold text-sm bg-primary/10 text-primary border-primary/20">
                        ${emp.total.toFixed(2)}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="max-h-40 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-accent/50 sticky top-0">
                          <tr>
                            <th className="text-left py-1.5 px-3 font-semibold">Fecha</th>
                            <th className="text-left py-1.5 px-3 font-semibold">Producto</th>
                            <th className="text-right py-1.5 px-3 font-semibold">Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {emp.consumos.map((cons: ReportConsumo, idx: number) => (
                            <tr key={idx} className="border-b last:border-0 hover:bg-muted/10">
                              <td className="py-1.5 px-3 text-muted-foreground">
                                {new Date(cons.fecha).toLocaleDateString('es-EC', { day: '2-digit', month: 'short' })}
                              </td>
                              <td className="py-1.5 px-3">{cons.cantidad}x {cons.producto}</td>
                              <td className="py-1.5 px-3 text-right font-medium">${cons.valor.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-10 text-muted-foreground bg-muted/5 rounded-xl border border-dashed">
            {isGeneratingReport ? 'Cargando datos...' : 'No se encontraron consumos confirmados en este rango de fechas. Asegúrese de que los pedidos estén en estado "Consumido".'}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
