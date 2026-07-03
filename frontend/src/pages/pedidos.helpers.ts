export const telegramNotificationDescription = (notification?: { status?: string; error?: string }) => {
  switch (notification?.status) {
    case 'sent':
      return 'Notificacion Telegram enviada al cliente.';
    case 'skipped_no_subscription':
      return 'El cliente no tiene Telegram vinculado y aceptado.';
    case 'failed':
      return `No se pudo notificar por Telegram: ${notification.error || 'error no especificado'}`;
    default:
      return undefined;
  }
};

export const isBusinessRuleError = (response: Pick<Response, 'status'>, error?: string) => {
  const normalizedError = String(error || '').toLowerCase();
  return response.status === 400 && (normalizedError.includes('saldo') || normalizedError.includes('convenio'));
};
