import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, RefreshCw, ShieldCheck, AlertTriangle } from 'lucide-react';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

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

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clientToHardDelete, setClientToHardDelete] = useState<{request: TelegramPrivacyRequest, clientId: string} | null>(null);

  const hardDeleteClient = async (request: TelegramPrivacyRequest, clientId: string) => {
    setClientToHardDelete({ request, clientId });
    setConfirmOpen(true);
  };

  const confirmHardDelete = async () => {
    if (!clientToHardDelete) return;
    const { clientId } = clientToHardDelete;
    
    setLoading(true);
    try {
      const response = await apiFetch(`/clientes/${clientId}/hard-delete`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error || 'No se pudo eliminar el cliente.');
        return;
      }
      toast.success('Cliente eliminado permanentemente.');
      await loadRequests();
      onResolved();
    } catch (error) {
      toast.error('Error al intentar eliminar el cliente.');
    } finally {
      setLoading(false);
      setClientToHardDelete(null);
    }
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

        <Alert variant="destructive" className="mt-4 mb-2">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Opciones de Resolución</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4 space-y-1 mt-2">
              <li><strong>Solo Revocar Acceso:</strong> El usuario pierde el acceso al bot pero conservas su historial contable y sus pedidos en el sistema.</li>
              <li><strong>Borrado Completo:</strong> Elimina al cliente, sus pedidos, deudas y suscripciones. Esta acción es <strong>irreversible</strong> y cumple a cabalidad con la eliminación de datos.</li>
            </ul>
          </AlertDescription>
        </Alert>

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
            const client = request.clientes as unknown; // Cast as unknown because we added dynamic fields
            const orderCount = client?.ordenes?.[0]?.count || 0;
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
                    {client && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge variant="secondary">C.I: {client.cedula}</Badge>
                        <Badge variant={orderCount > 0 ? "default" : "secondary"}>Total Pedidos en Sistema: {orderCount}</Badge>
                      </div>
                    )}
                  </div>
                  <Badge variant="outline">{request.status === 'pending' ? 'Pendiente' : 'En revision'}</Badge>
                </div>
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
                  <Button variant="secondary" onClick={() => updateRequest(request, 'resolved')}>
                    Solo Revocar Acceso
                  </Button>
                  {client?.id_cliente && (
                    <Button variant="destructive" onClick={() => hardDeleteClient(request, client.id_cliente)}>
                      Borrado Completo
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="¿Borrado Permanente?"
        description="Esta acción NO se puede deshacer y borrará todos los registros financieros de este cliente. ¿Estás SEGURO?"
        onConfirm={confirmHardDelete}
        confirmText="Sí, Borrar Permanentemente"
        variant="destructive"
      />
    </Dialog>
  );
}
