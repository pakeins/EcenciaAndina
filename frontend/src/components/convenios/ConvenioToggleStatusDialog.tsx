import { Convenio } from '@/types';
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

interface ConvenioToggleStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  convenioToToggle: Convenio | null;
  onConfirm: (id: string, newState: boolean) => void;
}

export function ConvenioToggleStatusDialog({
  open,
  onOpenChange,
  convenioToToggle,
  onConfirm,
}: ConvenioToggleStatusDialogProps) {
  if (!convenioToToggle) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Desactivar convenio?</AlertDialogTitle>
          <AlertDialogDescription>El convenio quedará inactivo hasta que se reactive manualmente.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => onOpenChange(false)}>Cancelar</AlertDialogCancel>
          <AlertDialogAction 
            onClick={() => onConfirm(convenioToToggle.id, false)} 
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Sí, desactivar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
