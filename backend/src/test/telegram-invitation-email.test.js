import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import invitationEmail from '../services/telegramInvitationEmail.js';

const {
  buildInvitationEmail,
  normalizeEmail,
  sendTelegramInvitationEmail,
} = invitationEmail;

const client = {
  nombre: 'Ana',
  apellido: 'Perez',
  correo: ' ANA.PEREZ@EXAMPLE.TEST ',
};

const onboarding = {
  invitationId: '11111111-1111-4111-8111-111111111111',
  onboarding_url: 'https://t.me/eciencia_test_bot?start=private-token-value',
  expires_at: '2026-06-19T12:00:00.000Z',
};

const createDatabaseMock = () => {
  const update = vi.fn();
  const eq = vi.fn().mockResolvedValue({ error: null });
  update.mockReturnValue({ eq });
  return {
    createClient: () => ({
      from: vi.fn().mockReturnValue({ update }),
    }),
    update,
  };
};

describe('correo de invitacion Telegram', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.GMAIL_USER;
    delete process.env.GMAIL_APP_PASSWORD;
    delete process.env.INVITATION_REPLY_TO;
  });

  it('normaliza el destinatario y genera un QR sin persistirlo', async () => {
    expect(normalizeEmail(client.correo)).toBe('ana.perez@example.test');
    const email = await buildInvitationEmail({ client, onboarding });
    expect(email.html).toContain('cid:telegram-activation-qr');
    expect(email.html).toContain(onboarding.onboarding_url);
    expect(Buffer.isBuffer(email.qrBuffer)).toBe(true);
  });

  it('devuelve not_configured y guarda solo metadatos cuando Gmail no esta configurado', async () => {
    const database = createDatabaseMock();
    const result = await sendTelegramInvitationEmail(
      { client, onboarding },
      { createClient: database.createClient },
    );

    expect(result).toEqual({
      status: 'not_configured',
      recipient: 'ana.perez@example.test',
      provider_id: null,
    });
    expect(database.update).toHaveBeenCalledWith(expect.objectContaining({
      email_delivery_status: 'not_configured',
      email_recipient: 'ana.perez@example.test',
    }));
  });

  it('envia el QR por CID y registra el identificador del proveedor', async () => {
    process.env.GMAIL_USER = 'test@gmail.com';
    process.env.GMAIL_APP_PASSWORD = 'password';
    process.env.INVITATION_REPLY_TO = 'support@example.test';
    const database = createDatabaseMock();
    
    const sendMail = vi.fn().mockResolvedValue({
      messageId: 'email-provider-id',
    });
    const getTransporter = () => ({ sendMail });

    const result = await sendTelegramInvitationEmail(
      { client, onboarding },
      { createClient: database.createClient, getTransporter }
    );

    expect(result.status).toBe('sent');
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'ana.perez@example.test',
      replyTo: 'support@example.test',
      attachments: [
        expect.objectContaining({
          filename: 'activacion-telegram.png',
          cid: 'telegram-activation-qr',
        }),
      ],
    }));
    expect(database.update).toHaveBeenLastCalledWith(expect.objectContaining({
      email_delivery_status: 'sent',
      email_provider_id: 'email-provider-id',
    }));
  });

  it('conserva la invitacion y marca failed si Gmail rechaza el envio', async () => {
    process.env.GMAIL_USER = 'test@gmail.com';
    process.env.GMAIL_APP_PASSWORD = 'password';
    const database = createDatabaseMock();
    
    const sendMail = vi.fn().mockRejectedValue(new Error('rejected'));
    const getTransporter = () => ({ sendMail });

    const result = await sendTelegramInvitationEmail(
      { client, onboarding },
      { createClient: database.createClient, getTransporter }
    );

    expect(result.status).toBe('failed');
    expect(database.update).toHaveBeenLastCalledWith(expect.objectContaining({
      email_delivery_status: 'failed',
      email_provider_id: null,
    }));
  });
});
