import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Privacidad from './Privacidad';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>{children}</BrowserRouter>
  </QueryClientProvider>
);

describe('Privacidad', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('se renderiza el titulo correctamente sin config', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    }));

    await act(async () => {
      render(<Privacidad />, { wrapper });
    });

    expect(screen.getByText(/Politica de privacidad/i)).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('muestra la version cuando la config se carga exitosamente', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        version: '1.2',
        contact: 'privacidad@ecencia.com',
        policy_url: 'https://ecencia.com/privacy',
        notice: 'Politica de privacidad ECencia',
      }),
    }));

    await act(async () => {
      render(<Privacidad />, { wrapper });
    });

    await waitFor(() => {
      expect(screen.getByText(/Version 1\.2/)).toBeInTheDocument();
    });

    vi.unstubAllGlobals();
  });

  it('no muestra version si fetch falla', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    await act(async () => {
      render(<Privacidad />, { wrapper });
    });

    // No should have "Version X" text
    expect(screen.queryByText(/Version/)).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('contiene las secciones de la politica de privacidad', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    }));

    await act(async () => {
      render(<Privacidad />, { wrapper });
    });

    expect(screen.getByText('Finalidad y datos tratados')).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
