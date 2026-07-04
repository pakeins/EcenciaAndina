import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildInvitationEmail } = require('../services/outlookMail.js');

describe('buildInvitationEmail', () => {
  it('genera correo HTML con imagen enlazada, link de respaldo y firma', () => {
    const inviteLink = 'https://t.me/EcienciaBot?start=abc123';
    const email = buildInvitationEmail({
      nombre: 'Alex <script>',
      inviteLink,
      env: {
        PUBLIC_BACKEND_URL: 'https://backend.example.com/',
        OUTLOOK_FROM_EMAIL: 'ecenciaconvenios@outlook.com',
      },
    });

    expect(email.subject).toBe('Tu invitacion al bot de ECencia Andina');
    expect(email.html).toContain('src="https://backend.example.com/assets/email/telegram-invite-cta.png"');
    expect(email.html).toContain(`href="${inviteLink}"`);
    expect(email.html).toContain('Si el bot&oacute;n o la imagen no abre');
    expect(email.html).toContain('Equipo ECencia Andina');
    expect(email.html).toContain('ecenciaconvenios@outlook.com');
    expect(email.html).toContain('Alex &lt;script&gt;');
    expect(email.html).not.toContain('Alex <script>');
    expect(email.text).toContain(inviteLink);
    expect(email.text).toContain('Equipo ECencia Andina');
  });

  it('mantiene boton y link aunque no haya URL publica para la imagen', () => {
    const inviteLink = 'https://t.me/EcienciaBot?start=abc123';
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
