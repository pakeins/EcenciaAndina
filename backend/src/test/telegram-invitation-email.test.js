import { afterEach, describe, expect, it, vi } from 'vitest';
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
  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.INVITATION_FROM_EMAIL;
    delete process.env.INVITATION_REPLY_TO;
  });

  it('normaliza el destinatario y genera un QR sin persistirlo', async () => {
    expect(normalizeEmail(client.correo)).toBe('ana.perez@example.test');
    const email = await buildInvitationEmail({ client, onboarding });
    expect(email.html).toContain('cid:telegram-activation-qr');
    expect(email.html).toContain(onboarding.onboarding_url);
    expect(email.qrBase64).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it('devuelve not_configured y guarda solo metadatos cuando Resend no esta configurado', async () => {
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
    expect(JSON.stringify(database.update.mock.calls)).not.toContain('private-token-value');
  });

  it('envia el QR por CID y registra el identificador del proveedor', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.INVITATION_FROM_EMAIL = 'Eciencia <invite@example.test>';
    process.env.INVITATION_REPLY_TO = 'support@example.test';
    const database = createDatabaseMock();
    const send = vi.fn().mockResolvedValue({
      data: { id: 'email-provider-id' },
      error: null,
    });

    const result = await sendTelegramInvitationEmail(
      { client, onboarding },
      {
        createClient: database.createClient,
        createResend: () => ({ emails: { send } }),
      },
    );

    expect(result.status).toBe('sent');
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      to: ['ana.perez@example.test'],
      replyTo: 'support@example.test',
      attachments: [
        expect.objectContaining({
          filename: 'activacion-telegram.png',
          contentId: 'telegram-activation-qr',
        }),
      ],
    }));
    expect(database.update).toHaveBeenLastCalledWith(expect.objectContaining({
      email_delivery_status: 'sent',
      email_provider_id: 'email-provider-id',
    }));
  });

  it('conserva la invitacion y marca failed si Resend rechaza el envio', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.INVITATION_FROM_EMAIL = 'Eciencia <invite@example.test>';
    const database = createDatabaseMock();
    const result = await sendTelegramInvitationEmail(
      { client, onboarding },
      {
        createClient: database.createClient,
        createResend: () => ({
          emails: {
            send: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'rejected' },
            }),
          },
        }),
      },
    );

    expect(result.status).toBe('failed');
    expect(database.update).toHaveBeenLastCalledWith(expect.objectContaining({
      email_delivery_status: 'failed',
      email_provider_id: null,
    }));
  });
});
