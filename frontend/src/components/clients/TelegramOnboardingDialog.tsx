import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { AlertTriangle, Check, Copy, ExternalLink, Mail, RefreshCw, Send } from 'lucide-react';
import type { TelegramOnboarding } from '@/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

interface TelegramOnboardingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientName: string;
  onboarding: TelegramOnboarding | null;
  onRetryEmail?: () => Promise<void>;
  retryingEmail?: boolean;
}

export function TelegramOnboardingDialog({
  open,
  onOpenChange,
  clientName,
  onboarding,
  onRetryEmail,
  retryingEmail = false,
}: TelegramOnboardingDialogProps) {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCopied(false);
    setQrDataUrl('');
    if (!open || !onboarding?.onboarding_url) return;

    QRCode.toDataURL(onboarding.onboarding_url, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 320,
      color: { dark: '#3b2417', light: '#ffffff' },
    })
      .then(setQrDataUrl)
      .catch(() => toast.error('No se pudo generar el QR.'));
  }, [onboarding, open]);

  const copyLink = async () => {
    if (!onboarding?.onboarding_url) return;
    await navigator.clipboard.writeText(onboarding.onboarding_url);
    setCopied(true);
    toast.success('Enlace de Telegram copiado.');
  };

  const openTelegram = () => {
    if (!onboarding?.onboarding_url) return;
    window.open(onboarding.onboarding_url, '_blank', 'noopener,noreferrer');
  };

  const delivery = onboarding?.email_delivery;
  const deliveryMessage = delivery?.status === 'sent'
    ? `Invitacion enviada a ${delivery.recipient}.`
    : delivery?.status === 'not_configured'
      ? 'Resend aun no esta configurado. El enlace y el QR siguen disponibles.'
      : delivery?.status === 'failed'
        ? `No se pudo enviar el correo a ${delivery.recipient || 'la direccion registrada'}.`
        : delivery?.status === 'pending'
          ? 'El correo esta en proceso de envio.'
          : 'El correo de invitacion no se ha enviado.';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Activacion por Telegram</DialogTitle>
          <DialogDescription>
            {onboarding?.status === 'sent'
              ? `El aviso de consentimiento fue enviado directamente a ${clientName}.`
              : `Entrega este enlace privado a ${clientName}. Caduca en 7 dias y solo puede reclamarse una vez.`}
          </DialogDescription>
        </DialogHeader>

        {onboarding?.onboarding_url ? (
          <div className="space-y-4">
            <div
              className={`flex items-start gap-3 rounded-lg border p-3 ${
                delivery?.status === 'sent'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-amber-200 bg-amber-50 text-amber-900'
              }`}
            >
              {delivery?.status === 'sent'
                ? <Mail className="mt-0.5 h-4 w-4 shrink-0" />
                : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
              <p className="text-sm">{deliveryMessage}</p>
            </div>
            {qrDataUrl && (
              <div className="flex justify-center rounded-xl border bg-white p-4">
                <img src={qrDataUrl} alt={`QR de activacion Telegram para ${clientName}`} className="h-64 w-64" />
              </div>
            )}
            <Input value={onboarding.onboarding_url} readOnly aria-label="Enlace de activacion Telegram" />
            {onboarding.expires_at && (
              <p className="text-center text-xs text-muted-foreground">
                Expira: {new Date(onboarding.expires_at).toLocaleString()}
              </p>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-4">
            <Send className="h-5 w-5 text-primary" />
            <p className="text-sm">Telegram recibio el aviso en el chat ya vinculado.</p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {onboarding?.onboarding_url && (
            <>
              {delivery?.status !== 'sent' && onRetryEmail && (
                <Button
                  variant="outline"
                  onClick={onRetryEmail}
                  disabled={retryingEmail}
                  className="gap-2"
                >
                  <RefreshCw className={`h-4 w-4 ${retryingEmail ? 'animate-spin' : ''}`} />
                  Reintentar correo
                </Button>
              )}
              <Button variant="outline" onClick={copyLink} className="gap-2">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copiado' : 'Copiar'}
              </Button>
              <Button onClick={openTelegram} className="gap-2">
                <ExternalLink className="h-4 w-4" />
                Abrir Telegram
              </Button>
            </>
          )}
          {!onboarding?.onboarding_url && <Button onClick={() => onOpenChange(false)}>Cerrar</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
