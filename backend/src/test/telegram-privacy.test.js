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
    order() { return this; }
    limit() { return this; }
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

beforeAll(async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  process.env.TELEGRAM_BOT_USERNAME = 'ecencia_test_bot';
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

  delete require.cache[require.resolve('../routes/telegram.js')];
  const telegramRouter = (await import('../routes/telegram.js')).default;
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
  fakeClient = makeClient();
  sendTelegramMessage.mockClear();
  writes = [];
  store = {
    telegram_subscriptions: [
      {
        id: 'sub-active',
        chat_id: '12345',
        id_cliente: 'cli-1',
        consent_status: 'accepted',
        consent_version: 'EC-LOPDP-TEST',
        is_active: true,
      },
      {
        id: 'sub-revoked',
        chat_id: '99999',
        id_cliente: 'cli-2',
        consent_status: 'rejected',
        is_active: false,
      },
    ],
    clientes: [
      {
        id_cliente: 'cli-1',
        nombre: 'Juan',
        apellido: 'Perez',
        correo: 'juan@test.com',
        esta_activo: true,
      }
    ],
    telegram_privacy_requests: [],
  };
});

describe('Telegram Privacy Flows', () => {
  
  it('responde a /privacidad con la URL de politica', async () => {
    await handleTelegramUpdate({
      message: { message_id: 1, chat: { id: 12345, type: 'private' }, text: '/privacidad', from: { id: 12345 } }
    });
    
    expect(sendTelegramMessage).toHaveBeenCalled();
    const callArgs = sendTelegramMessage.mock.calls[0];
    expect(callArgs[0]).toBe('12345');
    expect(callArgs[1]).toContain('🛡️ <b>Centro de Privacidad</b>');
    expect(callArgs[1]).toContain(process.env.TELEGRAM_PRIVACY_POLICY_URL);
  });

  it('procesa /misdatos para usuarios activos', async () => {
    await handleTelegramUpdate({
      message: { message_id: 2, chat: { id: 12345, type: 'private' }, text: '/misdatos', from: { id: 12345 } }
    });
    
    expect(sendTelegramMessage).toHaveBeenCalled();
    const callArgs = sendTelegramMessage.mock.calls[0];
    expect(callArgs[0]).toBe('12345');
    expect(callArgs[1]).toContain('📁 <b>Tus Datos Personales</b>');
    expect(callArgs[1]).toContain('privacy@example.test');
  });

  it('bloquea el uso de comandos a usuarios revocados', async () => {
    await handleTelegramUpdate({
      message: { message_id: 3, chat: { id: 99999, type: 'private' }, text: '/menu', from: { id: 99999 } }
    });
    
    expect(sendTelegramMessage).toHaveBeenCalled();
    const callArgs = sendTelegramMessage.mock.calls[0];
    expect(callArgs[0]).toBe('99999');
    expect(callArgs[1]).toContain('🚫 <b>Suscripcion Bloqueada</b>');
  });

  it('inicia el proceso de /eliminarmisdatos insertando un request si no hay pendientes', async () => {
    await handleTelegramUpdate({
      message: { message_id: 4, chat: { id: 12345, type: 'private' }, text: '/eliminarmisdatos', from: { id: 12345 } }
    });
    
    // Deberia haber insertado en telegram_privacy_requests
    const privacyInsert = writes.find(w => w.table === 'telegram_privacy_requests' && w.op === 'insert');
    expect(privacyInsert).toBeDefined();
    expect(privacyInsert.payload.request_type).toBe('deletion');
    expect(privacyInsert.payload.id_cliente).toBe('cli-1');
    expect(privacyInsert.payload.status).toBe('pending');
    
    // NOTA: telegram_subscriptions se actualiza solo cuando el admin aprueba/resuelve.    
    // Deberia notificar al usuario
    expect(sendTelegramMessage).toHaveBeenCalled();
    const callArgs = sendTelegramMessage.mock.calls[0];
    expect(callArgs[1]).toContain('🗑️ <b>Solicitud Recibida</b>');
  });

  it('bloquea /eliminarmisdatos si ya hay una solicitud pendiente', async () => {
    store.telegram_privacy_requests.push({
      id: 'req-1',
      id_cliente: 'cli-1',
      status: 'pending'
    });

    await handleTelegramUpdate({
      message: { message_id: 5, chat: { id: 12345, type: 'private' }, text: '/eliminarmisdatos', from: { id: 12345 } }
    });
    
    // NO deberia insertar una nueva
    const privacyInsert = writes.find(w => w.table === 'telegram_privacy_requests' && w.op === 'insert');
    expect(privacyInsert).toBeUndefined();
    
    // Deberia decir que esta en curso
    expect(sendTelegramMessage).toHaveBeenCalled();
    const callArgs = sendTelegramMessage.mock.calls[0];
    expect(callArgs[1]).toContain('⏳ <b>Solicitud en curso</b>');
  });

  it('muestra botones de confirmacion al usar /revocar', async () => {
    await handleTelegramUpdate({
      message: { message_id: 6, chat: { id: 12345, type: 'private' }, text: '/revocar', from: { id: 12345 } }
    });
    
    expect(sendTelegramMessage).toHaveBeenCalled();
    const callArgs = sendTelegramMessage.mock.calls[0];
    expect(callArgs[1]).toContain('Confirma tu decision:');
    // Tiene que mandar el inline keyboard
    expect(callArgs[2].inline_keyboard).toBeDefined();
  });
});
