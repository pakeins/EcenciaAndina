import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

let store;
let writes;

const makeClient = () => {
  class Q {
    constructor(table) { this.t = table; this.f = []; this.op = 'select'; this.payload = null; }
    select() { return this; }
    insert(p) { this.op = 'insert'; this.payload = p; return this; }
    update(p) { this.op = 'update'; this.payload = p; return this; }
    upsert(p) { this.op = 'upsert'; this.payload = p; return this; }
    delete() { this.op = 'delete'; return this; }
    eq(c, v) { this.f.push(['eq', c, v]); return this; }
    neq(c, v) { this.f.push(['neq', c, v]); return this; }
    in(c, v) { this.f.push(['in', c, v]); return this; }
    _rows() {
      let rows = (store[this.t] || []).slice();
      for (const [op, c, v] of this.f) {
        if (op === 'eq') rows = rows.filter((r) => String(r[c]) === String(v));
        else if (op === 'neq') rows = rows.filter((r) => String(r[c]) !== String(v));
        else if (op === 'in') rows = rows.filter((r) => v.map(String).includes(String(r[c])));
      }
      return rows;
    }
    _record() { writes.push({ table: this.t, op: this.op, payload: this.payload, filters: this.f }); }
    maybeSingle() { return Promise.resolve({ data: this._rows()[0] || null, error: null }); }
    single() {
      if (this.op === 'select') return Promise.resolve({ data: this._rows()[0] || null, error: null });
      this._record();
      const base = Array.isArray(this.payload) ? this.payload[0] : this.payload;
      return Promise.resolve({ data: { id: `id-${writes.length}`, ...base }, error: null });
    }
    then(resolve, reject) {
      if (this.op === 'select') return Promise.resolve({ data: this._rows(), error: null }).then(resolve, reject);
      this._record();
      return Promise.resolve({ error: null }).then(resolve, reject);
    }
  }
  return { from: (t) => new Q(t) };
};

let fakeClient;
let sendTelegramMessage;
let handleTelegramUpdate;

const injectModule = (relPath, exportsObj) => {
  const filename = require.resolve(relPath);
  require.cache[filename] = { id: filename, filename, loaded: true, exports: exportsObj, children: [], paths: [] };
};

beforeAll(() => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  process.env.TELEGRAM_BOT_USERNAME = 'eciencia_test_bot';
  process.env.TELEGRAM_PRIVACY_CONTACT = 'privacy@example.test';
  process.env.TELEGRAM_PRIVACY_POLICY_URL = 'https://example.test/privacidad';
  process.env.TELEGRAM_CONSENT_VERSION = 'EC-LOPDP-TEST';
  process.env.TELEGRAM_INVITE_TOKEN_SECRET = 'test-secret-at-least-32-characters-long';

  sendTelegramMessage = vi.fn(async () => ({ ok: true }));
  injectModule('../config/supabase.js', { getAdminClient: () => fakeClient });
  injectModule('../services/telegramBot.js', {
    sendTelegramMessage: (...a) => sendTelegramMessage(...a),
    answerTelegramCallback: async () => ({ ok: true }),
    telegramRequest: async () => ({ ok: true }),
  });
  injectModule('../services/telegramApi.js', {
    sendMessage: (...a) => sendTelegramMessage(...a),
    answerCallback: async () => ({ ok: true }),
    deleteMessage: async () => ({ ok: true }),
    removeInlineKeyboard: async () => ({ ok: true }),
    telegramRequest: async () => ({ ok: true }),
  });
  injectModule('../services/telegramOrderTrace.js', {
    createOrderTrace: async () => 'trace-1',
    updateOrderTrace: async () => true,
  });

  delete require.cache[require.resolve('../services/orderNotifications.js')];
  delete require.cache[require.resolve('../services/orderLifecycle.js')];
  delete require.cache[require.resolve('../services/telegramConsent.js')];
  delete require.cache[require.resolve('../routes/telegram.js')];
  const telegramRouter = require('../routes/telegram.js');
  handleTelegramUpdate = telegramRouter.handleTelegramUpdate;
});

afterAll(() => {
  [
    '../config/supabase.js',
    '../services/telegramBot.js',
    '../services/telegramApi.js',
    '../services/telegramOrderTrace.js',
    '../services/telegramConsent.js',
    '../services/orderNotifications.js',
    '../services/orderLifecycle.js',
    '../routes/telegram.js',
  ].forEach((relPath) => {
    try { delete require.cache[require.resolve(relPath)]; } catch { /* noop */ }
  });
});

beforeEach(() => {
  store = {};
  writes = [];
  fakeClient = makeClient();
  sendTelegramMessage.mockClear();
});

const textUpdate = (chatId, text) => ({ message: { chat: { id: chatId }, from: { id: chatId }, text } });
const contactUpdate = (chatId, phone) => ({
  message: {
    chat: { id: chatId },
    from: { id: chatId },
    contact: { phone_number: phone, user_id: chatId },
  },
});

