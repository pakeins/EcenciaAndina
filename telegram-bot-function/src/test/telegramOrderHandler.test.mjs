import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const supabase = require('../config/supabase');
const telegramApi = require('../services/telegramApi');
const telegramState = require('../services/telegramState');
const telegramOrderTrace = require('../services/telegramOrderTrace');
const helpers = require('../utils/telegramHelpers');

let dbResults = {};
const mockSupabase = {
  from: (table) => {
    const builder = {
      select: (fields) => builder,
      insert: (data) => {
        builder._isInsert = true;
        return builder;
      },
      update: (data) => builder,
      delete: () => builder,
      eq: (col, val) => builder,
      order: (col, opts) => builder,
      gte: (col, val) => builder,
      lt: (col, val) => builder,
      limit: (n) => builder,
      ilike: (col, val) => {
        // En algunos casos el lookup ilike devuelve resultados específicos
        if (table === 'estados_orden') {
          dbResults[table] = { data: { id_estado: 1, nombre_estado: 'Reservado' }, error: null };
        }
        if (table === 'origenes_pedido') {
          dbResults[table] = { data: { id_origen: 1, nombre_origen: 'Telegram Bot' }, error: null };
        }
        if (table === 'productos') {
          dbResults[table] = { data: { id_producto: 6, nombre_producto: 'Almuerzo', precio_unitario: 3.5 }, error: null };
        }
        return builder;
      },
      single: async () => {
        if (builder._isInsert) {
          return { data: { id_orden: 'new_order_id' }, error: null };
        }
        const val = dbResults[table] || { data: null, error: null };
        if (val.error) throw val.error;
        return val;
      },
      maybeSingle: async () => {
        if (builder._isInsert) {
          return { data: { id_orden: 'new_order_id' }, error: null };
        }
        // If query on ordenes without insert, it is findActiveTodayOrder.
        // We can check if dbResults['ordenes_active'] is set to simulate an existing order.
        if (table === 'ordenes') {
          return dbResults['ordenes_active'] || { data: null, error: null };
        }
        const val = dbResults[table] || { data: null, error: null };
        if (val.error) throw val.error;
        return val;
      }
    };
    return builder;
  }
};

vi.spyOn(supabase, 'getAdminClient').mockReturnValue(mockSupabase);
vi.spyOn(telegramApi, 'sendMessage').mockImplementation(() => Promise.resolve({}));
vi.spyOn(telegramApi, 'sendPhoto').mockImplementation(() => Promise.resolve({}));
vi.spyOn(telegramApi, 'deleteMessage').mockImplementation(() => Promise.resolve(true));
vi.spyOn(telegramApi, 'removeInlineKeyboard').mockImplementation(() => Promise.resolve(true));
vi.spyOn(telegramState, 'getState').mockImplementation(() => Promise.resolve(null));
vi.spyOn(telegramState, 'setState').mockImplementation(() => Promise.resolve(null));
vi.spyOn(telegramState, 'deleteState').mockImplementation(() => Promise.resolve(null));
vi.spyOn(telegramOrderTrace, 'updateOrderTrace').mockImplementation(() => Promise.resolve(true));

const {
  orderSummary,
  buildComponentPlan,
  getNextStep,
  optionFromCallback,
  insertOrder,
  findActiveTodayOrder,
  getOrderDetail,
  getEstadoName,
  handlePedidoCallback,
  handleAcceptedSession,
  promptMenu,
  promptForStep,
  startSessionForClient,
  getActiveMenu,
  sessionSidValid,
  extractSidFromCallback
} = require('../handlers/telegramOrderHandler.js');

