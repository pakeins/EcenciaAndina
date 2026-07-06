import { Badge } from '@/components/ui/badge';

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

const outcomeClasses: Record<TraceOutcome, string> = {
  received: 'bg-blue-100 text-blue-800',
  pending: 'bg-amber-100 text-amber-800',
  success: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  rejected: 'bg-slate-200 text-slate-800',
};

const displayValue = (value: unknown) => {
  if (value === null || value === undefined || value === '') return 'No disponible';
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'Ninguno';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const clientName = (trace: TelegramOrderTrace) => {
  const client = Array.isArray(trace.clientes) ? trace.clientes[0] : trace.clientes;
  const name = `${client?.nombre || ''} ${client?.apellido || ''}`.trim();
  return name || 'Cliente no identificado';
};

const humanizeAction = (action?: unknown) => {
  if (typeof action !== 'string' || !action) return 'Mensaje directo o acción desconocida';
  const mapping: Record<string, string> = {
    'menu': 'Revisó el menú del día',
    'pedir': 'Inició un nuevo pedido',
    'confirmar': 'Confirmó su pedido final',
    'cancelar': 'Canceló el pedido en curso',
    'estado': 'Consultó el estado de su pedido',
    'sopas': 'Seleccionando Sopa',
    'segundos': 'Seleccionando Segundo',
  };
  return mapping[action.toLowerCase()] || action.replace(/_/g, ' ').toUpperCase();
};

const TraceStep = ({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) => (
  <section className="rounded-lg border bg-muted/20 p-3">
    <h3 className="mb-2 text-sm font-bold text-cafe">
      {number}. {title}
    </h3>
    <div className="space-y-1 text-sm text-foreground">{children}</div>
  </section>
);

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
    <div aria-label="Historial de trazabilidad de pedidos automaticos" className="space-y-4">
      {traces.map((trace) => (
        <article key={trace.id} className="rounded-xl border bg-card p-4 shadow-sm">
          <header className="mb-4 flex flex-col justify-between gap-2 border-b pb-3 sm:flex-row sm:items-center">
            <div>
              <p className="font-bold text-foreground">{clientName(trace)}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(trace.created_at).toLocaleString('es-EC')} · Chat {trace.chat_id || 'sin identificar'}
              </p>
            </div>
            <Badge className={`w-fit border-0 ${outcomeClasses[trace.outcome]}`}>
              {outcomeLabels[trace.outcome]}
            </Badge>
          </header>

          <div className="grid gap-3 lg:grid-cols-3">
            <TraceStep number={1} title="Acción del Cliente">
              <p><strong>Interacción:</strong> {trace.original_message?.type === 'callback_query' ? 'Presionó un botón' : 'Envió un mensaje'}</p>
              <p><strong>Acción solicitada:</strong> {humanizeAction(trace.original_message?.callbackAction || trace.original_message?.text)}</p>
            </TraceStep>

            <TraceStep number={2} title="Interpretación del Sistema">
              {trace.interpreted_payload?.step && <p><strong>Paso actual:</strong> {displayValue(trace.interpreted_payload?.step)}</p>}
              {trace.interpreted_payload?.missing && (
                <p className="text-red-700"><strong>Le faltó elegir:</strong> {displayValue(trace.interpreted_payload?.missing)}</p>
              )}
              {trace.interpreted_payload?.sopa && <p><strong>Sopa:</strong> {displayValue(trace.interpreted_payload?.sopa)}</p>}
              {trace.interpreted_payload?.segundo && <p><strong>Segundo:</strong> {displayValue(trace.interpreted_payload?.segundo)}</p>}
              {!trace.interpreted_payload?.step && <p className="text-muted-foreground italic">El bot solo envió información (Ej. Menú del día).</p>}
            </TraceStep>

            <TraceStep number={3} title="Resultado Final">
              <p><strong>Estado:</strong> {outcomeLabels[trace.outcome]}</p>
              <p className="break-words"><strong>Detalle del sistema:</strong> {trace.error_message || 'El proceso se completó correctamente.'}</p>
              {trace.id_orden && (
                <p className="break-all font-bold text-cafe"><strong>Orden Generada:</strong> #{trace.id_orden.split('-')[0]}</p>
              )}
              <p className="text-xs text-muted-foreground mt-2"><strong>Completado a las:</strong> {new Date(trace.updated_at).toLocaleTimeString('es-EC')}</p>
            </TraceStep>
          </div>

          <details className="mt-4 text-xs group">
            <summary className="cursor-pointer font-semibold text-muted-foreground hover:text-cafe transition-colors select-none">
              ▶ Ver registro técnico para desarrolladores (JSON)
            </summary>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 text-green-400 p-4 shadow-inner max-h-60 overflow-y-auto">
              {JSON.stringify({
                update_id: trace.update_id,
                original_message: trace.original_message,
                interpreted_payload: trace.interpreted_payload,
                outcome: trace.outcome,
                error_message: trace.error_message,
              }, null, 2)}
            </pre>
          </details>
        </article>
      ))}
    </div>
  );
}