describe('handleTelegramUpdate — consentimiento y comandos', () => {
  it('/start sin suscripcion muestra el aviso de consentimiento', async () => {
    await handleTelegramUpdate(textUpdate(100, '/start'));

    expect(sendTelegramMessage).toHaveBeenCalled();
    // promptConsent crea/actualiza la suscripcion en estado pending
    const subWrite = writes.find((w) => w.table === 'telegram_subscriptions');
    expect(subWrite).toBeTruthy();
    expect(subWrite.payload.consent_status).toBe('pending');
  });

  it('/start con cliente ya vinculado no envia el menu automaticamente', async () => {
    store.telegram_subscriptions = [
      { id: 's1', chat_id: '100', consent_status: 'accepted', is_active: true, id_cliente: 'client-1', consent_notice_version: 'EC-LOPDP-TEST' },
    ];
    store.clientes = [
      {
        id_cliente: 'client-1',
        cedula: '1712345675',
        nombre: 'Alex',
        apellido: 'Rentupap',
        telefono: '593986331362',
        esta_activo: true,
        clientes_convenios: [],
      },
    ];

    await handleTelegramUpdate(textUpdate(100, '/start'));

    expect(sendTelegramMessage).toHaveBeenCalledTimes(1);
    expect(sendTelegramMessage.mock.calls[0][0]).toBe('100');
    expect(sendTelegramMessage.mock.calls[0][1]).toContain('Recibiras el menu cuando Ecencia Andina lo envie');
    expect(sendTelegramMessage.mock.calls[0][1]).not.toContain('Menu del dia');
  });

  it('consent:accept deja la suscripcion pending y guarda el paso de consentimiento', async () => {
    store.telegram_subscriptions = [
      { id: 's1', chat_id: '100', consent_status: 'pending', is_active: false, id_cliente: 'client-1' },
    ];
    store.telegram_bot_state = [
      { key: 'consent:100', value: { status: 'awaiting_decision', idCliente: 'client-1', subscriptionId: 's1', policyVersion: 'EC-LOPDP-TEST' } },
    ];

    await handleTelegramUpdate(textUpdate(100, 'consent:accept'));

    expect(writes.some((w) => w.table === 'telegram_subscriptions')).toBe(true);
    expect(writes.some((w) => w.table === 'telegram_bot_state' && w.op === 'upsert')).toBe(true);
    expect(sendTelegramMessage).toHaveBeenCalled();
  });

  it('consent:reject marca rechazo y no vuelve a escribir telefono', async () => {
    store.telegram_subscriptions = [
      { id: 's1', chat_id: '100', consent_status: 'pending', is_active: false, id_cliente: 'client-1' },
    ];
    store.telegram_bot_state = [
      { key: 'consent:100', value: { status: 'awaiting_decision', idCliente: 'client-1', subscriptionId: 's1', policyVersion: 'EC-LOPDP-TEST' } },
    ];

    await handleTelegramUpdate(textUpdate(100, 'consent:reject'));

    const subWrite = writes.find((w) => w.table === 'telegram_subscriptions');
    expect(subWrite.payload.consent_status).toBe('rejected');
    expect(subWrite.payload.is_active).toBe(false);
    expect(sendTelegramMessage).toHaveBeenCalled();
  });

  it('si escribe el telefono como texto durante el registro le pide usar el boton de contacto', async () => {
    store.telegram_subscriptions = [{ id: 's1', chat_id: '100', consent_status: 'pending', is_active: true }];
    store.telegram_bot_state = [{ key: 'consent:100', value: { status: 'accepted_pending_phone', idCliente: 'client-1', inviteToken: 'tok' } }];

    await handleTelegramUpdate(textUpdate(100, '0986331362'));

    expect(sendTelegramMessage).toHaveBeenCalledWith(
      '100',
      expect.stringContaining('Compartir mi telefono'),
      expect.objectContaining({
        keyboard: expect.any(Array),
      }),
      'HTML'
    );
  });

  it('cuando comparte contacto completa el registro sin enviar el menu automaticamente', async () => {
    store.telegram_subscriptions = [
      { id: 'chat-row', chat_id: '100', consent_status: 'pending', is_active: true },
      { id: 'phone-row', phone_normalized: '593986331362', consent_status: 'pending', is_active: true },
    ];
    store.telegram_bot_state = [{ key: 'consent:100', value: { status: 'accepted_pending_phone', idCliente: 'client-1', inviteToken: 'tok' } }];
    store.clientes = [
      {
        id_cliente: 'client-1',
        cedula: '1712345675',
        nombre: 'Alex',
        apellido: 'Rentupap',
        telefono: '593986331362',
        esta_activo: true,
        clientes_convenios: [],
      },
    ];

    await handleTelegramUpdate(contactUpdate(100, '+593986331362'));

    expect(sendTelegramMessage).toHaveBeenCalledTimes(1);
    expect(sendTelegramMessage.mock.calls[0][0]).toBe('100');
    expect(sendTelegramMessage.mock.calls[0][1]).toContain('tu Telegram quedo vinculado con tu registro de cliente');
    expect(sendTelegramMessage.mock.calls[0][1]).not.toContain('Menu del dia');
  });

  it('/cancelar borra el estado de la sesion', async () => {
    await handleTelegramUpdate(textUpdate(100, '/cancelar'));

    expect(writes.some((w) => w.table === 'telegram_bot_state' && w.op === 'delete')).toBe(true);
  });

  it('ignora mensajes de un chat con consentimiento rechazado', async () => {
    store.telegram_subscriptions = [{ id: 's1', chat_id: '100', consent_status: 'rejected' }];

    await handleTelegramUpdate(textUpdate(100, 'hola, quiero almorzar'));

    expect(sendTelegramMessage).not.toHaveBeenCalled();
    expect(writes).toHaveLength(0);
  });

  it('no responde si no hay chatId en el update', async () => {
    await handleTelegramUpdate({ message: { text: '/start' } });
    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });
});
