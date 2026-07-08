import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import Reportes from './Reportes';
import { apiFetch } from '@/lib/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

// Mock dependencias
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { rol: 'administrador' } }),
}));

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual as any,
    useNavigate: () => vi.fn(),
    Link: ({ children, to, ...props }: any) => <a href={to} {...props}>{children}</a>,
  };
});

describe('Reportes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('se renderiza correctamente y simula carga inicial (smoke test)', async () => {
    // Simulamos las llamadas a la API que ocurren al cargar la vista
    (apiFetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([])
    });

    await act(async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <Reportes />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });

    expect(screen.getByText(/Reportes/i)).toBeInTheDocument();
  });
});
