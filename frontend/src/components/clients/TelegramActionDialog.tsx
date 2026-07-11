import { useState } from 'react';
import { Send, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface TelegramActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientName: string;
  clientId: string | null;
  onInvite: (clientId: string) => Promise<void>;
  onRevoke: (clientId: string) => Promise<void>;
  isLoading: boolean;
}

export function TelegramActionDialog({
  open,
  onOpenChange,
  clientName,
  clientId,
  onInvite,
  onRevoke,
  isLoading,
}: TelegramActionDialogProps) {
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setConfirmRevoke(false);
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>Gestionar Telegram</DialogTitle>
          <DialogDescription>
            Selecciona una acción para <strong>{clientName}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 mt-4">
          <div className="rounded-lg border p-4 shadow-sm">
            <Button
              className="w-full justify-start gap-2 text-left mb-2"
              onClick={() => clientId && onInvite(clientId)}
              disabled={isLoading || confirmRevoke}
            >
              <Send className="h-4 w-4" />
              Enviar nueva invitación
            </Button>
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
              Genera y envía un nuevo enlace al usuario para que pueda acceder al bot de reservas. Útil si perdió el acceso, borró el chat o la invitación expiró.
            </p>
          </div>

          <div className="rounded-lg border border-red-100 p-4 shadow-sm bg-red-50/30">
            {!confirmRevoke ? (
              <Button
                variant="destructive"
                className="w-full justify-start gap-2 text-left mb-2"
                onClick={() => setConfirmRevoke(true)}
                disabled={isLoading}
              >
                <UserX className="h-4 w-4" />
                Revocar acceso al Bot
              </Button>
            ) : (
              <Alert variant="destructive" className="mb-4">
                <AlertTitle>¿Estás seguro?</AlertTitle>
                <AlertDescription className="mt-2 flex flex-col gap-3">
                  <p>
                    Esta acción expulsará al usuario del bot inmediatamente.
                  </p>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmRevoke(false)}
                      disabled={isLoading}
                    >
                      Cancelar
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => clientId && onRevoke(clientId)}
                      disabled={isLoading}
                    >
                      Sí, Revocar
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
              El usuario será bloqueado en el bot y ya no recibirá los menús diarios ni notificaciones. Su registro de cliente, deudas e historial de pedidos se mantendrán <strong>intactos</strong> en el sistema.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
