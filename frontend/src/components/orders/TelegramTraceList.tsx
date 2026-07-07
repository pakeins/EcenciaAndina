import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Bot, User, CheckCircle2, XCircle, AlertCircle, Clock } from 'lucide-react';

export type TraceOutcome = 'received' | 'pending' | 'success' | 'failed' | 'rejected';

export interface TelegramOrderTrace {
  id: string;
  chat_id: string | null;
  update_id: number | null;
  id_orden: string | null;
  original_message: Record<string, unknown>;
  interpreted_payload: Record<string, unknown>;
  outcome: TraceOutcome;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  clientes?: { nombre?: string; apellido?: string } | null;
  ordenes?: { id_orden?: string; created_at?: string } | null;
}

interface TelegramTraceListProps {
  traces: TelegramOrderTrace[];
  isLoading: boolean;
  error: string | null;
}

const outcomeLabels: Record<TraceOutcome, string> = {
  received: 'Recibido',
  pending: 'Pendiente',
  success: 'Exitoso',
  failed: 'Fallido',
  rejected: 'Rechazado',
};

const outcomeIcons: Record<TraceOutcome, React.ReactNode> = {
  received: <Bot className="h-4 w-4" />,
  pending: <Clock className="h-4 w-4" />,
  success: <CheckCircle2 className="h-4 w-4" />,
  failed: <XCircle className="h-4 w-4" />,
  rejected: <AlertCircle className="h-4 w-4" />,
};

const outcomeClasses: Record<TraceOutcome, string> = {
  received: 'bg-blue-100 text-blue-800',
  pending: 'bg-amber-100 text-amber-800',
  success: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  rejected: 'bg-slate-200 text-slate-800',
};

const clientName = (trace: TelegramOrderTrace) => {
  const client = Array.isArray(trace.clientes) ? trace.clientes[0] : trace.clientes;
  const name = `${client?.nombre || ''} ${client?.apellido || ''}`.trim();
  return name || 'Desconocido';
};

const humanizeAction = (action?: unknown) => {
  if (typeof action !== 'string' || !action) return 'Mensaje/Comando';
  const mapping: Record<string, string> = {
    'menu': 'Revisar Menú',
    'pedir': 'Iniciar Pedido',
    'confirmar': 'Confirmar',
    'cancelar': 'Cancelar',
    'estado': 'Consultar Estado',
    'sopas': 'Elegir Sopa',
    'segundos': 'Elegir Segundo',
  };
  return mapping[action.toLowerCase()] || action;
};

export function TelegramTraceList({ traces, isLoading, error }: TelegramTraceListProps) {
  if (isLoading) {
    return <div role="status" className="py-10 text-center text-muted-foreground">Cargando trazabilidad...</div>;
  }

  if (error) {
    return <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-destructive">{error}</div>;
  }

  if (!traces.length) {
    return <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">No existen registros de trazabilidad.</div>;
  }

  return (
    <div className="rounded-md border bg-card overflow-hidden">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead className="w-[100px]">Hora</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Acción</TableHead>
            <TableHead>Interpretación</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Detalle Técnico</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {traces.map((trace) => {
            const time = new Date(trace.created_at).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
            const action = humanizeAction(trace.original_message?.callbackAction || trace.original_message?.text);
            
            // Build interpretation summary
            const parts = [];
            if (trace.interpreted_payload?.step) parts.push(`Paso: ${trace.interpreted_payload.step}`);
            if (trace.interpreted_payload?.sopa) parts.push(`Sopa: ${trace.interpreted_payload.sopa}`);
            if (trace.interpreted_payload?.segundo) parts.push(`Segundo: ${trace.interpreted_payload.segundo}`);
            const interpretation = parts.length > 0 ? parts.join(' | ') : 'Interacción informativa';

            return (
              <TableRow key={trace.id} className="group">
                <TableCell className="font-medium text-xs text-muted-foreground">{time}</TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-semibold text-foreground text-sm flex items-center gap-1.5"><User className="h-3 w-3" /> {clientName(trace)}</span>
                    <span className="text-[10px] text-muted-foreground">Chat: {trace.chat_id || 'N/A'}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-sm font-medium">{action}</span>
                </TableCell>
                <TableCell className="max-w-[200px] truncate text-xs" title={interpretation}>
                  {trace.error_message ? (
                    <span className="text-red-600 font-medium truncate flex items-center gap-1"><AlertCircle className="h-3 w-3 shrink-0" /> Error del bot</span>
                  ) : (
                    <span className="text-muted-foreground">{interpretation}</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={`w-fit border-0 flex items-center gap-1.5 ${outcomeClasses[trace.outcome]}`}>
                    {outcomeIcons[trace.outcome]}
                    {outcomeLabels[trace.outcome]}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <details className="text-xs inline-block text-left cursor-pointer relative z-10">
                    <summary className="font-semibold text-primary hover:underline select-none">
                      Ver JSON
                    </summary>
                    <div className="absolute right-0 mt-2 w-72 bg-slate-900 text-green-400 p-3 rounded shadow-xl border border-slate-700 max-h-60 overflow-auto z-50">
                      <pre>
                        {JSON.stringify({
                          original: trace.original_message,
                          payload: trace.interpreted_payload,
                          error: trace.error_message
                        }, null, 2)}
                      </pre>
                    </div>
                  </details>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
