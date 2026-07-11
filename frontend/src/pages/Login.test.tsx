/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import Login from './Login';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useNavigate } from 'react-router-dom';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  }
}));

const mockLogin = vi.fn();
let mockUser: any = null;
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    login: mockLogin,
    user: mockUser,
  }),
}));

const mockNavigate = vi.fn();
let mockLocationState: any = null;
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual as any,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ state: mockLocationState, pathname: '/login' }),
  };
});

describe('Login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = null;
    mockLocationState = null;
    window.location.hash = '';
    // Mock global fetch
    global.fetch = vi.fn();
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

  it('redirige automáticamente si el usuario ya está logueado', async () => {
    mockUser = { rol: 'administrador' };
    
    await act(async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <Login />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });
    
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
  });
  
  it('redirige a la ruta previa si existe state.from', async () => {
    mockUser = { rol: 'caja' };
    mockLocationState = { from: { pathname: '/pedidos/123' } };
    
    await act(async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <Login />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });
    
    expect(mockNavigate).toHaveBeenCalledWith('/pedidos/123', { replace: true });
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

  it('inicia sesión y redirige si es caja', async () => {
    mockLogin.mockResolvedValueOnce({ success: true, rol: 'caja' });

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
    
    fireEvent.change(emailInput, { target: { value: 'caja@test.com' } });
    fireEvent.change(passwordInput, { target: { value: 'pass123' } });

    const loginButton = screen.getByRole('button', { name: /Iniciar Sesión/i });
    
    await act(async () => {
      fireEvent.click(loginButton);
    });

    expect(mockLogin).toHaveBeenCalledWith('caja@test.com', 'pass123');
    expect(mockNavigate).toHaveBeenCalledWith('/pedidos', { replace: true });
  });

  it('permite alternar visibilidad de contraseña', async () => {
    await act(async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <Login />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });

    const passwordInput = screen.getByPlaceholderText(/Ingrese su contraseña/i);
    expect(passwordInput).toHaveAttribute('type', 'password');
    
    // Toggle button should be the eye icon button
    const toggleButton = passwordInput.nextElementSibling as HTMLButtonElement;
    
    fireEvent.click(toggleButton);
    expect(passwordInput).toHaveAttribute('type', 'text');
    
    fireEvent.click(toggleButton);
    expect(passwordInput).toHaveAttribute('type', 'password');
  });

  it('flujo de olvido de contraseña', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ mensaje: 'Correo enviado' })
    });

    await act(async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <Login />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });

    // Click forgot password
    const forgotBtn = screen.getByText('¿Olvidó su contraseña?');
    fireEvent.click(forgotBtn);

    const emailInput = screen.getByPlaceholderText(/Ingrese su correo registrado/i);
    fireEvent.change(emailInput, { target: { value: 'test@correo.com' } });

    const sendBtn = screen.getByRole('button', { name: /Enviar Enlace/i });
    
    await act(async () => {
      fireEvent.click(sendBtn);
    });

    const { toast } = await import('sonner');
    expect(toast.success).toHaveBeenCalledWith('Correo enviado');
    
    // Debería volver a la vista normal
    expect(screen.queryByPlaceholderText(/Ingrese su correo registrado/i)).not.toBeInTheDocument();
  });
  
  it('flujo de olvido de contraseña - error', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Correo no existe' })
    });

    await act(async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <Login />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });

    // Click forgot password
    const forgotBtn = screen.getByText('¿Olvidó su contraseña?');
    fireEvent.click(forgotBtn);

    const emailInput = screen.getByPlaceholderText(/Ingrese su correo registrado/i);
    fireEvent.change(emailInput, { target: { value: 'test@correo.com' } });

    const sendBtn = screen.getByRole('button', { name: /Enviar Enlace/i });
    
    await act(async () => {
      fireEvent.click(sendBtn);
    });

    const { toast } = await import('sonner');
    expect(toast.error).toHaveBeenCalledWith('Correo no existe');
  });

  it('detecta hash de recuperación y permite restablecer contraseña', async () => {
    window.location.hash = 'type=recovery&access_token=fake-token';
    
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ nombre_usuario: 'UsuarioRecuperacion' })
    });

    await act(async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <Login />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Restablecer Contraseña')).toBeInTheDocument();
    });

    // Ingresar nueva contraseña que cumpla requisitos
    const newPwdInput = screen.getByPlaceholderText(/Escriba su nueva contraseña/i);
    const confirmPwdInput = screen.getByPlaceholderText(/Repita la nueva contraseña/i);
    
    fireEvent.change(newPwdInput, { target: { value: 'Nueva123$' } });
    fireEvent.change(confirmPwdInput, { target: { value: 'Nueva123$' } });

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({})
    });

    const saveBtn = screen.getByRole('button', { name: /Guardar y Continuar/i });
    
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    const { toast } = await import('sonner');
    expect(toast.success).toHaveBeenCalledWith('Contraseña actualizada exitosamente. Ya puede iniciar sesión.');
  });
  
  it('valida requisitos de contraseña en el restablecimiento', async () => {
    window.location.hash = 'type=recovery&access_token=fake-token';
    
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ nombre_usuario: 'UsuarioRecuperacion' })
    });

    await act(async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <Login />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });

    const newPwdInput = screen.getByPlaceholderText(/Escriba su nueva contraseña/i);
    const confirmPwdInput = screen.getByPlaceholderText(/Repita la nueva contraseña/i);
    
    // Contraseña muy corta
    fireEvent.change(newPwdInput, { target: { value: 'Cort1$' } });
    fireEvent.change(confirmPwdInput, { target: { value: 'Cort1$' } });
    
    const saveBtn = screen.getByRole('button', { name: /Guardar y Continuar/i });
    expect(saveBtn).toBeDisabled();
    
    // Si la forzamos
    fireEvent.change(newPwdInput, { target: { value: 'Cort123$' } }); // Mismas pwd pero no son iguales
    fireEvent.change(confirmPwdInput, { target: { value: 'Cort123$x' } });
    
    expect(saveBtn).toBeDisabled();
  });
});
