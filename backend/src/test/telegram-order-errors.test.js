import { beforeAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let telegramPrivate;

beforeAll(() => {
  const telegramRouter = require('../routes/telegram.js');
  telegramPrivate = telegramRouter._private;
});

describe('flujo Telegram exclusivamente por botones', () => {
  it('genera una confirmacion con cantidad y selecciones', () => {
    const message = telegramPrivate.orderConfirmation(
      {
        quantity: 2,
        sopa: 'Locro',
        segundo: 'Seco de pollo',
        guarnicion: 'Ensalada',
      },
      { id_orden: 'order-1', duplicate: false },
    );

    expect(message).toContain('registrada con éxito');
    expect(message).toContain('Cantidad:</b> 2');
    expect(message).toContain('Sopa:</b> Locro');
    expect(message).toContain('Plato fuerte:</b> Seco de pollo');
    expect(message).toContain('Guarnición:</b> Ensalada');
    expect(message).toContain('Número de Orden:</b> <code>order-1</code>');
  });

  it('extrae el token de un deep link y rechaza texto ordinario como start', () => {
    expect(telegramPrivate.parseStartToken('/start abc_DEF-123')).toEqual({
      isStart: true,
      token: 'abc_DEF-123',
    });
    expect(telegramPrivate.parseStartToken('/start@ECIENCIATESTEBOT token-123')).toEqual({
      isStart: true,
      token: 'token-123',
    });
    expect(telegramPrivate.parseStartToken('quiero lo de siempre')).toBeNull();
  });

  it('solo considera verificado un contacto que pertenece al remitente', () => {
    const verified = telegramPrivate.readUpdate({
      update_id: 10,
      message: {
        message_id: 20,
        chat: { id: 100 },
        from: { id: 100, username: 'cliente' },
        contact: { user_id: 100, phone_number: '+593999999999' },
      },
    });
    const shared = telegramPrivate.readUpdate({
      update_id: 11,
      message: {
        message_id: 21,
        chat: { id: 100 },
        from: { id: 100 },
        contact: { user_id: 200, phone_number: '+593999999999' },
      },
    });
    const unverifiable = telegramPrivate.readUpdate({
      update_id: 12,
      message: {
        message_id: 22,
        chat: { id: 100 },
        from: { id: 100 },
        contact: { phone_number: '+593999999999' },
      },
    });

    expect(verified.contactVerified).toBe(true);
    expect(shared.contactVerified).toBe(false);
    expect(unverifiable.contactVerified).toBe(false);
  });

  it('lee callbacks sin convertirlos en pedidos de texto', () => {
    expect(
      telegramPrivate.readUpdate({
        update_id: 20,
        callback_query: {
          id: 'callback-1',
          data: 'quantity:3',
          from: { id: 100 },
          message: { message_id: 30, chat: { id: 100 } },
        },
      }),
    ).toMatchObject({
      text: 'quantity:3',
      isCallback: true,
      callbackId: 'callback-1',
      contactPhone: '',
    });
  });
});
