import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import Menu from './Menu';
import { apiFetch } from '@/lib/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
  API_BASE_URL: 'http://localhost:3000/api',
}));

vi.mock('lucide-react', () => {
  const mockComponent = (name: string) => () => <div data-testid={`icon-${name}`} />;
  return {
    Soup: mockComponent('soup'),
    ChefHat: mockComponent('chef-hat'),
    Send: mockComponent('send'),
    CalendarDays: mockComponent('calendar-days'),
    Image: mockComponent('image'),
    Plus: mockComponent('plus'),
    Trash2: mockComponent('trash'),
    Utensils: mockComponent('utensils'),
    Cake: mockComponent('cake'),
    Wine: mockComponent('wine'),
    Cookie: mockComponent('cookie'),
    ChevronDown: mockComponent('chevron-down'),
    ChevronUp: mockComponent('chevron-up'),
    Check: mockComponent('check'),
    X: mockComponent('x'),
    Search: mockComponent('search'),
    Pencil: mockComponent('pencil'),
    ChevronsUpDown: mockComponent('chevrons-up-down'),
  };
});

// Mock canvas from buildTelegramMenuImage
vi.mock('@/lib/menuImage', () => ({
  buildTelegramMenuImage: vi.fn(() => 'data:image/png;base64,fake'),
}));

describe('Menu', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (apiFetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes('/alimentos/categorias')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            { id_categoria_menu: 1, nombre_categoria: 'Sopa' },
            { id_categoria_menu: 2, nombre_categoria: 'Segundo' }
          ])
        });
      }
      if (url.includes('/alimentos')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      if (url.includes('/productos')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      if (url.includes('/menu')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });
  });

  const renderComponent = async () => {
    await act(async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <Menu />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });
  };

  it('se renderiza correctamente y carga las categorias del menu', async () => {
    await renderComponent();

    await waitFor(() => {
      expect(screen.getAllByTestId('icon-calendar-days')[0]).toBeInTheDocument();
      expect(screen.getByTestId('icon-soup')).toBeInTheDocument();
    });
  });
});
