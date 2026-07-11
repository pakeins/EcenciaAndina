import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildTelegramMenuImage } from './menuImage';

describe('menuImage', () => {
  let mockCtx: {
    fillRect: ReturnType<typeof vi.fn>;
    fillText: ReturnType<typeof vi.fn>;
    beginPath: ReturnType<typeof vi.fn>;
    moveTo: ReturnType<typeof vi.fn>;
    lineTo: ReturnType<typeof vi.fn>;
    quadraticCurveTo: ReturnType<typeof vi.fn>;
    closePath: ReturnType<typeof vi.fn>;
    fill: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    restore: ReturnType<typeof vi.fn>;
    arc: ReturnType<typeof vi.fn>;
    measureText: ReturnType<typeof vi.fn>;
    drawImage: ReturnType<typeof vi.fn>;
    saveState: ReturnType<typeof vi.fn>;
    restoreState: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockCtx = {
      fillRect: vi.fn(),
      fillText: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      arc: vi.fn(),
      measureText: vi.fn().mockReturnValue({ width: 50 }),
      drawImage: vi.fn(),
      saveState: vi.fn(),
      restoreState: vi.fn(),
    };

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((contextId) => {
      if (contextId === '2d') {
        return mockCtx as unknown as CanvasRenderingContext2D;
      }
      return null;
    });

    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,mockImage');
  });

  it('retorna string vacio si no hay secciones', () => {
    const result = buildTelegramMenuImage({ sections: [] });
    expect(result).toBe('');
  });

  it('retorna string vacio si no se puede obtener el contexto 2d', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const result = buildTelegramMenuImage({
      sections: [{ title: 'Sopas', items: ['Sopa de lenteja'], accent: '#ff0000' }],
    });
    expect(result).toBe('');
  });

  it('dibuja secciones y combos correctamente', () => {
    const input = {
      sections: [
        { title: 'Sopas', items: ['Sopa de lentejas', 'Consomé de pollo'], accent: '#ff0000' },
        { title: 'Segundos', items: ['Arroz con pollo', 'Seco de carne'], accent: '#00ff00' },
      ],
      date: new Date('2023-10-01T12:00:00Z'),
      combos: [
        { icon: '🍴', name: 'Combo 1', desc: 'Sopa + Segundo + Jugo' }
      ]
    };

    const result = buildTelegramMenuImage(input);
    expect(result).toBe('data:image/jpeg;base64,mockImage');

    // Debe dibujar el encabezado de Ecencia Andina
    expect(mockCtx.fillText).toHaveBeenCalledWith('Ecencia Andina', expect.any(Number), expect.any(Number));
    expect(mockCtx.fillText).toHaveBeenCalledWith('Menu del dia', expect.any(Number), expect.any(Number));

    // Debe dibujar las secciones
    expect(mockCtx.fillText).toHaveBeenCalledWith('SOPAS', expect.any(Number), expect.any(Number));
    expect(mockCtx.fillText).toHaveBeenCalledWith('SEGUNDOS', expect.any(Number), expect.any(Number));

    // Debe dibujar los platos
    expect(mockCtx.fillText).toHaveBeenCalledWith('Sopa de lentejas', expect.any(Number), expect.any(Number));
    expect(mockCtx.fillText).toHaveBeenCalledWith('Consomé de pollo', expect.any(Number), expect.any(Number));
    expect(mockCtx.fillText).toHaveBeenCalledWith('Arroz con pollo', expect.any(Number), expect.any(Number));

    // Debe dibujar los combos
    expect(mockCtx.fillText).toHaveBeenCalledWith('TIPOS DE ALMUERZO', expect.any(Number), expect.any(Number));
    expect(mockCtx.fillText).toHaveBeenCalledWith('Combo 1', expect.any(Number), expect.any(Number));
  });

  it('dibuja secciones vacias con mensaje por defecto', () => {
    const input = {
      sections: [
        { title: 'Sopas', items: [], accent: '#ff0000' },
      ],
    };

    const result = buildTelegramMenuImage(input);
    expect(result).toBe('data:image/jpeg;base64,mockImage');
    expect(mockCtx.fillText).toHaveBeenCalledWith('Sin opciones configuradas', expect.any(Number), expect.any(Number));
  });

  it('dibuja combos por defecto si no son proveidos', () => {
    const input = {
      sections: [
        { title: 'Sopas', items: ['Sopa'], accent: '#ff0000' },
      ],
    };

    buildTelegramMenuImage(input);
    // Debe dibujar los combos por defecto
    expect(mockCtx.fillText).toHaveBeenCalledWith('Del Día Simple $3.99:', expect.any(Number), expect.any(Number));
    expect(mockCtx.fillText).toHaveBeenCalledWith('Ejecutivo Completo $6.99:', expect.any(Number), expect.any(Number));
  });

  it('corta textos largos correctamente usando wrapText', () => {
    // Simulamos un texto muy largo para probar la lógica de corte de líneas
    // devolvemos un ancho grande para la primera palabra, pero pequeño después
    let measureCount = 0;
    mockCtx.measureText.mockImplementation(() => {
      measureCount++;
      // Hacemos que a partir de la llamada 10 el texto parezca muy ancho para disparar el wrap
      return { width: measureCount > 10 ? 1000 : 50 };
    });

    const input = {
      sections: [
        { title: 'Sopas', items: ['Este es un plato con un nombre exageradamente largo para forzar el wrapText'], accent: '#ff0000' },
      ],
    };

    buildTelegramMenuImage(input);
    expect(mockCtx.fillText).toHaveBeenCalled();
  });
});
