import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, RefreshCw, ShieldCheck } from 'lucide-react';
import type { TelegramPrivacyRequest } from '@/types';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

interface TelegramPrivacyRequestsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResolved: () => void;
}

export function TelegramPrivacyRequestsDialog({
  open,
  onOpenChange,
  onResolved,
}: TelegramPrivacyRequestsDialogProps) {
  const [requests, setRequests] = useState<TelegramPrivacyRequest[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const loadRequests = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const response = await apiFetch('/clientes/telegram/privacidad-solicitudes');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudieron consultar las solicitudes.');
      setRequests(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudieron consultar las solicitudes.');
    } finally {
      setLoading(false);
    }
  }, [open]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const updateRequest = async (
    request: TelegramPrivacyRequest,
    status: 'in_review' | 'resolved' | 'rejected',
  ) => {
    const response = await apiFetch(`/clientes/telegram/privacidad-solicitudes/${request.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status,
        resolution_notes: notes[request.id] || undefined,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      toast.error(data.error || 'No se pudo actualizar la solicitud.');
      return;
    }
    toast.success('Solicitud actualizada.');
    await loadRequests();
    onResolved();
  };

  const activeRequests = requests.filter((request) => ['pending', 'in_review'].includes(request.status));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Solicitudes de privacidad
          </DialogTitle>
          <DialogDescription>
            Revisa los pedidos que deban conservarse antes de cerrar una solicitud de eliminacion.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Button variant="outline" size="sm" onClick={loadRequests} disabled={loading} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>

          {!loading && activeRequests.length === 0 && (
            <div className="flex items-center gap-3 rounded-lg border p-4 text-sm text-muted-foreground">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              No hay solicitudes pendientes.
            </div>
          )}

          {activeRequests.map((request) => {
            const client = request.clientes;
            return (
              <div key={request.id} className="space-y-3 rounded-xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">
                      {client ? `${client.nombre} ${client.apellido}` : 'Cliente eliminado'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(request.requested_at).toLocaleString()} | {request.id}
                    </p>
                  </div>
                  <Badge variant="outline">{request.status === 'pending' ? 'Pendiente' : 'En revision'}</Badge>
                </div>
                <p className="text-sm">
                  Pedidos que requieren revision: <strong>{request.retained_order_count}</strong>
                </p>
                <Textarea
                  placeholder="Notas de revision o fundamento de la resolucion"
                  value={notes[request.id] || ''}
                  onChange={(event) => setNotes((current) => ({ ...current, [request.id]: event.target.value }))}
                  maxLength={1000}
                />
                <div className="flex flex-wrap justify-end gap-2">
                  {request.status === 'pending' && (
                    <Button variant="outline" onClick={() => updateRequest(request, 'in_review')}>
                      Marcar en revision
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => updateRequest(request, 'rejected')}>
                    Rechazar
                  </Button>
                  <Button onClick={() => updateRequest(request, 'resolved')}>
                    Resolver
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
