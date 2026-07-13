import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../../index.js';

describe('static email assets', () => {
  it('sirve la imagen CTA de invitacion por correo', async () => {
    const response = await request(app)
      .get('/assets/email/telegram-invite-cta.png')
      .expect(200);

    expect(response.headers['content-type']).toContain('image/png');
    expect(Number(response.headers['content-length'])).toBeGreaterThan(1000);
  });

  it('responde con cabeceras de seguridad (helmet + Permissions-Policy)', async () => {
    const response = await request(app).get('/assets/email/telegram-invite-cta.png');

    expect(response.headers['permissions-policy']).toBe('camera=(), microphone=(), geolocation=()');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-security-policy']).toBeTruthy();
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});
