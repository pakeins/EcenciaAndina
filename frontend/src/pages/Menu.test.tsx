import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetch = vi.fn();
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  API_BASE_URL: 'http://test',
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import Menu from './Menu';

const jsonResponse = (data: unknown, ok = true) => ({
  ok,
  status: ok ? 200 : 500,
  json: async () => data,
  text: async () => JSON.stringify(data),
});

beforeEach(() => {
  apiFetch.mockReset();
});

describe('Menu (pagina)', () => {
  it('renderiza el editor de menu del dia y carga catalogos', async () => {
    apiFetch.mockImplementation((url: string) => {
      if (url === '/menu') return Promise.resolve(jsonResponse({ menus: [] }));
      if (url === '/alimentos/categorias') {
        return Promise.resolve(jsonResponse([{ id_categoria_menu: 1, nombre_categoria: 'Sopas' }]));
      }
      if (url === '/alimentos') return Promise.resolve(jsonResponse([]));
      return Promise.resolve(jsonResponse([]));
    });

    render(<Menu />);

    expect(await screen.findByText('Define las opciones de sopas para hoy')).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith('/menu');
  });

  it('muestra una alerta visible cuando faltan categorías de menú', async () => {
    apiFetch.mockImplementation((url: string) => {
      if (url === '/menu') return Promise.resolve(jsonResponse({ menus: [] }));
      if (url === '/alimentos/categorias') {
        return Promise.resolve(jsonResponse([
          { id_categoria_menu: 1, nombre_categoria: 'Sopas' },
          { id_categoria_menu: 2, nombre_categoria: 'Segundos' },
        ]));
      }
      if (url === '/alimentos') return Promise.resolve(jsonResponse([]));
      return Promise.resolve(jsonResponse([]));
    });

    render(<Menu />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Faltan categorías de menú');
    expect(alert).toHaveTextContent('Entradas');
    expect(alert).toHaveTextContent('Postres');
    expect(alert).toHaveTextContent('Bebidas');
  });
});
