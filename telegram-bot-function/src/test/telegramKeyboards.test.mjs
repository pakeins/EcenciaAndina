import { describe, it, expect } from 'vitest';
import {
  TIPOS_ALMUERZO,
  inlineKeyboard,
  optionsKeyboard,
  tipoAlmuerzoKeyboard,
  consentKeyboard,
  revokeConfirmKeyboard,
  contactKeyboard,
  removeKeyboard,
  quantityKeyboard,
  confirmacionKeyboard,
  modificarPasosKeyboard,
  confirmationKeyboard,
  pedidoKeyboard,
  cancelConfirmKeyboard,
  buildPedidoMessage,
  buildOrderSummaryMessage,
} from '../ui/telegramKeyboards.js';

describe('Telegram Keyboards', () => {
  describe('inlineKeyboard', () => {
    it('envuelve filas en la estructura inline_keyboard', () => {
      const rows = [[{ text: 'Hola', callback_data: 'test:1' }]];
      expect(inlineKeyboard(rows)).toEqual({ inline_keyboard: rows });
    });
  });

  describe('optionsKeyboard', () => {
    it('crea botones con callback_data que incluye sid', () => {
      const kb = optionsKeyboard('entrada', ['Ceviche', 'Ensalada'], 'sid123');
      expect(kb.inline_keyboard.length).toBe(4); // 2 options + sin entrada + cancelar
      expect(kb.inline_keyboard[0][0].callback_data).toBe('entrada:0:sid123');
      expect(kb.inline_keyboard[1][0].callback_data).toBe('entrada:1:sid123');
      expect(kb.inline_keyboard[2][0].callback_data).toBe('entrada:sin:sid123');
      expect(kb.inline_keyboard[3][0].callback_data).toBe('confirm:cancel');
    });

    it('crea botones sin sid cuando no se proporciona', () => {
      const kb = optionsKeyboard('sopa', ['Locro', 'Crema'], undefined);
      expect(kb.inline_keyboard[0][0].callback_data).toBe('sopa:0');
      expect(kb.inline_keyboard[2][0].callback_data).toBe('sopa:sin');
    });
  });

  describe('tipoAlmuerzoKeyboard', () => {
    it('filtra por tipos permitidos', () => {
      const kb = tipoAlmuerzoKeyboard('sid123', ['ejecutivo_completo']);
      expect(kb.inline_keyboard.length).toBe(1);
      expect(kb.inline_keyboard[0][0].callback_data).toBe('tipo:ejecutivo_completo:sid123');
    });

    it('muestra todos si no hay filtro (null)', () => {
      const kb = tipoAlmuerzoKeyboard('sid123', null);
      expect(kb.inline_keyboard.length).toBe(TIPOS_ALMUERZO.length);
    });

    it('muestra todos si el array de permitidos esta vacio', () => {
      const kb = tipoAlmuerzoKeyboard('sid123', []);
      expect(kb.inline_keyboard.length).toBe(TIPOS_ALMUERZO.length);
    });

    it('filtra multiples tipos permitidos', () => {
      const kb = tipoAlmuerzoKeyboard('sid123', ['ejecutivo_completo', 'almuerzo_dia']);
      expect(kb.inline_keyboard.length).toBe(2);
    });
  });

  describe('Keyboards estaticos', () => {
    it('consentKeyboard tiene 2 opciones con callback_data correcto', () => {
      const kb = consentKeyboard();
      expect(kb.inline_keyboard.length).toBe(2);
      expect(kb.inline_keyboard[0][0].callback_data).toBe('consent:accept');
      expect(kb.inline_keyboard[1][0].callback_data).toBe('consent:reject');
    });

    it('revokeConfirmKeyboard tiene 2 opciones', () => {
      const kb = revokeConfirmKeyboard();
      expect(kb.inline_keyboard.length).toBe(2);
      expect(kb.inline_keyboard[0][0].callback_data).toBe('revocar:confirm');
      expect(kb.inline_keyboard[1][0].callback_data).toBe('revocar:cancel');
    });

    it('contactKeyboard solicita el contacto de Telegram', () => {
      const kb = contactKeyboard();
      expect(kb.keyboard[0][0].request_contact).toBe(true);
      expect(kb.resize_keyboard).toBe(true);
      expect(kb.one_time_keyboard).toBe(true);
    });

    it('removeKeyboard devuelve remove_keyboard=true', () => {
      expect(removeKeyboard().remove_keyboard).toBe(true);
    });

    it('quantityKeyboard genera 20 botones distribuidos en filas de 5', () => {
      const kb = quantityKeyboard();
      expect(kb.inline_keyboard.length).toBe(4);
      expect(kb.inline_keyboard[0].length).toBe(5);
      // Total de 20 botones
      const totalButtons = kb.inline_keyboard.reduce((sum, row) => sum + row.length, 0);
      expect(totalButtons).toBe(20);
      expect(kb.inline_keyboard[3][4].callback_data).toBe('quantity:20');
    });

    it('confirmationKeyboard tiene 3 opciones de confirmacion', () => {
      const kb = confirmationKeyboard();
      expect(kb.inline_keyboard.length).toBe(3);
      expect(kb.inline_keyboard[0][0].callback_data).toBe('confirm:yes');
      expect(kb.inline_keyboard[1][0].callback_data).toBe('confirm:edit');
      expect(kb.inline_keyboard[2][0].callback_data).toBe('confirm:cancel');
    });
  });

  describe('confirmacionKeyboard', () => {
    it('genera teclado de confirmacion de orden con sid', () => {
      const kb = confirmacionKeyboard('sid999');
      expect(kb.inline_keyboard.length).toBe(3);
      expect(kb.inline_keyboard[0][0].callback_data).toBe('confirmar:ok:sid999');
      expect(kb.inline_keyboard[1][0].callback_data).toBe('confirmar:edit:sid999');
      expect(kb.inline_keyboard[2][0].callback_data).toBe('confirm:cancel');
    });
  });

  describe('modificarPasosKeyboard', () => {
    it('solo incluye pasos que requiere el tipo y que estan rellenos', () => {
      const session = {
        tipoAlmuerzo: { requiresEntrada: true, requiresSopa: true, requiresSegundo: true, requiresBebida: false, requiresPostre: false },
        opciones: { entrada: 'Ceviche', sopa: 'Locro', segundo: 'Pollo' }
      };
      const kb = modificarPasosKeyboard(session, 'sid123');
      // 3 steps + 1 volver = 4 rows
      expect(kb.inline_keyboard.length).toBe(4);
      expect(kb.inline_keyboard[0][0].callback_data).toBe('modstep:entrada:sid123');
      expect(kb.inline_keyboard[1][0].callback_data).toBe('modstep:sopa:sid123');
      expect(kb.inline_keyboard[2][0].callback_data).toBe('modstep:segundo:sid123');
      expect(kb.inline_keyboard[3][0].callback_data).toBe('confirmar:back:sid123');
    });

    it('muestra bebida y postre si estan rellenos y requeridos', () => {
      const session = {
        tipoAlmuerzo: { requiresEntrada: false, requiresSopa: false, requiresSegundo: false, requiresBebida: true, requiresPostre: true },
        opciones: { bebida: 'Jugo', postre: 'Flan' }
      };
      const kb = modificarPasosKeyboard(session, 'sid456');
      expect(kb.inline_keyboard.length).toBe(3); // bebida + postre + volver
      expect(kb.inline_keyboard[0][0].callback_data).toBe('modstep:bebida:sid456');
      expect(kb.inline_keyboard[1][0].callback_data).toBe('modstep:postre:sid456');
    });

    it('solo muestra volver si no hay opciones rellenas', () => {
      const session = {
        tipoAlmuerzo: { requiresEntrada: true, requiresSopa: false, requiresSegundo: false, requiresBebida: false, requiresPostre: false },
        opciones: {}
      };
      const kb = modificarPasosKeyboard(session, 'sid789');
      expect(kb.inline_keyboard.length).toBe(1);
      expect(kb.inline_keyboard[0][0].callback_data).toBe('confirmar:back:sid789');
    });
  });

  describe('pedidoKeyboard y cancelConfirmKeyboard', () => {
    it('pedidoKeyboard incluye modificar y cancelar con orderId', () => {
      const kb = pedidoKeyboard('order-abc');
      expect(kb.inline_keyboard.length).toBe(2);
      expect(kb.inline_keyboard[0][0].callback_data).toBe('pedido:mod:order-abc');
      expect(kb.inline_keyboard[1][0].callback_data).toBe('pedido:can:order-abc');
    });

    it('cancelConfirmKeyboard incluye confirmar y cancelar con orderId', () => {
      const kb = cancelConfirmKeyboard('order-xyz');
      expect(kb.inline_keyboard.length).toBe(2);
      expect(kb.inline_keyboard[0][0].callback_data).toBe('pedido:can2:order-xyz');
      expect(kb.inline_keyboard[1][0].callback_data).toBe('pedido:keep:order-xyz');
    });
  });

  describe('buildPedidoMessage y buildOrderSummaryMessage', () => {
    const order = {
      id_orden: 'abcde-12345',
      numero_orden: null,
      _estadoNombre: 'Reservado',
    };
    const detail = {
      productos: { nombre_producto: 'Almuerzo del Dia' },
      opciones: { sopa: 'Locro', segundo: 'Pollo', bebida: 'Agua', entrada: null, postre: null },
    };

    it('buildPedidoMessage genera un resumen del pedido', () => {
      const msg = buildPedidoMessage(order, detail);
      expect(msg).toContain('Tu reserva de hoy');
      expect(msg).toContain('Almuerzo del Dia');
      expect(msg).toContain('Locro');
      expect(msg).toContain('Pollo');
      expect(msg).toContain('Agua');
      expect(msg).not.toContain('Entrada');
      expect(msg).toContain('ABCDE'); // primeros 5 chars del id_orden en mayúscula
    });

    it('buildOrderSummaryMessage genera el resumen con estado', () => {
      const msg = buildOrderSummaryMessage(order, detail);
      expect(msg).toContain('Ya tienes una reserva activa');
      expect(msg).toContain('Reservado');
      expect(msg).toContain('Almuerzo del Dia');
      expect(msg).toContain('ABCDE');
    });

    it('buildPedidoMessage usa numero_orden cuando esta disponible', () => {
      const orderWithNum = { ...order, numero_orden: 'ORD-001' };
      const msg = buildPedidoMessage(orderWithNum, detail);
      expect(msg).toContain('ORD-001');
    });

    it('buildPedidoMessage incluye postre y entrada cuando estan presentes', () => {
      const detailFull = {
        productos: { nombre_producto: 'Ejecutivo Completo' },
        opciones: { entrada: 'Ceviche', sopa: 'Crema', segundo: 'Res', bebida: 'Jugo', postre: 'Flan' },
      };
      const msg = buildPedidoMessage(order, detailFull);
      expect(msg).toContain('Ceviche');
      expect(msg).toContain('Flan');
    });
  });
});
