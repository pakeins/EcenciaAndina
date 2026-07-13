import { describe, it, expect } from 'vitest';
import {
  buildComponentPlan,
  orderSummary,
  getNextStep,
  optionFromCallback,
  LUNCH_COMPONENTS
} from '../handlers/telegramOrderHandler.js';

describe('telegramOrderHandler - Funciones Puras', () => {
  
  describe('buildComponentPlan', () => {
    it('debe construir opciones y pasos pendientes para almuerzo ejecutivo completo', () => {
      const menu = {
        entradas: ['Ceviche', 'Empanada'],
        sopas: ['Locro'], // solo 1
        segundos: ['Pollo', 'Carne'],
        postres: ['Helado'], // solo 1
        bebidas: ['Jugo'] // solo 1
      };
      
      const { opciones, pendingSteps } = buildComponentPlan({
        tipoAlmuerzo: { code: 'ejecutivo_completo' },
        menu
      });
      
      expect(opciones).toEqual({
        sopa: 'Locro',
        postre: 'Helado',
        bebida: 'Jugo'
      });
      // Entrada y Plato Fuerte tienen múltiples opciones
      expect(pendingSteps).toEqual(['entrada', 'plato fuerte']);
    });
    
    it('debe saltar componentes vacios', () => {
      const menu = {
        sopas: [],
        segundos: ['Pollo', 'Carne'],
        bebidas: ['Jugo']
      };
      
      const { opciones, pendingSteps } = buildComponentPlan({
        tipoAlmuerzo: { code: 'almuerzo_dia' },
        menu
      });
      
      expect(opciones).toEqual({ bebida: 'Jugo' });
      expect(pendingSteps).toEqual(['plato fuerte']);
    });
  });

  describe('orderSummary', () => {
    it('debe generar el resumen correctamente con todas las opciones', () => {
      const session = {
        opciones: {
          entrada: 'Ceviche',
          sopa: 'Locro',
          segundo: 'Pollo frito',
          bebida: 'Jugo de mora',
          postre: 'Helado',
          guarnicion: 'Arroz'
        },
        quantity: 2,
        tipoAlmuerzo: { shortLabel: 'Ejecutivo' }
      };
      
      const summary = orderSummary(session);
      expect(summary).toContain('📌 <b>Tipo:</b> Ejecutivo');
      expect(summary).toContain('🥗 <b>Entrada:</b> Ceviche');
      expect(summary).toContain('🍜 <b>Sopa:</b> Locro');
      expect(summary).toContain('🍽️ <b>Plato fuerte:</b> Pollo frito');
      expect(summary).toContain('🧆 <b>Guarnición:</b> Arroz');
      expect(summary).toContain('🥤 <b>Bebida:</b> Jugo de mora');
      expect(summary).toContain('🍰 <b>Postre:</b> Helado');
      expect(summary).toContain('🔢 <b>Cantidad:</b> 2');
    });

    it('debe generar el resumen con opciones faltantes o por defecto', () => {
      const session = {
        sopa: 'Sopa de fideos',
        segundo: 'Carne',
        quantity: 1
      };
      
      const summary = orderSummary(session);
      expect(summary).toContain('🍜 <b>Sopa:</b> Sopa de fideos');
      expect(summary).toContain('🍽️ <b>Plato fuerte:</b> Carne');
      expect(summary).not.toContain('🥗 <b>Entrada:</b>');
    });
  });

  describe('getNextStep', () => {
    it('debe devolver el proximo paso', () => {
      const tipo = { requiresSopa: true, requiresSegundo: true, requiresBebida: true };
      expect(getNextStep(tipo, 'sopa')).toBe('segundo');
      expect(getNextStep(tipo, 'segundo')).toBe('bebida');
    });

    it('debe devolver confirmar si no hay mas pasos', () => {
      const tipo = { requiresSopa: true, requiresSegundo: true, requiresBebida: true };
      expect(getNextStep(tipo, 'bebida')).toBe('confirmar');
    });
    
    it('debe devolver confirmar si el paso no existe', () => {
      const tipo = { requiresSopa: true };
      expect(getNextStep(tipo, 'inexistente')).toBe('confirmar');
    });
  });

  describe('optionFromCallback', () => {
    it('debe extraer la opcion correcta del callback', () => {
      const options = ['Pollo', 'Carne frita', 'Pescado'];
      
      // Indice 1 (text, kind, options)
      expect(optionFromCallback('segundo:1', 'segundo', options)).toBe('Carne frita');
      
      // Falso
      expect(optionFromCallback('sopa:1', 'segundo', options)).toBe('');
      
      // Indice fuera de rango
      expect(optionFromCallback('segundo:5', 'segundo', options)).toBe('');
    });
  });

  describe('promptMenu', () => {
    it('debe enviar el menu principal si se puede iniciar sesion', async () => {
      const { promptMenu } = require('../handlers/telegramOrderHandler.js');
      const telegramApi = require('../services/telegramApi.js');
      const telegramState = require('../services/telegramState.js');
      const supabase = require('../config/supabase.js');

      vi.spyOn(telegramApi, 'sendPhoto').mockResolvedValue(true);
      
      const mockSingleMenu = vi.fn().mockResolvedValue({ data: { menu: {} }, error: null });
      const mockEqMenu = vi.fn().mockReturnValue({ maybeSingle: mockSingleMenu });
      const mockSelectMenu = vi.fn().mockReturnValue({ eq: mockEqMenu });
      
      vi.spyOn(supabase, 'getAdminClient').mockImplementation(() => {
        return {
          from: (table) => {
            if (table === 'estados_orden' || table === 'origenes_pedido') {
              const mockLookupSingle = vi.fn().mockResolvedValue({ data: { id_estado: 1, id_origen: 1 }, error: null });
              const mockIlikeLookup = vi.fn().mockReturnValue({ maybeSingle: mockLookupSingle });
              const mockSelectLookup = vi.fn().mockReturnValue({ ilike: mockIlikeLookup });
              return { select: mockSelectLookup };
            }
            return { select: mockSelectMenu };
          }
        };
      });

      const client = { id_cliente: 1, clientes_convenios: [] };
      vi.spyOn(telegramState, 'setState').mockResolvedValue(true);
      vi.spyOn(telegramState, 'getState').mockResolvedValue({
        date: '2023-01-01',
        menu: { sopa: ['Sopa 1'] },
        photoUrl: 'http://test'
      });

      await promptMenu('123', client);

      expect(telegramApi.sendPhoto).toHaveBeenCalledWith('123', expect.anything(), expect.stringContaining('Menú del día'), expect.anything(), 'HTML');
    });
  });

  describe('handleAcceptedSession', () => {
    it('debe enviar error si no hay sesion activa', async () => {
      const { handleAcceptedSession } = require('../handlers/telegramOrderHandler.js');
      const telegramApi = require('../services/telegramApi.js');
      const telegramState = require('../services/telegramState.js');
      const telegramOrderTrace = require('../services/telegramOrderTrace.js');

      vi.spyOn(telegramState, 'getState').mockResolvedValue(null);
      vi.spyOn(telegramApi, 'sendMessage').mockResolvedValue(true);
      vi.spyOn(telegramOrderTrace, 'updateOrderTrace').mockResolvedValue(true);

      await handleAcceptedSession({ chatId: '123', isCallback: false }, 1);

      expect(telegramApi.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('No hay una seleccion activa'));
    });

    it('debe enviar error si el menu vencio', async () => {
      const { handleAcceptedSession } = require('../handlers/telegramOrderHandler.js');
      const telegramApi = require('../services/telegramApi.js');
      const telegramState = require('../services/telegramState.js');

      vi.spyOn(telegramState, 'getState').mockResolvedValue({ date: '2020-01-01' });
      vi.spyOn(telegramState, 'deleteState').mockResolvedValue(true);
      vi.spyOn(telegramApi, 'sendMessage').mockResolvedValue(true);

      await handleAcceptedSession({ chatId: '123', isCallback: true }, 1);

      expect(telegramApi.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('menu activo ya vencio'));
      expect(telegramState.deleteState).toHaveBeenCalled();
    });

    it('debe manejar callbacks de tipo de almuerzo validos', async () => {
      const { handleAcceptedSession } = require('../handlers/telegramOrderHandler.js');
      const telegramApi = require('../services/telegramApi.js');
      const telegramState = require('../services/telegramState.js');
      const { todayInTimezone } = require('../utils/telegramHelpers.js');

      const today = todayInTimezone();
      const session = { 
        date: today, 
        step: 'tipo', 
        sid: 'abc',
        menu: {
          entradas: ['Entrada 1'],
          sopas: ['Sopa 1'],
          segundos: ['Segundo 1'],
          bebidas: ['Bebida 1'],
          postres: ['Postre 1']
        }
      };

      vi.spyOn(telegramState, 'getState').mockResolvedValue(session);
      vi.spyOn(telegramState, 'setState').mockResolvedValue(true);
      
      telegramApi.sendMessage.mockClear();
      telegramState.setState.mockClear();
      
      vi.spyOn(telegramApi, 'sendMessage').mockResolvedValue(true);
      vi.spyOn(telegramApi, 'removeInlineKeyboard').mockResolvedValue(true);

      await handleAcceptedSession({ chatId: '123', text: 'tipo:ejecutivo_completo:abc', isCallback: true }, 1);

      expect(telegramState.setState).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ step: 'entrada' }));
      expect(telegramApi.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('entrada favorita'), expect.anything(), 'HTML');
    });
  });

  describe('telegramOrderHandler - handlePedidoCallback', () => {
    it('debe ignorar si no empieza con pedido', async () => {
      const { handlePedidoCallback } = require('../handlers/telegramOrderHandler.js');
      const result = await handlePedidoCallback({ text: 'otra_cosa:123' }, {});
      expect(result).toBe(false);
    });

    it('debe manejar pedido:can', async () => {
      const { handlePedidoCallback } = require('../handlers/telegramOrderHandler.js');
      const telegramApi = require('../services/telegramApi.js');
      const supabase = require('../config/supabase.js');

      vi.spyOn(telegramApi, 'sendMessage').mockResolvedValue(true);
      vi.spyOn(telegramApi, 'removeInlineKeyboard').mockResolvedValue(true);
      vi.spyOn(supabase, 'getAdminClient').mockReturnValue({
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id_orden: '123', id_estado: 1 } })
            })
          })
        })
      });

      const result = await handlePedidoCallback({ chatId: '123', text: 'pedido:can:123', isCallback: true, messageId: 1 }, {});
      expect(result).toBe(true);
      expect(telegramApi.removeInlineKeyboard).toHaveBeenCalledWith('123', 1);
      expect(telegramApi.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('cancelar tu reserva'), expect.anything());
    });

    it('debe manejar pedido:can fallido por estado', async () => {
      const { handlePedidoCallback } = require('../handlers/telegramOrderHandler.js');
      const telegramApi = require('../services/telegramApi.js');
      const supabase = require('../config/supabase.js');

      vi.spyOn(telegramApi, 'sendMessage').mockResolvedValue(true);
      vi.spyOn(supabase, 'getAdminClient').mockReturnValue({
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id_orden: '123', id_estado: 2 } })
            })
          })
        })
      });

      const result = await handlePedidoCallback({ chatId: '123', text: 'pedido:can:123' }, {});
      expect(result).toBe(true);
      expect(telegramApi.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('no puede cancelarse'));
    });
  });

  describe('telegramOrderHandler - helpers de SID', () => {
    it('extractSidFromCallback debe extraer correctamente', () => {
      const { extractSidFromCallback } = require('../handlers/telegramOrderHandler.js');
      expect(extractSidFromCallback('confirmar:ok:abc')).toBe('abc');
      expect(extractSidFromCallback('tipo:1:abc')).toBe('abc');
      expect(extractSidFromCallback('segundo:0:abc')).toBe('abc');
      expect(extractSidFromCallback('invalid:foo')).toBe(null);
      expect(extractSidFromCallback('')).toBe(null);
    });

    it('sessionSidValid debe validar correctamente', () => {
      const { sessionSidValid } = require('../handlers/telegramOrderHandler.js');
      
      // Callbacks legacy sin SID siempre son válidos
      expect(sessionSidValid({ sid: 'abc' }, null)).toBe(true);
      
      // Sesiones legacy sin SID siempre son válidas
      expect(sessionSidValid({}, 'abc')).toBe(true);
      
      // Coincidencia exacta
      expect(sessionSidValid({ sid: 'abc' }, 'abc')).toBe(true);
      
      // No coinciden
      expect(sessionSidValid({ sid: 'abc' }, 'def')).toBe(false);
    });
  });

  describe('telegramOrderHandler - promptForStep', () => {
    it('debe enviar resumen si el paso es confirmar', async () => {
      const { promptForStep } = require('../handlers/telegramOrderHandler.js');
      const telegramApi = require('../services/telegramApi.js');

      vi.spyOn(telegramApi, 'sendMessage').mockResolvedValue(true);

      const session = {
        sid: 'abc',
        date: '2023-01-01',
        tipoAlmuerzo: { requiresEntrada: true },
        opciones: { entrada: 'Entrada 1' },
        cliente: { nombre: 'Juan' },
        quantity: 1,
        menu: {}
      };

      await promptForStep('123', session, 'confirmar');

      expect(telegramApi.sendMessage).toHaveBeenCalledWith(
        '123',
        expect.stringContaining('Resumen de tu Selección'),
        expect.anything(),
        'HTML'
      );
    });

    it('debe saltar al siguiente paso si no hay opciones para el paso actual', async () => {
      const { promptForStep } = require('../handlers/telegramOrderHandler.js');
      const telegramApi = require('../services/telegramApi.js');
      const telegramState = require('../services/telegramState.js');

      vi.spyOn(telegramState, 'setState').mockResolvedValue(true);
      vi.spyOn(telegramApi, 'sendMessage').mockResolvedValue(true);

      const session = {
        sid: 'abc',
        tipoAlmuerzo: { requiresSopa: true, requiresSegundo: true },
        menu: { sopas: [], segundos: ['Segundo 1'] },
        step: 'sopa'
      };

      await promptForStep('123', session, 'sopa');

      expect(telegramState.setState).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ step: 'segundo' }));
    });

    it('debe enviar opciones si hay opciones disponibles para el paso', async () => {
      const { promptForStep } = require('../handlers/telegramOrderHandler.js');
      const telegramApi = require('../services/telegramApi.js');

      vi.spyOn(telegramApi, 'sendMessage').mockResolvedValue(true);

      const session = {
        sid: 'abc',
        tipoAlmuerzo: { shortLabel: 'Ejecutivo' },
        menu: { sopas: ['Sopa 1', 'Sopa 2'] }
      };

      await promptForStep('123', session, 'sopa');

      expect(telegramApi.sendMessage).toHaveBeenCalledWith(
        '123',
        expect.stringContaining('sopa de hoy'),
        expect.anything(),
        'HTML'
      );
    });
  });
});