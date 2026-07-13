import { describe, it, expect } from 'vitest';
import { 
  optionsKeyboard, tipoAlmuerzoKeyboard, consentKeyboard, 
  revokeConfirmKeyboard, contactKeyboard, removeKeyboard, 
  quantityKeyboard, confirmacionKeyboard, modificarPasosKeyboard, 
  confirmationKeyboard, pedidoKeyboard, cancelConfirmKeyboard 
} from '../ui/telegramKeyboards.js';

describe('Telegram Keyboards', () => {
  it('deberia crear optionsKeyboard', () => {
    const kb = optionsKeyboard('entrada', ['Ceviche', 'Ensalada'], 'sid123');
    expect(kb.inline_keyboard.length).toBe(4); // 2 options + sin entrada + cancelar
    expect(kb.inline_keyboard[0][0].callback_data).toBe('entrada:0:sid123');
  });

  it('deberia crear tipoAlmuerzoKeyboard filtrando permitidos', () => {
    const kb = tipoAlmuerzoKeyboard('sid123', ['ejecutivo_completo']);
    expect(kb.inline_keyboard.length).toBe(1);
    expect(kb.inline_keyboard[0][0].callback_data).toBe('tipo:ejecutivo_completo:sid123');
  });

  it('deberia crear tipoAlmuerzoKeyboard con todos si no hay filtro', () => {
    const kb = tipoAlmuerzoKeyboard('sid123', null);
    expect(kb.inline_keyboard.length).toBeGreaterThan(1);
  });

  it('deberia crear keyboards estaticos correctamente', () => {
    expect(consentKeyboard().inline_keyboard.length).toBe(2);
    expect(revokeConfirmKeyboard().inline_keyboard.length).toBe(2);
    expect(contactKeyboard().keyboard[0][0].request_contact).toBe(true);
    expect(removeKeyboard().remove_keyboard).toBe(true);
    expect(quantityKeyboard().inline_keyboard.length).toBeGreaterThan(1);
    expect(confirmationKeyboard().inline_keyboard.length).toBe(3);
    expect(pedidoKeyboard(1).inline_keyboard.length).toBe(2);
    expect(cancelConfirmKeyboard(1).inline_keyboard[0][0].callback_data).toBe('pedido:can2:1');
    expect(confirmacionKeyboard('sid123').inline_keyboard.length).toBe(3);
  });

  it('deberia crear modificarPasosKeyboard dinamicamente', () => {
    const session = {
      tipoAlmuerzo: { requiresEntrada: true, requiresSopa: false },
      opciones: { entrada: 'Ceviche' }
    };
    const kb = modificarPasosKeyboard(session, 'sid123');
    // 1 step + 1 volver = 2 rows
    expect(kb.inline_keyboard.length).toBe(2);
    expect(kb.inline_keyboard[0][0].callback_data).toBe('modstep:entrada:sid123');
  });
});