describe('telegramOrderHandler - Comprehensive Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbResults = {};
    // Default values for lookups
    dbResults['estados_orden'] = { data: { id_estado: 1, nombre_estado: 'Reservado' }, error: null };
    dbResults['origenes_pedido'] = { data: { id_origen: 1, nombre_origen: 'Telegram Bot' }, error: null };
    dbResults['productos'] = { data: { id_producto: 6, nombre_producto: 'Almuerzo Ejecutivo Completo', precio_unitario: 3.50 }, error: null };
    dbResults['clientes'] = { data: { id_cliente: 123, telefono: '0987654321', nombre: 'Test', apellido: 'User' }, error: null };
  });

  describe('Pure Functions', () => {
    it('orderSummary genera resumen de session', () => {
      const summary = orderSummary({
        opciones: { entrada: 'Sopaipilla', sopa: 'Locro', segundo: 'Pollo', bebida: 'Jugo', postre: 'Helado', guarnicion: 'Arroz' },
        quantity: 3,
        tipoAlmuerzo: { shortLabel: 'Ejecutivo' }
      });
      expect(summary).toContain('Tipo:</b> Ejecutivo');
      expect(summary).toContain('Cantidad:</b> 3');
      expect(summary).toContain('Entrada:</b> Sopaipilla');
    });

    it('buildComponentPlan maneja tipos de almuerzo y menús', () => {
      const plan = buildComponentPlan({
        tipoAlmuerzo: { code: 'ejecutivo_completo' },
        menu: { entradas: ['E1', 'E2'], sopas: ['S1'], segundos: ['Plato'], postres: ['Postre'], bebidas: ['Bebida'] }
      });
      expect(plan.opciones).toEqual({ sopa: 'S1', segundo: 'Plato', postre: 'Postre', bebida: 'Bebida' });
      expect(plan.pendingSteps).toEqual(['entrada']);
    });

    it('getNextStep decide el flujo de pasos', () => {
      const tipo = { requiresEntrada: true, requiresSegundo: true };
      expect(getNextStep(tipo, null)).toBe('entrada');
      expect(getNextStep(tipo, 'entrada')).toBe('segundo');
      expect(getNextStep(tipo, 'segundo')).toBe('confirmar');
    });

    it('optionFromCallback procesa callback_data', () => {
      expect(optionFromCallback('sopa:sin', 'sopa', [])).toBe('Sin Sopa');
      expect(optionFromCallback('sopa:0', 'sopa', ['Locro'])).toBe('Locro');
      expect(optionFromCallback('sopa:2', 'sopa', ['Locro'])).toBe('');
      expect(optionFromCallback('otro:0', 'sopa', ['Locro'])).toBe('');
    });

    it('sessionSidValid y extractSidFromCallback', () => {
      expect(extractSidFromCallback('confirmar:ok:sid123')).toBe('sid123');
      expect(extractSidFromCallback('confirmar:ok')).toBeNull();

      expect(sessionSidValid({ sid: 'abc' }, 'abc')).toBe(true);
      expect(sessionSidValid({ sid: 'abc' }, 'def')).toBe(false);
      expect(sessionSidValid(null, 'abc')).toBe(true);
    });
  });

  describe('Database / Async Helpers', () => {
    it('findActiveTodayOrder busca ordenes del día', async () => {
      dbResults['ordenes_active'] = { data: { id_orden: 'order_123' }, error: null };
      const order = await findActiveTodayOrder(123);
      expect(order).toEqual({ id_orden: 'order_123' });
    });

    it('getOrderDetail busca detalles de orden', async () => {
      dbResults['detalle_orden'] = { data: { id_orden: 'order_123', cantidad: 2 }, error: null };
      const detail = await getOrderDetail('order_123');
      expect(detail).toEqual({ id_orden: 'order_123', cantidad: 2 });
    });

    it('getEstadoName retorna nombre del estado', async () => {
      dbResults['estados_orden'] = { data: { nombre_estado: 'Entregado' }, error: null };
      expect(await getEstadoName(2)).toBe('Entregado');
    });

    it('insertOrder crea orden normal', async () => {
      dbResults['ordenes'] = { data: { id_orden: 'new_order_id' }, error: null };
      dbResults['detalle_orden'] = { data: { id_orden: 'new_order_id' }, error: null };
      
      const order = await insertOrder({
        cliente: { id_cliente: 123 },
        estadoReservadoId: 1,
        origenTelegramId: 1,
        quantity: 2,
        tipoAlmuerzo: { id: 6, code: 'ejecutivo_completo', nombreProducto: 'Almuerzo Ejecutivo Completo' },
        opciones: {}
      });
      expect(order.id_orden).toBe('new_order_id');
    });

    it('insertOrder aborta si hay orden duplicada en modo nuevo', async () => {
      dbResults['ordenes_active'] = { data: { id_orden: 'existing_id' }, error: null };
      const res = await insertOrder({
        cliente: { id_cliente: 123 },
        mode: 'new'
      });
      expect(res.duplicate).toBe(true);
    });

    it('insertOrder actualiza orden existente en modo modify', async () => {
      dbResults['detalle_orden'] = { data: { affected: 1 }, error: null };
      const res = await insertOrder({
        mode: 'modify',
        orderId: 'existing_id',
        tipoAlmuerzo: { id: 6, code: 'ejecutivo_completo' }
      });
      expect(res.modified).toBe(true);
      expect(res.id_orden).toBe('existing_id');
    });
  });

  describe('Session Initiation & Menu Prompt', () => {
    it('getActiveMenu retorna null si no hay menu guardado', async () => {
      vi.spyOn(telegramState, 'getState').mockResolvedValue(null);
      expect(await getActiveMenu()).toBeNull();
    });

    it('promptMenu notifica si no hay menu activo', async () => {
      vi.spyOn(telegramState, 'getState').mockResolvedValue(null); // latest-menu:active is null
      await promptMenu('123', { id_cliente: 123 });
      expect(telegramApi.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('Aun no hay un menu activo'));
    });

    it('promptMenu envía foto de menú si está disponible', async () => {
      vi.spyOn(telegramState, 'getState').mockImplementation((key) => {
        if (key === 'latest-menu:active') return Promise.resolve({ menu: { sopas: ['Sopa'] }, date: '2023-01-01' });
        return Promise.resolve(null);
      });
      await promptMenu('123', { id_cliente: 123 });
      expect(telegramApi.sendPhoto).toHaveBeenCalled();
    });
  });

  describe('handlePedidoCallback', () => {
    it('ignora callbacks ajenos', async () => {
      expect(await handlePedidoCallback({ text: 'otra_cosa' })).toBe(false);
    });

    it('pedido:can2 cancela orden y audita', async () => {
      dbResults['ordenes_active'] = { data: { id_orden: 'order_123', id_estado: 1 }, error: null };
      dbResults['orden_estado_auditoria'] = { data: {}, error: null };

      const handled = await handlePedidoCallback({ text: 'pedido:can2:order_123', chatId: '123' });
      expect(handled).toBe(true);
      expect(telegramApi.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('reserva fue cancelada'));
    });

    it('pedido:keep notifica que se mantiene sin cambios', async () => {
      const handled = await handlePedidoCallback({ text: 'pedido:keep:order_123', chatId: '123' });
      expect(handled).toBe(true);
      expect(telegramApi.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('se mantiene sin cambios'));
    });

    it('pedido:mod inicia modificacion interactiva', async () => {
      dbResults['ordenes_active'] = { data: { id_orden: 'order_123', id_estado: 1, id_cliente: 123 }, error: null };
      dbResults['detalle_orden'] = { data: { opciones: { tipoAlmuerzo: 'ejecutivo_completo' } }, error: null };
      
      vi.spyOn(telegramState, 'getState').mockImplementation((key) => {
        if (key === 'latest-menu:active') return Promise.resolve({ menu: { sopas: ['Sopa 1'] }, date: '2023-01-01' });
        return Promise.resolve(null);
      });

      const handled = await handlePedidoCallback(
        { text: 'pedido:mod:order_123', chatId: '123', isCallback: true, messageId: 444 },
        { id_cliente: 123 }
      );
      expect(handled).toBe(true);
      expect(telegramApi.removeInlineKeyboard).toHaveBeenCalledWith('123', 444);
      expect(telegramApi.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('deseas modificar'), expect.any(Object), 'HTML');
    });
  });

  describe('handleAcceptedSession', () => {
    it('notifica entrada inválida (texto en vez de botón)', async () => {
      vi.spyOn(telegramState, 'getState').mockResolvedValue({ date: helpers.todayInTimezone(), invalidInputNoticeSent: false });
      await handleAcceptedSession({ chatId: '123', isCallback: false, messageId: 999 }, 'trace_123');
      expect(telegramApi.deleteMessage).toHaveBeenCalledWith('123', 999);
      expect(telegramApi.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('solo acepta botones'));
    });

    it('maneja modstep para reencaminar flujo', async () => {
      const session = {
        date: helpers.todayInTimezone(),
        sid: 'sid123',
        menu: { sopas: ['S1', 'S2'] },
        tipoAlmuerzo: { shortLabel: 'Ejecutivo Completo' }
      };
      vi.spyOn(telegramState, 'getState').mockResolvedValue(session);

      await handleAcceptedSession({ chatId: '123', isCallback: true, text: 'modstep:sopa:sid123', messageId: 999 }, 'trace_123');
      expect(telegramState.setState).toHaveBeenCalled();
      expect(telegramApi.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('sopa de hoy'), expect.any(Object), 'HTML');
    });

    it('procesa paso tipo: code no existente envía mensaje de error', async () => {
      const session = {
        step: 'tipo',
        date: helpers.todayInTimezone(),
        sid: 'sid123'
      };
      vi.spyOn(telegramState, 'getState').mockResolvedValue(session);
      await handleAcceptedSession({ chatId: '123', isCallback: true, text: 'tipo:invalido:sid123', messageId: 999 }, 'trace_123');
      expect(telegramApi.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('no reconocido'), expect.any(Object));
    });

    it('procesa paso tipo correcto e inicia siguiente paso', async () => {
      const session = {
        step: 'tipo',
        date: helpers.todayInTimezone(),
        sid: 'sid123',
        menu: { segundos: ['S1', 'S2'] }
      };
      vi.spyOn(telegramState, 'getState').mockResolvedValue(session);
      await handleAcceptedSession({ chatId: '123', isCallback: true, text: 'tipo:almuerzo_dia_simple:sid123', messageId: 999 }, 'trace_123');
      expect(telegramState.setState).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ step: 'segundo' }));
    });

    it('paso confirmar:ok guarda orden y elimina sesión', async () => {
      const session = {
       step: 'confirmar',
        date: helpers.todayInTimezone(),
        sid: 'sid123',
        cliente: { id_cliente: 123 },
        tipoAlmuerzo: { id: 6, code: 'ejecutivo_completo' }
      };
      vi.spyOn(telegramState, 'getState').mockResolvedValue(session);
      dbResults['ordenes_active'] = null; // No hay orden activa previa
      dbResults['detalle_orden'] = { data: {}, error: null };

      await handleAcceptedSession({ chatId: '123', isCallback: true, text: 'confirmar:ok:sid123', messageId: 999 }, 'trace_123');
      expect(telegramState.deleteState).toHaveBeenCalled();
      expect(telegramApi.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('Registrada'), null, 'HTML');
    });

    it('paso confirmar:ok maneja duplicados reemplazando la anterior', async () => {
      const session = {
        step: 'confirmar',
        date: helpers.todayInTimezone(),
        sid: 'sid123',
        cliente: { id_cliente: 123 },
        tipoAlmuerzo: { id: 6, code: 'ejecutivo_completo' },
        mode: 'new'
      };
      vi.spyOn(telegramState, 'getState').mockResolvedValue(session);
      // Simular orden activa del día
      dbResults['ordenes_active'] = { data: { id_orden: 'existing_order_123', id_estado: 1 }, error: null };
      dbResults['detalle_orden'] = { data: { opciones: {} }, error: null };

      await handleAcceptedSession({ chatId: '123', isCallback: true, text: 'confirmar:ok:sid123', messageId: 999 }, 'trace_123');
      // Should modify session to modify mode and send confirmation to replace
      expect(telegramState.setState).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ mode: 'modify', orderId: 'existing_order_123' }));
      expect(telegramApi.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('nueva selección pendiente'), expect.any(Object), 'HTML');
    });

    it('paso dinámico procesa selección y avanza de paso', async () => {
      const session = {
        step: 'sopa',
        date: helpers.todayInTimezone(),
        sid: 'sid123',
        menu: { sopas: ['Locro', 'Sopa de fideos'], segundos: ['Pollo'] },
        tipoAlmuerzo: { requiresSopa: true, requiresSegundo: true }
      };
      vi.spyOn(telegramState, 'getState').mockResolvedValue(session);
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });

      await handleAcceptedSession({ chatId: '123', isCallback: true, text: 'sopa:0:sid123', messageId: 999 }, 'trace_123');
      expect(telegramState.setState).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
        opciones: { sopa: 'Locro' },
        step: 'segundo'
      }));
    });
  });

  describe('promptForStep edge cases', () => {
    it('promptForStep salta pasos vacíos', async () => {
      const session = {
        sid: 'sid123',
        menu: { sopas: [], segundos: ['Segundo 1', 'Segundo 2'] }, // No hay sopas disponibles, pero hay segundos
        tipoAlmuerzo: { requiresSopa: true, requiresSegundo: true }
      };
      await promptForStep('123', session, 'sopa');
      expect(telegramState.setState).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ step: 'segundo' }));
    });
  });
});