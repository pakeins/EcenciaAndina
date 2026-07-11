import { Client } from '@/types';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ClientToggleStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientToToggle: Client | null;
  onConfirm: (clientId: string, newState: boolean) => void;
}

export function ClientToggleStatusDialog({
  open,
  onOpenChange,
  clientToToggle,
  onConfirm,
}: ClientToggleStatusDialogProps) {
  if (!clientToToggle) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Desactivar cliente?</AlertDialogTitle>
          <AlertDialogDescription>
            ¿Está seguro que desea desactivar a{' '}
            <strong>
              {clientToToggle.nombre} {clientToToggle.apellido}
            </strong>
            ?
            <br />
            <br />
            El cliente quedará inactivo hasta que se reactive manualmente.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => onOpenChange(false)}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => onConfirm(clientToToggle.id, false)}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Sí, desactivar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
