import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  answerCallback,
  deleteMessage,
  removeInlineKeyboard,
  sendPhoto,
} from '../services/telegramApi.js';

// Mock node-fetch globally since telegramApi uses fetch
global.fetch = vi.fn();

describe('Telegram API service', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('answerCallback - exito y fallo', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
    await answerCallback('callback-123');

    // Simulate error to hit console.warn // NOSONAR
    global.fetch.mockRejectedValueOnce(new Error('Network error'));
    await answerCallback('callback-123');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('deleteMessage - exito y fallo', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
    const res1 = await deleteMessage('chat-1', 'msg-1');
    expect(res1).toBe(true);

    // Simulate error to hit console.warn // NOSONAR
    global.fetch.mockRejectedValueOnce(new Error('Network error'));
    const res2 = await deleteMessage('chat-1', 'msg-1');
    expect(res2).toBe(false);
  });

  it('removeInlineKeyboard - exito y fallo', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
    const res1 = await removeInlineKeyboard('chat-1', 'msg-1');
    expect(res1).toBe(true);

    // Simulate error to hit console.warn // NOSONAR
    global.fetch.mockRejectedValueOnce(new Error('Network error'));
    const res2 = await removeInlineKeyboard('chat-1', 'msg-1');
    expect(res2).toBe(false);
  });
  
  it('sendPhoto - funciona correctamente', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ result: true }) });
    const res = await sendPhoto('chat-1', 'http://photo', 'caption');
    expect(res).toEqual({ result: true });
  });
});
