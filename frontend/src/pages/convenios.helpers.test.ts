import { describe, expect, it } from 'vitest';
import {
  clientTelegramStatus,
  emailBadgeVariant,
  emailStatusLabel,
  importStatusLabel,
  telegramBadgeVariant,
  telegramStatusLabel,
} from './convenios.helpers';
import type { Client } from '@/types';

const makeClient = (patch: Partial<Client>): Client => ({
  id: 'client-1',
  cedula: '0102030405',
  nombre: 'Ana',
  apellido: 'Perez',
  email: 'ana@example.com',
  telefono: '0998313804',
  activo: true,
  ...patch,
});

describe('convenios helpers', () => {
  it('traduce estados de importacion y Telegram', () => {
    expect(importStatusLabel('created')).toBe('Creado');
    expect(importStatusLabel('linked_existing')).toBe('Vinculado');
    expect(telegramStatusLabel('rejected_manual_required')).toBe('Reinvitar manual');
    expect(telegramStatusLabel('estado_desconocido')).toBe('Sin estado');
    expect(emailStatusLabel('sent')).toBe('Correo enviado');
    expect(emailStatusLabel('not_configured')).toBe('Falta Outlook');
  });

  it('resuelve el estado Telegram visible del cliente', () => {
    expect(clientTelegramStatus(makeClient({ telefono: '' }))).toBe('no_phone');
    expect(clientTelegramStatus(makeClient({ telegram: null }))).toBe('pending');
    expect(clientTelegramStatus(makeClient({
      telegram: { consent_status: 'accepted', is_active: true, has_chat: true },
    }))).toBe('accepted');
    expect(clientTelegramStatus(makeClient({
      telegram: { consent_status: 'rejected', is_active: false, has_chat: false },
    }))).toBe('rejected');
  });

  it('asigna variante visual segun estado Telegram', () => {
    expect(telegramBadgeVariant('accepted')).toBe('default');
    expect(telegramBadgeVariant('rejected')).toBe('destructive');
    expect(telegramBadgeVariant('pending')).toBe('secondary');
    expect(emailBadgeVariant('sent')).toBe('default');
    expect(emailBadgeVariant('failed')).toBe('destructive');
  });
});
