import { Client } from '@/types';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ClientDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientToDelete: Client | null;
  isAdmin: boolean;
  onConfirm: (force: boolean) => void;
}

export function ClientDeleteDialog({
  open,
  onOpenChange,
  clientToDelete,
  isAdmin,
  onConfirm,
}: ClientDeleteDialogProps) {
  if (!clientToDelete) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-foreground">Eliminar Cliente</AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">
            Seleccione el método de eliminación para <strong>{clientToDelete.nombre} {clientToDelete.apellido}</strong>.
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <div className="flex flex-col gap-4 py-4">
          <div className="rounded-lg border border-border p-4">
            <h4 className="font-semibold text-foreground mb-1">Eliminación Segura</h4>
            <p className="text-sm text-muted-foreground mb-3">
              Comprueba si el cliente tiene órdenes o saldo. Si tiene, se bloqueará la eliminación para proteger el historial financiero.
            </p>
            <Button variant="outline" className="w-full" onClick={() => onConfirm(false)}>
              Eliminar Normalmente
            </Button>
          </div>

          {isAdmin && (
            <div className="rounded-lg border border-red-200 bg-red-50/50 p-4">
              <h4 className="font-semibold text-red-600 mb-1">Borrado Forzado (Destructivo)</h4>
              <p className="text-sm text-red-600/80 mb-3">
                Elimina al cliente y absolutamente TODO su historial financiero, órdenes, saldo y trazabilidad. Úsalo solo para cuentas de prueba.
              </p>
              <Button variant="destructive" className="w-full" onClick={() => onConfirm(true)}>
                Borrado Forzado Permanentemente
              </Button>
            </div>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
