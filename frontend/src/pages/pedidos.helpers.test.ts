import { describe, expect, it } from 'vitest';
import { isBusinessRuleError, telegramNotificationDescription } from './pedidos.helpers';

describe('pedidos helpers', () => {
  it('describe el resultado de notificacion Telegram', () => {
    expect(telegramNotificationDescription({ status: 'sent' })).toBe('Notificacion Telegram enviada al cliente.');
    expect(telegramNotificationDescription({ status: 'skipped_no_subscription' })).toBe(
      'El cliente no tiene Telegram vinculado y aceptado.',
    );
    expect(telegramNotificationDescription({ status: 'failed', error: 'timeout' })).toBe(
      'No se pudo notificar por Telegram: timeout',
    );
    expect(telegramNotificationDescription({ status: 'ignored' })).toBeUndefined();
  });

  it('detecta errores de reglas de negocio que deben ir a dialogo', () => {
    expect(isBusinessRuleError({ status: 400 }, 'saldo insuficiente')).toBe(true);
    expect(isBusinessRuleError({ status: 400 }, 'Convenio vencido')).toBe(true);
    expect(isBusinessRuleError({ status: 409 }, 'saldo insuficiente')).toBe(false);
    expect(isBusinessRuleError({ status: 400 }, 'cedula invalida')).toBe(false);
  });
});
