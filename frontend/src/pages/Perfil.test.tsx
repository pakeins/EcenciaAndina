import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import Perfil from './Perfil';
import * as AuthContext from '@/contexts/AuthContext';

vi.mock('@/contexts/AuthContext');

vi.mock('lucide-react', () => ({
  UserCog: () => <div data-testid="icon-user-cog" />,
  KeyRound: () => <div data-testid="icon-key-round" />,
  Eye: () => <div data-testid="icon-eye" />,
  EyeOff: () => <div data-testid="icon-eye-off" />,
  Check: () => <div data-testid="icon-check" />,
  X: () => <div data-testid="icon-x" />
}));

describe('Perfil', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('se renderiza correctamente con datos del usuario', () => {
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
      updateProfile: vi.fn(),
    });

    render(<Perfil />);
    
    expect(screen.getByText('Mi Perfil')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Juan')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Perez')).toBeInTheDocument();
    expect(screen.getByDisplayValue('jperez')).toBeInTheDocument();
  });
});

