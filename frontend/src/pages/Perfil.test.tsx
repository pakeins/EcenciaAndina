import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import Perfil from './Perfil';
import * as AuthContext from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api';

vi.mock('@/contexts/AuthContext');

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
  API_BASE_URL: 'http://localhost:3000/api',
}));

vi.mock('lucide-react', () => ({
  UserCog: () => <div data-testid="icon-user-cog" />,
  KeyRound: () => <div data-testid="icon-key-round" />,
  Eye: () => <div data-testid="icon-eye" />,
  EyeOff: () => <div data-testid="icon-eye-off" />,
  Check: () => <div data-testid="icon-check" />,
  X: () => <div data-testid="icon-x" />
}));

const mockUpdateProfile = vi.fn();

const setupAuth = () => {
  vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
    user: {
      id: 1,
      email: 'test@test.com',
      nombre: 'Juan',
      apellido: 'Perez',
      nombre_usuario: 'jperez',
      rol: 'administrador'
    },
    isAuthenticated: true,
    login: vi.fn(),
    logout: vi.fn(),
    updateProfile: mockUpdateProfile,
  });
};

describe('Perfil', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAuth();
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ mensaje: 'OK' }),
    });
  });

  it('se renderiza correctamente con datos del usuario', () => {
    render(<Perfil />);
    
    expect(screen.getByText('Mi Perfil')).toBeInTheDocument();
    expect(screen.getByText('Datos Personales')).toBeInTheDocument();
    expect(screen.getByText('Seguridad')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Juan')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Perez')).toBeInTheDocument();
    expect(screen.getByDisplayValue('jperez')).toBeInTheDocument();
    expect(screen.getByDisplayValue('test@test.com')).toBeInTheDocument();
  });

  it('muestra el email como campo deshabilitado', () => {
    render(<Perfil />);
    const emailInput = screen.getByDisplayValue('test@test.com');
    expect(emailInput).toBeDisabled();
    expect(screen.getByText(/El correo electrónico no puede modificarse/)).toBeInTheDocument();
  });

  it('permite editar nombre, apellido y nombre de usuario', () => {
    render(<Perfil />);
    
    fireEvent.change(screen.getByDisplayValue('Juan'), { target: { value: 'Carlos' } });
    expect(screen.getByDisplayValue('Carlos')).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue('Perez'), { target: { value: 'Garcia' } });
    expect(screen.getByDisplayValue('Garcia')).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue('jperez'), { target: { value: 'cgarcia' } });
    expect(screen.getByDisplayValue('cgarcia')).toBeInTheDocument();
  });

  it('envía datos al guardar perfil exitosamente', async () => {
    render(<Perfil />);

    const submitBtn = screen.getByText('Guardar Cambios');
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/empleados/perfil', expect.objectContaining({
        method: 'PUT',
      }));
      expect(mockUpdateProfile).toHaveBeenCalledWith({
        nombre: 'Juan',
        apellido: 'Perez',
        nombre_usuario: 'jperez',
      });
    });
  });

  it('maneja error al guardar perfil', async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Error del servidor' }),
    });

    render(<Perfil />);

    await act(async () => {
      fireEvent.click(screen.getByText('Guardar Cambios'));
    });

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalled();
    });
  });

  it('maneja error de conexion al guardar perfil', async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

    render(<Perfil />);

    await act(async () => {
      fireEvent.click(screen.getByText('Guardar Cambios'));
    });

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalled();
    });
  });

  it('muestra formulario de cambiar contraseña al hacer clic', () => {
    render(<Perfil />);
    
    fireEvent.click(screen.getByText('Cambiar Contraseña'));

    expect(screen.getByPlaceholderText('Escriba su contraseña actual')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Escriba su nueva contraseña')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Repita su nueva contraseña')).toBeInTheDocument();
  });

  it('permite cancelar el cambio de contraseña', () => {
    render(<Perfil />);
    
    fireEvent.click(screen.getByText('Cambiar Contraseña'));
    expect(screen.getByPlaceholderText('Escriba su contraseña actual')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancelar'));
    expect(screen.queryByPlaceholderText('Escriba su contraseña actual')).not.toBeInTheDocument();
  });

  it('muestra indicador de contraseñas coinciden', () => {
    render(<Perfil />);
    fireEvent.click(screen.getByText('Cambiar Contraseña'));

    fireEvent.change(screen.getByPlaceholderText('Escriba su nueva contraseña'), { target: { value: 'Test1234!' } });
    fireEvent.change(screen.getByPlaceholderText('Repita su nueva contraseña'), { target: { value: 'Test1234!' } });

    expect(screen.getByText(/Las contraseñas coinciden/)).toBeInTheDocument();
  });

  it('muestra indicador de contraseñas no coinciden', () => {
    render(<Perfil />);
    fireEvent.click(screen.getByText('Cambiar Contraseña'));

    fireEvent.change(screen.getByPlaceholderText('Escriba su nueva contraseña'), { target: { value: 'Test1234!' } });
    fireEvent.change(screen.getByPlaceholderText('Repita su nueva contraseña'), { target: { value: 'Diferente1!' } });

    expect(screen.getByText(/Las contraseñas no coinciden/)).toBeInTheDocument();
  });

  it('envía el cambio de contraseña exitosamente', async () => {
    render(<Perfil />);
    fireEvent.click(screen.getByText('Cambiar Contraseña'));

    fireEvent.change(screen.getByPlaceholderText('Escriba su contraseña actual'), { target: { value: 'OldPass1!' } });
    fireEvent.change(screen.getByPlaceholderText('Escriba su nueva contraseña'), { target: { value: 'NewPass1!' } });
    fireEvent.change(screen.getByPlaceholderText('Repita su nueva contraseña'), { target: { value: 'NewPass1!' } });

    const submitBtn = screen.getByText('Actualizar');
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/empleados/perfil/password', expect.objectContaining({
        method: 'PUT',
      }));
    });
  });

  it('maneja error al cambiar contraseña', async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Contraseña actual incorrecta' }),
    });

    render(<Perfil />);
    fireEvent.click(screen.getByText('Cambiar Contraseña'));

    fireEvent.change(screen.getByPlaceholderText('Escriba su contraseña actual'), { target: { value: 'WrongPass1!' } });
    fireEvent.change(screen.getByPlaceholderText('Escriba su nueva contraseña'), { target: { value: 'NewPass1!' } });
    fireEvent.change(screen.getByPlaceholderText('Repita su nueva contraseña'), { target: { value: 'NewPass1!' } });

    await act(async () => {
      fireEvent.click(screen.getByText('Actualizar'));
    });

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalled();
    });
  });

  it('maneja error de conexion al cambiar contraseña', async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network'));

    render(<Perfil />);
    fireEvent.click(screen.getByText('Cambiar Contraseña'));

    fireEvent.change(screen.getByPlaceholderText('Escriba su contraseña actual'), { target: { value: 'OldPass1!' } });
    fireEvent.change(screen.getByPlaceholderText('Escriba su nueva contraseña'), { target: { value: 'NewPass1!' } });
    fireEvent.change(screen.getByPlaceholderText('Repita su nueva contraseña'), { target: { value: 'NewPass1!' } });

    await act(async () => {
      fireEvent.click(screen.getByText('Actualizar'));
    });

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalled();
    });
  });
});
