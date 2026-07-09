/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import Login from './Login';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    login: vi.fn(),
    user: null,
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual as any,
    useNavigate: () => vi.fn(),
    useLocation: () => ({ state: null }),
  };
});

describe('Login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('se renderiza correctamente (smoke test)', async () => {
    await act(async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <Login />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });

    expect(screen.getByText('ECencia Andina')).toBeInTheDocument();
  });
});
