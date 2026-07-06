import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { OrderFormFields, OrderFormState } from './OrderFormFields';
import { toast } from 'sonner';

interface EditOrderDialogProps {
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  order: any | null; // using any since the shape comes from the GET response
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
}

export function EditOrderDialog({ order, open, onOpenChange, onSave }: EditOrderDialogProps) {
  const [state, setState] = useState<OrderFormState>({
    items: [],
    observaciones: '',
  });

  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (order && open) {
      setState({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        items: order.detalle_orden?.map((det: any) => ({
          id_producto: det.id_producto,
          nombre: det.productos?.nombre_producto || 'Desconocido',
          precio: det.precio_aplicado,
          cantidad: det.cantidad,
          sopa: det.opciones?.sopa || '',
          segundo: det.opciones?.segundo || '',
          id_categoria: 0, // Not strictly needed for deleting/adding locally
        })) || [],
        observaciones: order.observaciones || '',
      });
    }
  }, [order, open]);

  if (!order) return null;

  const isConvenio = order.clientes?.tipos_cliente?.nombre_tipo?.toLowerCase().includes('convenio');

  const handleSave = async () => {
    if (state.items.length === 0) {
      toast.error('Agregue al menos un producto al pedido');
      return;
    }

    setIsSaving(true);
    try {
      const response = await apiFetch(`/ordenes/${order.id_orden}`, {
        method: 'PUT',
        body: JSON.stringify({
          observaciones: state.observaciones,
          detalles: state.items.map(item => {
            const opciones: Record<string, string> = {};
            if (item.sopa) opciones.sopa = item.sopa;
            if (item.segundo) opciones.segundo = item.segundo;
            return {
              id_producto: item.id_producto,
              cantidad: item.cantidad,
              precio_aplicado: item.precio,
              opciones
            };
          })
        })
      });

      if (response.ok) {
        toast.success('Pedido actualizado correctamente');
        onSave(); // Refresh list
        onOpenChange(false);
      } else {
        const errorData = await response.json();
        toast.error(`Error al guardar: ${errorData.error}`);
      }
    } catch (err) {
      toast.error('Error de conexión con el servidor');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto sm:rounded-2xl">
        <DialogHeader className="sm:text-center space-y-1.5">
          <DialogTitle className="text-2xl font-black text-foreground">Editar Pedido</DialogTitle>
          <DialogDescription className="text-base">
            Modificando pedido de <strong className="text-foreground">{order.clientes?.nombre} {order.clientes?.apellido}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Client Info */}
          <div className="rounded-xl border border-border bg-card shadow-sm p-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">Cliente</Label>
                <p className="font-semibold text-foreground text-base">{order.clientes?.nombre} {order.clientes?.apellido}</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">App de Mensajería</Label>
                <p className="font-semibold text-foreground text-base">{order.clientes?.telefono || 'N/A'}</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">Tipo de Cliente</Label>
                <div>
                  <Badge variant="outline" className="w-fit border-primary/20 bg-primary/5 text-primary text-xs">
                    {order.clientes?.tipos_cliente?.nombre_tipo || 'Cliente'}
                  </Badge>
                </div>
              </div>
              {isConvenio && (
                <div className="flex flex-col gap-1.5">
                  <Label className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">Detalle Convenio</Label>
                  <p className="font-semibold text-foreground text-base">{order.clientes?.tipos_cliente?.nombre_tipo}</p>
                </div>
              )}
            </div>
          </div>

          <OrderFormFields state={state} onChange={setState} showProductos={true} />
        </div>

        <DialogFooter className="gap-2 sm:gap-0 mt-4 border-t border-border pt-4">
          <Button variant="outline" className="rounded-xl h-11 font-bold" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} className="rounded-xl h-11 font-bold bg-cafe hover:bg-cafe/90 shadow-md shadow-cafe/20 transition-all hover:scale-[1.02]" disabled={isSaving}>
            {isSaving ? 'Guardando...' : 'Guardar Cambios'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
