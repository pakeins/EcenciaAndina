import { describe, expect, it } from 'vitest';
import outlookMail from '../services/outlookMail.js';

const { buildInvitationEmail } = outlookMail;

describe('buildInvitationEmail', () => {
  it('genera correo HTML con enlace y antiguo formato', () => {
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
    expect(email.html).toContain(`href="${inviteLink}"`);
    expect(email.html).toContain('Si el bot&oacute;n o la imagen no abre');
    expect(email.html).toContain('ecenciaconvenios@outlook.com');
    expect(email.html).toContain('Alex &lt;script&gt;');
    expect(email.html).not.toContain('Alex <script>');
    expect(email.text).toContain(inviteLink);
  });

  it('mantiene boton y link aunque no haya URL publica', () => {
    const inviteLink = 'https://t.me/EcenciaBot?start=abc123';
    const email = buildInvitationEmail({
      nombre: 'Ana',
      inviteLink,
      env: {
        OUTLOOK_FROM_EMAIL: 'ecenciaconvenios@outlook.com',
      },
    });

    expect(email.html).toContain(`href="${inviteLink}"`);
    expect(email.text).toContain(inviteLink);
  });
});
