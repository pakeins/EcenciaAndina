import { describe, expect, it } from 'vitest';
import outlookMail from '../services/outlookMail.js';

const { buildInvitationEmail } = outlookMail;

describe('buildInvitationEmail', () => {
  it('genera correo HTML con imagen enlazada, link de respaldo y firma', () => {
    const inviteLink = 'https://t.me/EcenciaBot?start=abc123';
    const email = buildInvitationEmail({
      nombre: 'Alex <script>',
      inviteLink,
      env: {
        PUBLIC_BACKEND_URL: 'https://backend.example.com/',
        OUTLOOK_FROM_EMAIL: 'ecenciaconvenios@outlook.com',
      },
    });

    expect(email.subject).toBe('Tu invitacion al bot de ECencia Andina');
    expect(email.html).toContain('api.qrserver.com/v1/create-qr-code');
    expect(email.html).toContain(`href="${inviteLink}"`);
    expect(email.html).toContain('CONECTAR TELEGRAM');
    expect(email.html).toContain('Tu cuenta corporativa ha sido creada exitosamente.');
    expect(email.text).toContain(inviteLink);
    expect(email.text).toContain('Equipo ECencia Andina');
  });

  it('mantiene boton y link aunque no haya URL publica para la imagen', () => {
    const inviteLink = 'https://t.me/EcenciaBot?start=abc123';
    const email = buildInvitationEmail({
      nombre: 'Ana',
      inviteLink,
      env: {
        OUTLOOK_FROM_EMAIL: 'ecenciaconvenios@outlook.com',
      },
    });

    expect(email.html).not.toContain('telegram-invite-cta.png');
    expect(email.html).toContain(`href="${inviteLink}"`);
    expect(email.text).toContain(inviteLink);
  });
});
