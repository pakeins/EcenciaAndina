import { describe, it, expect, vi } from 'vitest';
import { escapeHtml, toFiniteNumber, formatMoney, openSafeBlankWindow, openPrintWindow } from './html';

describe('html.ts helper functions', () => {
  it('escapa caracteres HTML correctamente', () => {
    expect(escapeHtml('Hello <World> & "Friends" \'Test\'')).toBe('Hello &lt;World&gt; &amp; &quot;Friends&quot; &#39;Test&#39;');
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(123)).toBe('123');
  });

  it('convierte a numero finito de forma segura', () => {
    expect(toFiniteNumber(10)).toBe(10);
    expect(toFiniteNumber('25.5')).toBe(25.5);
    expect(toFiniteNumber('invalid', 5)).toBe(5);
    expect(toFiniteNumber(NaN, 0)).toBe(0);
    expect(toFiniteNumber(Infinity, 0)).toBe(0);
  });

  it('formatea montos con dos decimales', () => {
    expect(formatMoney(10.5)).toBe('10.50');
    expect(formatMoney('15')).toBe('15.00');
    expect(formatMoney(null)).toBe('0.00');
  });

  it('maneja apertura segura de ventana en blanco y ventana de impresion', () => {
    const mockWindow = {
      opener: {},
      document: {
        open: vi.fn(),
        write: vi.fn(),
        close: vi.fn(),
      },
    };

    const origOpen = window.open;
    window.open = vi.fn().mockReturnValue(mockWindow as unknown as Window);

    const win1 = openSafeBlankWindow();
    expect(win1).toBe(mockWindow);
    expect(mockWindow.opener).toBeNull();

    const win2 = openPrintWindow('<h1>Test Content</h1>');
    expect(win2).toBe(mockWindow);
    expect(mockWindow.document.open).toHaveBeenCalled();
    expect(mockWindow.document.write).toHaveBeenCalledWith('<h1>Test Content</h1>');
    expect(mockWindow.document.close).toHaveBeenCalled();

    // Caso cuando window.open retorna null
    window.open = vi.fn().mockReturnValue(null);
    expect(openSafeBlankWindow()).toBeNull();
    expect(openPrintWindow('test')).toBeNull();

    window.open = origOpen;
  });
});
