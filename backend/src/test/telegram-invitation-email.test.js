import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import nodemailer from 'nodemailer';
import invitationEmail from '../services/telegramInvitationEmail.js';

vi.mock('nodemailer', () => {
  return {
    default: {
      createTransport: vi.fn()
    },
    createTransport: vi.fn()
  };
});

const {
  buildInvitationEmail,
  normalizeEmail,
  sendTelegramInvitationEmail,
  sendTelegramReactivationEmail,
  sendPrivacyRequestNotificationEmail,
  DELIVERY_STATUS
} = invitationEmail;

const client = {
  nombre: 'Ana',
  apellido: 'Perez',
  correo: ' ANA.PEREZ@EXAMPLE.TEST ',
  telefono: '0999999999'
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
  let mockSendMail;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSendMail = vi.fn().mockResolvedValue({ messageId: 'mock-id' });
    nodemailer.createTransport.mockReturnValue({
      sendMail: mockSendMail,
      on: vi.fn()
    });
  });

  afterEach(() => {
    delete process.env.GMAIL_USER;
    delete process.env.GMAIL_APP_PASSWORD;
    delete process.env.INVITATION_REPLY_TO;
    delete process.env.TELEGRAM_PRIVACY_CONTACT;
    delete process.env.ADMIN_SEED_EMAIL;
  });

  // --- sendTelegramInvitationEmail ---
  
  it('normaliza el destinatario y genera un QR sin persistirlo', async () => {
    expect(normalizeEmail(client.correo)).toBe('ana.perez@example.test');
    const email = await buildInvitationEmail({ client, onboarding });
    expect(email.html).toContain('cid:telegram-activation-qr');
    expect(email.html).toContain(onboarding.onboarding_url);
    expect(Buffer.isBuffer(email.qrBuffer)).toBe(true);
  });

  it('devuelve not_configured y guarda metadatos', async () => {
    const database = createDatabaseMock();
    const result = await sendTelegramInvitationEmail(
      { client, onboarding },
      { createClient: database.createClient },
    );
    expect(result.status).toBe('not_configured');
  });

  it('falla rapido si faltan datos', async () => {
    const result = await sendTelegramInvitationEmail({}, {});
    expect(result.status).toBe(DELIVERY_STATUS.FAILED);
  });

  it('envia el QR por CID y registra id', async () => {
    process.env.GMAIL_USER = 'test@gmail.com';
    process.env.GMAIL_APP_PASSWORD = 'password';
    const database = createDatabaseMock();
    const getTransporter = () => ({ sendMail: mockSendMail });
    const result = await sendTelegramInvitationEmail(
      { client, onboarding },
      { createClient: database.createClient, getTransporter }
    );
    expect(result.status).toBe('sent');
    expect(mockSendMail).toHaveBeenCalled();
  });

  // --- sendTelegramReactivationEmail ---

  it('devuelve not_configured si falta GMAIL envs en reactivacion', async () => {
    const result = await sendTelegramReactivationEmail({ client });
    expect(result.status).toBe(DELIVERY_STATUS.NOT_CONFIGURED);
  });

  it('devuelve failed si falta correo del cliente en reactivacion', async () => {
    const result = await sendTelegramReactivationEmail({ client: {} });
    expect(result.status).toBe(DELIVERY_STATUS.FAILED);
  });

  it('envia notificacion de reactivacion correctamente', async () => {
    process.env.GMAIL_USER = 'test@gmail.com';
    process.env.GMAIL_APP_PASSWORD = 'password';
    
    const getTransporter = () => ({ sendMail: mockSendMail });
    const result = await sendTelegramReactivationEmail({ client }, { getTransporter });
    expect(result.status).toBe(DELIVERY_STATUS.SENT);
    expect(mockSendMail).toHaveBeenCalled();
  });

  it('captura errores al enviar reactivacion', async () => {
    process.env.GMAIL_USER = 'test@gmail.com';
    process.env.GMAIL_APP_PASSWORD = 'password';
    mockSendMail.mockRejectedValue(new Error('SMTP Error'));
    
    const getTransporter = () => ({ sendMail: mockSendMail });
    const result = await sendTelegramReactivationEmail({ client }, { getTransporter });
    expect(result.status).toBe(DELIVERY_STATUS.FAILED);
  });

  // --- sendPrivacyRequestNotificationEmail ---

  it('devuelve false si no hay destinatario para privacidad', async () => {
    const result = await sendPrivacyRequestNotificationEmail(client, { id: 'req-1' });
    expect(result).toBe(false);
  });

  it('envia correo de privacidad a TELEGRAM_PRIVACY_CONTACT', async () => {
    process.env.GMAIL_USER = 'test@gmail.com';
    process.env.TELEGRAM_PRIVACY_CONTACT = 'dpo@test.com';
    
    const getTransporter = () => ({ sendMail: mockSendMail });
    const result = await sendPrivacyRequestNotificationEmail(client, { id: 'req-1' }, { getTransporter });
    expect(result).toBe(true);
    expect(mockSendMail).toHaveBeenCalled();
  });

  it('captura error al enviar correo de privacidad', async () => {
    process.env.GMAIL_USER = 'test@gmail.com';
    process.env.TELEGRAM_PRIVACY_CONTACT = 'dpo@test.com';
    mockSendMail.mockRejectedValue(new Error('SMTP Error'));
    
    const getTransporter = () => ({ sendMail: mockSendMail });
    const result = await sendPrivacyRequestNotificationEmail(client, { id: 'req-1' }, { getTransporter });
    expect(result).toBe(false);
  });
});
