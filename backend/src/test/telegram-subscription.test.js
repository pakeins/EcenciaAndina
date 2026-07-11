import { describe, expect, it } from 'vitest';
import consent from '../services/telegramConsent.js';

const invitation = (patch = {}) => ({
  id: 'invite-1',
  id_cliente: 'client-1',
  expires_at: new Date(Date.now() + 60_000).toISOString(),
  claimed_at: null,
  claimed_chat_id: null,
  consumed_at: null,
  revoked_at: null,
  clientes: { id_cliente: 'client-1', esta_activo: true },
  ...patch,
});

describe('invitaciones Telegram', () => {
  it('usa HMAC-SHA256 y un token alterado produce otro hash', () => {
    const validHash = consent.hmacHex('token-original');
    expect(validHash).toMatch(/^[a-f0-9]{64}$/);
    expect(consent.hmacHex('token-alterado')).not.toBe(validHash);
  });

  it('bloquea invitaciones expiradas, consumidas o revocadas', () => {
    expect(
      consent.invitationAvailability(
        invitation({ expires_at: new Date(Date.now() - 1).toISOString() }),
        'chat-1',
      ),
    ).toMatchObject({ valid: false, reason: 'expired' });
    expect(
      consent.invitationAvailability(invitation({ consumed_at: new Date().toISOString() }), 'chat-1'),
    ).toMatchObject({ valid: false, reason: 'consumed' });
    expect(
      consent.invitationAvailability(invitation({ revoked_at: new Date().toISOString() }), 'chat-1'),
    ).toMatchObject({ valid: false, reason: 'revoked' });
  });

  it('impide que un enlace reclamado se comparta con otro chat', () => {
    expect(
      consent.invitationAvailability(
        invitation({ claimed_at: new Date().toISOString(), claimed_chat_id: 'chat-1' }),
        'chat-2',
      ),
    ).toMatchObject({ valid: false, reason: 'claimed' });
    expect(
      consent.invitationAvailability(
        invitation({ claimed_at: new Date().toISOString(), claimed_chat_id: 'chat-1' }),
        'chat-1',
      ),
    ).toMatchObject({ valid: true });
  });

  it('revoca la invitacion abierta anterior antes de crear otra y nunca persiste el token', async () => {
    const updates = [];
    const inserts = [];
    const fakeClient = {
      from(table) {
        expect(table).toBe('telegram_invitations');
        return {
          update(payload) {
            updates.push(payload);
            return {
              eq() {
                return {
                  is() {
                    return {
                      async is() {
                        return { error: null };
                      },
                    };
                  },
                };
              },
            };
          },
          insert(payload) {
            inserts.push(payload);
            return {
              select() {
                return {
                  async single() {
                    return {
                      data: {
                        id: 'invite-new',
                        expires_at: new Date(Date.now() + consent.INVITATION_TTL_MS).toISOString(),
                      },
                      error: null,
                    };
                  },
                };
              },
            };
          },
        };
      },
    };

    const result = await consent.createInvitation('client-1', 'admin-1', () => fakeClient);

    expect(updates).toHaveLength(1);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).not.toHaveProperty('token');
    expect(inserts[0].token_hmac).toMatch(/^[a-f0-9]{64}$/);
    expect(result.onboarding_url).toMatch(/^https:\/\/t\.me\/ecencia_test_bot\?start=/);
    expect(result.onboarding_url).not.toContain(inserts[0].token_hmac);
  });
});
