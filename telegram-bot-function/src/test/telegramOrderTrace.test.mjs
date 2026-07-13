import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createOrderTrace,
  updateOrderTrace,
  _private
} from '../services/telegramOrderTrace.js';

describe('telegramOrderTrace service', () => {
  const makeChainableMock = (finalValue) => {
    const obj = {};
    obj.from = vi.fn().mockReturnValue(obj);
    obj.select = vi.fn().mockReturnValue(obj);
    obj.insert = vi.fn().mockReturnValue(obj);
    obj.update = vi.fn().mockReturnValue(obj);
    obj.delete = vi.fn().mockReturnValue(obj);
    obj.eq = vi.fn().mockReturnValue(obj);
    obj.is = vi.fn().mockReturnValue(obj);
    obj.single = vi.fn().mockResolvedValue(finalValue);
    obj.maybeSingle = vi.fn().mockResolvedValue(finalValue);
    obj.then = (onResolve) => Promise.resolve(finalValue).then(onResolve);
    return obj;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Pure functions', () => {
    it('truncate debe cortar strings largos', () => {
      expect(_private.truncate('hello', 10)).toBe('hello');
      expect(_private.truncate('hello world', 8)).toBe('hello...');
    });

    it('boundedJson debe truncar payloads excesivamente largos', () => {
      const obj = { data: 'a'.repeat(20000) }; // Más de 16000
      const res = _private.boundedJson(obj);
      expect(res.truncated).toBe(true);
      expect(res.summary).toContain('...');
    });

    it('boundedJson debe mantener payloads de tamaño razonable', () => {
      const obj = { foo: 'bar' };
      expect(_private.boundedJson(obj)).toEqual({ foo: 'bar' });
    });

    it('buildOriginalMessage debe construir payload correcto por tipo', () => {
      const cbUpdate = { isCallback: true, text: 'pedir:123', messageId: 10 };
      expect(_private.buildOriginalMessage(cbUpdate)).toEqual(expect.objectContaining({
        type: 'callback',
        callbackAction: 'pedir',
        messageId: 10,
        hasContact: false,
        contactVerified: false
      }));

      const phoneUpdate = { isCallback: false, contactPhone: '123', contactVerified: true };
      expect(_private.buildOriginalMessage(phoneUpdate)).toEqual(expect.objectContaining({
        type: 'contact',
        callbackAction: null,
        messageId: null,
        hasContact: true,
        contactVerified: true
      }));
    });
  });

  describe('createOrderTrace', () => {
    it('debe ignorar callbacks de acciones no importantes', async () => {
      const update = { isCallback: true, text: 'random_action:123' };
      const traceId = await createOrderTrace(update);
      expect(traceId).toBe('');
    });

    it('debe crear un trazo en base de datos para acciones válidas', async () => {
      const dbMock = makeChainableMock({ data: { id: 'trace_123' }, error: null });
      const update = { isCallback: true, text: 'pedir:123', chatId: '123' };
      const res = await createOrderTrace(update, { clientId: 456 }, () => dbMock);
      expect(res).toBe('trace_123');
      expect(dbMock.insert).toHaveBeenCalledWith(expect.objectContaining({
        chat_id: '123',
        id_cliente: 456,
        outcome: 'received'
      }));
    });

    it('debe capturar errores de base de datos y retornar vacío', async () => {
      const dbMock = makeChainableMock({ data: null, error: new Error('DB Error') });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const update = { isCallback: true, text: 'pedir:123' };

      const res = await createOrderTrace(update, {}, () => dbMock);
      expect(res).toBe('');
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  describe('updateOrderTrace', () => {
    it('debe retornar falso si no hay traceId', async () => {
      expect(await updateOrderTrace(null, {})).toBe(false);
    });

    it('debe actualizar el trazo con outcome y patch provisto', async () => {
      const dbMock = makeChainableMock({ error: null });
      const patch = { id_cliente: 123, outcome: 'success', error_message: 'some error' };
      
      const res = await updateOrderTrace('trace_123', patch, () => dbMock);
      expect(res).toBe(true);
      expect(dbMock.update).toHaveBeenCalledWith(expect.objectContaining({
        id_cliente: 123,
        outcome: 'success',
        error_message: 'some error'
      }));
    });

    it('debe manejar errores de actualización', async () => {
      const dbMock = makeChainableMock({ error: new Error('Update failed') });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const res = await updateOrderTrace('trace_123', { outcome: 'failed' }, () => dbMock);
      expect(res).toBe(false);
      expect(warnSpy).toHaveBeenCalled();
    });
  });
});
