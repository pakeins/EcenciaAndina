import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

let store;
let writes;

// Mock de Supabase con estado: los upsert/insert/update/delete mutan `store`
// para poder simular flujos de varios pasos (sesion -> confirmacion).
const makeClient = () => {
  class Q {
    constructor(table) { this.t = table; this.f = []; this.op = 'select'; this.payload = null; }
    select() { return this; }
    insert(p) { this.op = 'insert'; this.payload = p; return this; }
    update(p) { this.op = 'update'; this.payload = p; return this; }
    upsert(p) { this.op = 'upsert'; this.payload = p; return this; }
    delete() { this.op = 'delete'; return this; }
    eq(c, v) { this.f.push(['eq', c, v]); return this; }
    gte(c, v) { this.f.push(['gte', c, v]); return this; }
    lt(c, v) { this.f.push(['lt', c, v]); return this; }
    ilike(c, v) { this.f.push(['ilike', c, v]); return this; }
    in(c, v) { this.f.push(['in', c, v]); return this; }
    limit() { return this; }
    order() { return this; }
    _rows() {
      let rows = (store[this.t] || []).slice();
      for (const [op, c, v] of this.f) {
        if (op === 'eq') rows = rows.filter((r) => String(r[c]) === String(v));
        else if (op === 'gte') rows = rows.filter((r) => String(r[c]) >= String(v));
        else if (op === 'lt') rows = rows.filter((r) => String(r[c]) < String(v));
        else if (op === 'ilike') rows = rows.filter((r) => String(r[c]).toLowerCase() === String(v).toLowerCase());
        else if (op === 'in') rows = rows.filter((r) => v.map(String).includes(String(r[c])));
      }
      return rows;
    }
    _record() { writes.push({ table: this.t, op: this.op, payload: this.payload, filters: this.f }); }
    _apply() {
      store[this.t] = store[this.t] || [];
      if (this.op === 'insert') {
        const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
        store[this.t].push(...rows.map((row) => ({ ...row })));
        return;
      }
      if (this.op === 'upsert') {
        const row = { ...this.payload };
        const match = row.key ? store[this.t].find((r) => r.key === row.key) : null;
        if (match) Object.assign(match, row);
        else store[this.t].push(row);
        return;
      }
      if (this.op === 'update') {
        for (const row of this._rows()) Object.assign(row, this.payload);
        return;
      }
      if (this.op === 'delete') {
        const doomed = new Set(this._rows());
        store[this.t] = store[this.t].filter((row) => !doomed.has(row));
      }
    }
    maybeSingle() {
      if (this.op === 'select') return Promise.resolve({ data: this._rows()[0] || null, error: null });
      this._record();
      const row = this._rows()[0] || null;
      this._apply();
      return Promise.resolve({ data: row, error: null });
    }
    single() {
      if (this.op === 'select') return Promise.resolve({ data: this._rows()[0] || null, error: null });
      this._record();
      const base = Array.isArray(this.payload) ? this.payload[0] : this.payload;
      const created = { id: `id-${writes.length}`, id_orden: `id-${writes.length}`, ...base };
      if (this.op === 'insert') {
        store[this.t] = store[this.t] || [];
        store[this.t].push(created);
        return Promise.resolve({ data: created, error: null });
      }
      const row = this._rows()[0] || null;
      this._apply();
      return Promise.resolve({ data: row || created, error: null });
    }
    then(resolve, reject) {
      if (this.op === 'select') return Promise.resolve({ data: this._rows(), error: null }).then(resolve, reject);
      this._record();
      this._apply();
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
  process.env.TELEGRAM_PRIVACY_CONTACT = 'privacidad@ecencia.test';

  sendTelegramMessage = vi.fn(async () => ({ ok: true }));
  injectModule('../config/supabase.js', { getAdminClient: () => fakeClient });
  injectModule('../services/telegramBot.js', {
    sendTelegramMessage: (...a) => sendTelegramMessage(...a),
    answerTelegramCallback: async () => ({ ok: true }),
    telegramRequest: async () => ({ ok: true }),
  });
  injectModule('../services/telegramOrderTrace.js', {
    createOrderTrace: async () => 'trace-1',
    updateOrderTrace: async () => true,
  });

  delete require.cache[require.resolve('../services/orderNotifications.js')];
  delete require.cache[require.resolve('../services/orderLifecycle.js')];
  delete require.cache[require.resolve('../routes/telegram.js')];
  const telegramRouter = require('../routes/telegram.js');
  handleTelegramUpdate = telegramRouter.handleTelegramUpdate;
});

afterAll(() => {
  [
    '../config/supabase.js',
    '../services/telegramBot.js',
    '../services/telegramOrderTrace.js',
    '../services/orderNotifications.js',
    '../services/orderLifecycle.js',
    '../routes/telegram.js',
  ].forEach((relPath) => {
    try { delete require.cache[require.resolve(relPath)]; } catch { /* noop */ }
  });
});

// 2026-07-02 es jueves; 15:00Z = 10:00 en America/Bogota (antes del corte 15:00).
const BEFORE_CUTOFF = new Date('2026-07-02T15:00:00Z');
const AFTER_CUTOFF = new Date('2026-07-02T21:00:00Z');
const TODAY = '2026-07-02';

const seedBase = () => {
  store.telegram_subscriptions = [
    { id: 'sub-1', chat_id: '100', consent_status: 'accepted', is_active: true, id_cliente: 'client-1', phone_normalized: '593986331362' },
  ];
  store.clientes = [
    {
      id_cliente: 'client-1',
      cedula: '1712345675',
      nombre: 'Alex',
      apellido: 'Rengifo',
      telefono: '593986331362',
      esta_activo: true,
      clientes_convenios: [],
    },
  ];
  store.estados_orden = [{ id_estado: 1, nombre_estado: 'Reservado' }];
  store.origenes_pedido = [{ id_origen: 1, nombre_origen: 'Telegram' }];
  store.productos = [
    { id_producto: 16, nombre_producto: 'Almuerzo Ejecutivo Completo', precio_unitario: 6.99, esta_activo: true, id_tipo_almuerzo_default: 6 },
    { id_producto: 19, nombre_producto: 'Almuerzo del Dia', precio_unitario: 4.5, esta_activo: true, id_tipo_almuerzo_default: 9 },
    { id_producto: 20, nombre_producto: 'Almuerzo del Dia Simple', precio_unitario: 3.99, esta_activo: true, id_tipo_almuerzo_default: 10 },
  ];
  store.telegram_bot_state = [
    {
      key: 'latest-menu:active',
      value: {
        date: TODAY,
        menu: { sopas: ['Locro', 'Crema'], segundos: ['Seco', 'Estofado'], bebidas: ['Jugo'] },
      },
    },
  ];
};

const seedReservedOrder = () => {
  store.ordenes = [
    {
      id_orden: 'order-1',
      id_cliente: 'client-1',
      id_estado: 1,
      canal_origen: 'Telegram',
      metodo_pago: 'Pendiente',
      created_at: `${TODAY}T13:05:00Z`,
    },
  ];
  store.detalle_orden = [
    {
      id_orden: 'order-1',
      id_producto: 16,
      cantidad: 1,
      precio_aplicado: 6.99,
      id_tipo_almuerzo: 6,
      observaciones_tipo: null,
      opciones: {
        entrada: 'Bolon',
        sopa: 'crema de sapallo',
        segundo: 'Menestra de lenteja',
        tipoAlmuerzo: 'ejecutivo_completo',
        tipoOrigen: 'cliente_elige',
      },
      productos: { nombre_producto: 'Almuerzo Ejecutivo Completo' },
    },
  ];
};

const seedSessionAtConfirm = (sid = 'sid12345') => {
  store.telegram_bot_state.push({
    key: 'session:100',
    value: {
      sid,
      mode: 'new',
      step: 'confirmar',
      date: TODAY,
      menuDate: TODAY,
      menu: { sopas: ['Encebollado', 'Locro'], segundos: ['Pechuga de Pollo', 'Estofado'], bebidas: ['Jugo'] },
      quantity: 1,
      opciones: { sopa: 'Encebollado', segundo: 'Pechuga de Pollo', bebida: 'Jugo' },
      tipoAlmuerzo: { id: 9, code: 'almuerzo_dia', label: 'Almuerzo del Dia $4.50', shortLabel: 'Almuerzo del Dia', price: 4.5 },
      cliente: { id_cliente: 'client-1', nombre: 'Alex' },
      convenio: { id_convenio: null, nombre_empresa: 'Cliente directo' },
      estadoReservadoId: 1,
      origenTelegramId: 1,
    },
  });
};

const textUpdate = (chatId, text) => ({ message: { chat: { id: chatId }, from: { id: chatId }, text } });
const callbackUpdate = (chatId, data) => ({
  update_id: 900,
  callback_query: { id: 'cb-1', data, message: { message_id: 55, chat: { id: chatId } } },
});

const lastMessage = () => sendTelegramMessage.mock.calls.at(-1);
const allMessages = () => sendTelegramMessage.mock.calls.map((call) => call[1]).join('\n---\n');
const keyboardTexts = (markup) => (markup?.inline_keyboard || []).flat().map((btn) => btn.text);

beforeEach(() => {
  store = {};
  writes = [];
  fakeClient = makeClient();
  sendTelegramMessage.mockClear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(BEFORE_CUTOFF);
  seedBase();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('reserva duplicada: se muestra la orden real', () => {
  it('al confirmar con reserva previa responde con los datos reales y no con la nueva seleccion', async () => {
    seedReservedOrder();
    seedSessionAtConfirm();

    await handleTelegramUpdate(callbackUpdate(100, 'confirmar:ok:sid12345'));

    const [, message, markup] = lastMessage();
    expect(message).toContain('Ya tienes una reserva registrada para hoy');
    expect(message).toContain('Tipo: Almuerzo Ejecutivo Completo');
    expect(message).toContain('Sopa: crema de sapallo');
    expect(message).toContain('Plato fuerte: Menestra de lenteja');
    expect(message).toContain('Orden: order-1');
    // La seleccion nueva (Almuerzo del Dia con Encebollado) no se registra ni se muestra.
    expect(message).not.toContain('Encebollado');
    expect(message).not.toContain('Pechuga de Pollo');
    expect(keyboardTexts(markup)).toEqual(['Modificar reserva', 'Cancelar reserva']);
    expect(writes.some((w) => w.table === 'ordenes' && w.op === 'insert')).toBe(false);
  });

  it('/menu con reserva activa muestra la reserva real en lugar de reiniciar la seleccion', async () => {
    seedReservedOrder();

    await handleTelegramUpdate(textUpdate(100, '/menu'));

    const [, message, markup] = lastMessage();
    expect(message).toContain('Ya tienes una reserva registrada para hoy');
    expect(message).toContain('Sopa: crema de sapallo');
    expect(message).toContain('Estado: Reservado');
    expect(keyboardTexts(markup)).toEqual(['Modificar reserva', 'Cancelar reserva']);
    expect(writes.some((w) => w.table === 'telegram_bot_state' && w.op === 'upsert')).toBe(false);
  });

  it('sin reserva previa la confirmacion registra la orden nueva', async () => {
    seedSessionAtConfirm();

    await handleTelegramUpdate(callbackUpdate(100, 'confirmar:ok:sid12345'));

    const [, message] = lastMessage();
    expect(message).toContain('Tu almuerzo quedo reservado');
    expect(writes.some((w) => w.table === 'ordenes' && w.op === 'insert')).toBe(true);
    expect(writes.some((w) => w.table === 'detalle_orden' && w.op === 'insert')).toBe(true);
  });
});

describe('/pedido', () => {
  it('sin reserva del dia invita a reservar', async () => {
    await handleTelegramUpdate(textUpdate(100, '/pedido'));

    expect(lastMessage()[1]).toContain('No tienes una reserva registrada hoy');
  });

  it('con reserva activa muestra el resumen real y botones de gestion', async () => {
    seedReservedOrder();

    await handleTelegramUpdate(textUpdate(100, '/pedido'));

    const [, message, markup] = lastMessage();
    expect(message).toContain('Tu reserva de hoy:');
    expect(message).toContain('Producto: Almuerzo Ejecutivo Completo');
    expect(message).toContain('Orden: order-1');
    expect(keyboardTexts(markup)).toEqual(['Modificar reserva', 'Cancelar reserva']);
  });
});

describe('cancelacion de la reserva real', () => {
  it('pide confirmacion antes de cancelar y cancela solo al confirmar', async () => {
    seedReservedOrder();

    await handleTelegramUpdate(callbackUpdate(100, 'pedido:can:order-1'));

    const [, confirmMessage, confirmMarkup] = lastMessage();
    expect(confirmMessage).toContain('Confirma tu decision');
    expect(keyboardTexts(confirmMarkup)).toEqual(['Si, cancelar mi reserva', 'No, mantener mi reserva']);
    expect(writes.some((w) => w.table === 'ordenes' && w.op === 'update')).toBe(false);

    await handleTelegramUpdate(callbackUpdate(100, 'pedido:can2:order-1'));

    expect(lastMessage()[1]).toContain('Tu reserva fue cancelada');
    const cancelWrite = writes.find((w) => w.table === 'ordenes' && w.op === 'update');
    expect(cancelWrite.payload.id_estado).toBe(3);
    const audit = writes.find((w) => w.table === 'orden_estado_auditoria' && w.op === 'insert');
    expect(audit.payload[0]).toMatchObject({ id_orden: 'order-1', estado_anterior: 1, estado_nuevo: 3 });
  });

  it('mantener la reserva no cambia nada', async () => {
    seedReservedOrder();

    await handleTelegramUpdate(callbackUpdate(100, 'pedido:keep:order-1'));

    expect(lastMessage()[1]).toContain('Tu reserva se mantiene sin cambios');
    expect(writes.some((w) => w.table === 'ordenes' && w.op === 'update')).toBe(false);
  });

  it('una reserva cancelada permite reservar de nuevo con /menu', async () => {
    seedReservedOrder();
    store.ordenes[0].id_estado = 3;

    await handleTelegramUpdate(textUpdate(100, '/menu'));

    expect(lastMessage()[1]).toContain('Menu del dia');
    expect(writes.some((w) => w.table === 'telegram_bot_state' && w.op === 'upsert' && w.payload.key === 'session:100')).toBe(true);
  });

  it('despues de las 15:00 la reserva sigue editable mientras este Reservada', async () => {
    // El cierre automatico (cron) es quien la cancela; el bot ya no bloquea por hora.
    seedReservedOrder();
    vi.setSystemTime(AFTER_CUTOFF);

    await handleTelegramUpdate(callbackUpdate(100, 'pedido:can:order-1'));
    expect(keyboardTexts(lastMessage()[2])).toEqual(['Si, cancelar mi reserva', 'No, mantener mi reserva']);

    await handleTelegramUpdate(callbackUpdate(100, 'pedido:can2:order-1'));
    expect(lastMessage()[1]).toContain('Tu reserva fue cancelada');
  });

  it('una reserva ya cancelada no se puede volver a cancelar', async () => {
    seedReservedOrder();
    store.ordenes[0].id_estado = 3;

    await handleTelegramUpdate(callbackUpdate(100, 'pedido:can:order-1'));

    expect(lastMessage()[1]).toContain('ya no esta en estado Reservado');
    expect(writes.some((w) => w.table === 'ordenes' && w.op === 'update')).toBe(false);
  });

  it('con ECIENCIA_BUSINESS_DAYS_ONLY=false el bot atiende /menu en fin de semana', async () => {
    // 2026-07-04 es sabado en America/Bogota.
    vi.setSystemTime(new Date('2026-07-04T15:00:00Z'));

    await handleTelegramUpdate(textUpdate(100, '/menu'));
    expect(lastMessage()[1]).toContain('lunes a viernes');

    process.env.ECIENCIA_BUSINESS_DAYS_ONLY = 'false';
    try {
      sendTelegramMessage.mockClear();
      await handleTelegramUpdate(textUpdate(100, '/menu'));
      expect(lastMessage()[1]).toContain('Menu del dia');
    } finally {
      delete process.env.ECIENCIA_BUSINESS_DAYS_ONLY;
    }
  });
});

describe('modificacion de la reserva real', () => {
  it('modifica el detalle conservando el mismo id_orden', async () => {
    seedReservedOrder();

    await handleTelegramUpdate(callbackUpdate(100, 'pedido:mod:order-1'));
    expect(lastMessage()[1]).toContain('Vamos a modificar tu reserva');

    const session = store.telegram_bot_state.find((row) => row.key === 'session:100').value;
    expect(session.mode).toBe('modify');
    expect(session.orderId).toBe('order-1');

    await handleTelegramUpdate(callbackUpdate(100, `tipo:almuerzo_dia_simple:${session.sid}`));
    await handleTelegramUpdate(callbackUpdate(100, `segundo:0:${session.sid}`));
    await handleTelegramUpdate(callbackUpdate(100, `confirmar:ok:${session.sid}`));

    const [, message] = lastMessage();
    expect(message).toContain('Tu reserva quedo actualizada');
    expect(message).toContain('Tipo: Almuerzo del Dia Simple');
    expect(message).toContain('Orden: order-1');

    const detailUpdate = writes.find((w) => w.table === 'detalle_orden' && w.op === 'update');
    expect(detailUpdate.payload.id_tipo_almuerzo).toBe(10);
    expect(detailUpdate.filters).toContainEqual(['eq', 'id_orden', 'order-1']);
    expect(writes.some((w) => w.table === 'ordenes' && w.op === 'insert')).toBe(false);
  });

  it('rechaza modificar cuando la orden ya no esta reservada', async () => {
    seedReservedOrder();
    store.ordenes[0].id_estado = 2;

    await handleTelegramUpdate(callbackUpdate(100, 'pedido:mod:order-1'));

    expect(lastMessage()[1]).toContain('ya no esta en estado Reservado');
    expect(store.telegram_bot_state.some((row) => row.key === 'session:100')).toBe(false);
  });
});

describe('callbacks versionados por sesion', () => {
  it('rechaza botones de un menu anterior sin borrar la sesion vigente', async () => {
    seedReservedOrder();
    seedSessionAtConfirm('sid-nuevo');

    await handleTelegramUpdate(callbackUpdate(100, 'confirmar:ok:sid-viejo'));

    expect(lastMessage()[1]).toContain('menu anterior');
    expect(store.telegram_bot_state.some((row) => row.key === 'session:100')).toBe(true);
    expect(writes.some((w) => w.table === 'ordenes')).toBe(false);
  });

  it('acepta callbacks sin sid para sesiones legadas', async () => {
    seedSessionAtConfirm();
    const session = store.telegram_bot_state.find((row) => row.key === 'session:100').value;
    delete session.sid;

    await handleTelegramUpdate(callbackUpdate(100, 'confirmar:ok'));

    expect(lastMessage()[1]).toContain('Tu almuerzo quedo reservado');
  });
});

describe('privacidad y revocacion', () => {
  it('/misdatos informa categorias sin exponer valores y audita', async () => {
    await handleTelegramUpdate(textUpdate(100, '/misdatos'));

    const [, message] = lastMessage();
    expect(message).toContain('Identificador del chat de Telegram');
    expect(message).toContain('Estado del consentimiento: accepted');
    expect(message).not.toContain('593986331362');
    expect(message).not.toContain('Alex');
    const audit = writes.find((w) => w.table === 'telegram_privacy_audits');
    expect(audit.payload).toMatchObject({ action: 'misdatos', outcome: 'informed', chat_id: '100' });
  });

  it('/eliminarmisdatos registra la solicitud e indica el contacto', async () => {
    await handleTelegramUpdate(textUpdate(100, '/eliminarmisdatos'));

    expect(lastMessage()[1]).toContain('privacidad@ecencia.test');
    const audit = writes.find((w) => w.table === 'telegram_privacy_audits');
    expect(audit.payload).toMatchObject({ action: 'eliminarmisdatos', outcome: 'informed' });
  });

  it('/revocar pide confirmacion y revocar:confirm bloquea la suscripcion', async () => {
    await handleTelegramUpdate(textUpdate(100, '/revocar'));
    expect(keyboardTexts(lastMessage()[2])).toEqual(['Si, revocar mi consentimiento', 'No, mantener mi acceso']);

    await handleTelegramUpdate(callbackUpdate(100, 'revocar:confirm'));

    expect(lastMessage()[1]).toContain('Tu consentimiento quedo revocado');
    const subWrite = writes.find((w) => w.table === 'telegram_subscriptions' && w.op === 'update');
    expect(subWrite.payload).toMatchObject({ consent_status: 'rejected', is_active: false });
    const audit = writes.find((w) => w.table === 'telegram_privacy_audits');
    expect(audit.payload).toMatchObject({ action: 'revocar', outcome: 'revoked' });

    // Con el consentimiento revocado el bot ignora los mensajes siguientes.
    sendTelegramMessage.mockClear();
    await handleTelegramUpdate(textUpdate(100, '/menu'));
    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });

  it('/ayuda lista los comandos disponibles', async () => {
    await handleTelegramUpdate(textUpdate(100, '/ayuda'));

    const [, message] = lastMessage();
    expect(message).toContain('/pedido');
    expect(message).toContain('/revocar');
    expect(allMessages()).toContain('/eliminarmisdatos');
  });
});
