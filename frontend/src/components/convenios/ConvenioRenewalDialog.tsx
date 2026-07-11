import { Convenio } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface RenewalDates {
  fecha_inicio: string;
  fecha_caducidad: string;
}

interface ConvenioRenewalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  convenioToRenew: Convenio | null;
  renewalDates: RenewalDates;
  setRenewalDates: (dates: RenewalDates) => void;
  isSaving: boolean;
  onRenew: () => void;
}

export function ConvenioRenewalDialog({
  open,
  onOpenChange,
  convenioToRenew,
  renewalDates,
  setRenewalDates,
  isSaving,
  onRenew,
}: ConvenioRenewalDialogProps) {
  if (!convenioToRenew) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Renovación de Convenio</DialogTitle>
          <DialogDescription>
            Su convenio debe renovarse. Por favor seleccione el nuevo periodo para reactivarlo.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nueva Fecha Inicio</Label>
              <Input
                type="date"
                value={renewalDates.fecha_inicio}
                onChange={e => setRenewalDates({ ...renewalDates, fecha_inicio: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Nueva Fecha Fin</Label>
              <Input
                type="date"
                value={renewalDates.fecha_caducidad}
                onChange={e => setRenewalDates({ ...renewalDates, fecha_caducidad: e.target.value })}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={onRenew} disabled={isSaving} className="bg-cafe hover:bg-cafe/90 shadow-lg shadow-cafe/20">
            {isSaving ? 'Renovando...' : 'Renovar y Activar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
