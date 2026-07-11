/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import Login from './Login';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  }
}));

const mockLogin = vi.fn();
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    login: mockLogin,
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

  it('muestra un error si los campos están vacíos', async () => {
    await act(async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <Login />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });

    const loginButton = screen.getByRole('button', { name: /Iniciar Sesión/i });
    fireEvent.click(loginButton);

    const { toast } = await import('sonner');
    expect(toast.error).toHaveBeenCalledWith('Por favor complete todos los campos');
  });

  it('inicia sesión y redirige al dashboard si es administrador', async () => {
    mockLogin.mockResolvedValueOnce({ success: true, rol: 'administrador' });

    await act(async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <Login />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });

    const emailInput = screen.getByPlaceholderText(/Ingrese su nombre de usuario/i);
    const passwordInput = screen.getByPlaceholderText(/Ingrese su contraseña/i);
    
    fireEvent.change(emailInput, { target: { value: 'admin@test.com' } });
    fireEvent.change(passwordInput, { target: { value: 'pass123' } });

    const loginButton = screen.getByRole('button', { name: /Iniciar Sesión/i });
    
    await act(async () => {
      fireEvent.click(loginButton);
    });

    expect(mockLogin).toHaveBeenCalledWith('admin@test.com', 'pass123');
    const { toast } = await import('sonner');
    expect(toast.success).toHaveBeenCalledWith('Bienvenido al sistema');
  });

  it('muestra un error si las credenciales son inválidas', async () => {
    mockLogin.mockResolvedValueOnce({ success: false, message: 'Credenciales inválidas' });

    await act(async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <Login />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });

    const emailInput = screen.getByPlaceholderText(/Ingrese su nombre de usuario/i);
    const passwordInput = screen.getByPlaceholderText(/Ingrese su contraseña/i);
    
    fireEvent.change(emailInput, { target: { value: 'user@test.com' } });
    fireEvent.change(passwordInput, { target: { value: 'wrong' } });

    const loginButton = screen.getByRole('button', { name: /Iniciar Sesión/i });
    
    await act(async () => {
      fireEvent.click(loginButton);
    });

    const { toast } = await import('sonner');
    expect(toast.error).toHaveBeenCalledWith('Credenciales inválidas');
  });
});
