import type { Client, ConvenioImportResult } from '@/types';

type BadgeVariant = 'default' | 'destructive' | 'secondary';

export const importStatusLabel = (status: ConvenioImportResult['estado']) => ({
  created: 'Creado',
  linked_existing: 'Vinculado',
  skipped_existing: 'Ya estaba',
  rejected: 'Rechazado',
}[status] || status);

export const telegramStatusLabel = (status?: string) => ({
  accepted: 'Aceptado',
  pending: 'Pendiente',
  rejected: 'Rechazado',
  sent: 'Enviado',
  manual_required: 'Link manual',
  rejected_manual_required: 'Reinvitar manual',
  no_phone: 'Sin telefono',
  missing_bot_username: 'Falta bot username',
  failed: 'Fallido',
  not_generated: 'No generado',
}[status || ''] || 'Sin estado');

export const emailStatusLabel = (status?: string | null) => ({
  not_attempted: 'No intentado',
  sent: 'Correo enviado',
  failed: 'Correo fallido',
  missing_recipient: 'Sin correo',
  not_configured: 'Falta Outlook',
}[status || ''] || 'Sin estado');

export const clientTelegramStatus = (client: Client) => {
  if (!client.telegram) return client.telefono ? 'pending' : 'no_phone';
  if (client.telegram.consent_status === 'accepted' && client.telegram.is_active) return 'accepted';
  if (client.telegram.consent_status === 'rejected') return 'rejected';
  return 'pending';
};

export const telegramBadgeVariant = (status?: string): BadgeVariant => {
  if (status === 'accepted') return 'default';
  if (status === 'rejected') return 'destructive';
  return 'secondary';
};

export const emailBadgeVariant = (status?: string | null): BadgeVariant => {
  if (status === 'sent') return 'default';
  if (['failed', 'missing_recipient', 'not_configured'].includes(status || '')) return 'destructive';
  return 'secondary';
};
