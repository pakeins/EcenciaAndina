import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  telegramRequest,
  sendMessage,
  answerCallback,
  deleteMessage,
  removeInlineKeyboard,
  sendPhoto
} from '../services/telegramApi.js';

describe('telegramApi service', () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TELEGRAM_BOT_TOKEN = 'mock_bot_token';
    global.fetch = vi.fn();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
  });

  describe('telegramRequest', () => {
    it('debe lanzar error si falta TELEGRAM_BOT_TOKEN', async () => {
      delete process.env.TELEGRAM_BOT_TOKEN;
      await expect(telegramRequest('sendMessage', {})).rejects.toThrow('Falta TELEGRAM_BOT_TOKEN');
    });

    it('debe hacer un POST correcto y retornar el resultado en caso de éxito', async () => {
      const mockResult = { message_id: 123 };
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, result: mockResult })
      });

      const res = await telegramRequest('sendMessage', { chat_id: '123', text: 'hi' });
      expect(res).toEqual(mockResult);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.telegram.org/botmock_bot_token/sendMessage',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ chat_id: '123', text: 'hi' })
        })
      );
    });

    it('debe lanzar error 502 si la respuesta no es exitosa o data.ok es falso', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ ok: false, description: 'Bad Request' })
      });

      await expect(telegramRequest('sendMessage', {}))
        .rejects.toThrow('Bad Request');
    });

    it('debe usar mensaje por defecto si json() falla o no tiene descripción', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => { throw new Error('parse error'); }
      });

      await expect(telegramRequest('sendMessage', {}))
        .rejects.toThrow('Telegram respondio 500');
    });
  });

  describe('sendMessage', () => {
    it('debe llamar a telegramRequest con sendMessage y body correcto', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 1 } })
      });

      await sendMessage('123', 'text_content', { keyboard: [] }, 'HTML');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/sendMessage'),
        expect.objectContaining({
          body: JSON.stringify({
            chat_id: '123',
            text: 'text_content',
            disable_web_page_preview: true,
            reply_markup: { keyboard: [] },
            parse_mode: 'HTML'
          })
        })
      );
    });
  });

  describe('answerCallback', () => {
    it('debe ignorar si no hay callbackId', async () => {
      await answerCallback(null);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('debe llamar a answerCallbackQuery en Telegram', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, result: true })
      });

      await answerCallback('cb_123');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/answerCallbackQuery'),
        expect.objectContaining({
          body: JSON.stringify({ callback_query_id: 'cb_123' })
        })
      );
    });

    it('debe capturar errores de red e imprimir advertencia', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      global.fetch.mockRejectedValue(new Error('network error'));

      await answerCallback('cb_123');
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('No se pudo responder callback'), 'network error');
    });
  });

  describe('deleteMessage', () => {
    it('debe retornar falso si falta chatId o messageId', async () => {
      expect(await deleteMessage(null, 123)).toBe(false);
      expect(await deleteMessage('123', null)).toBe(false);
    });

    it('debe eliminar mensaje con éxito', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, result: true })
      });

      const res = await deleteMessage('123', 456);
      expect(res).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/deleteMessage'),
        expect.objectContaining({
          body: JSON.stringify({ chat_id: '123', message_id: 456 })
        })
      );
    });

    it('debe retornar falso en caso de error y loguear advertencia', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      global.fetch.mockRejectedValue(new Error('api error'));

      const res = await deleteMessage('123', 456);
      expect(res).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('No se pudo borrar un mensaje'), 'api error');
    });
  });

  describe('removeInlineKeyboard', () => {
    it('debe retornar falso si falta chatId o messageId', async () => {
      expect(await removeInlineKeyboard(null, 123)).toBe(false);
      expect(await removeInlineKeyboard('123', null)).toBe(false);
    });

    it('debe editar ReplyMarkup para vaciar inline_keyboard', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, result: true })
      });

      const res = await removeInlineKeyboard('123', 456);
      expect(res).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/editMessageReplyMarkup'),
        expect.objectContaining({
          body: JSON.stringify({ chat_id: '123', message_id: 456, reply_markup: { inline_keyboard: [] } })
        })
      );
    });

    it('debe retornar falso en caso de error y loguear advertencia', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      global.fetch.mockRejectedValue(new Error('api error'));

      const res = await removeInlineKeyboard('123', 456);
      expect(res).toBe(false);
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  describe('sendPhoto', () => {
    it('debe llamar a Telegram con sendPhoto y body correcto', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 2 } })
      });

      await sendPhoto('123', 'http://photo.jpg', 'my caption', { keyboard: [] }, 'HTML');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/sendPhoto'),
        expect.objectContaining({
          body: JSON.stringify({
            chat_id: '123',
            photo: 'http://photo.jpg',
            caption: 'my caption',
            reply_markup: { keyboard: [] },
            parse_mode: 'HTML'
          })
        })
      );
    });
  });
});
