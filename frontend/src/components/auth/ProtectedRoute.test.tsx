import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ProtectedRoute } from './ProtectedRoute';
import * as AuthContext from '@/contexts/AuthContext';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('@/contexts/AuthContext');

describe('ProtectedRoute', () => {
  const renderWithRouter = (ui: React.ReactNode, initialEntries = ['/protected']) => {
    return render(
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/login" element={<div data-testid="login-page">Login Page</div>} />
          <Route path="/dashboard" element={<div data-testid="dashboard-page">Dashboard Page</div>} />
          <Route path="/pedidos" element={<div data-testid="pedidos-page">Pedidos Page</div>} />
          <Route path="/protected" element={ui}>
            <Route index element={<div data-testid="protected-content">Protected Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
  };

  it('redirige a login si no está autenticado', () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: null,
      isAuthenticated: false,
      login: vi.fn(),
      logout: vi.fn(),
      loading: false,
    });

    const { getByTestId } = renderWithRouter(<ProtectedRoute />);
    expect(getByTestId('login-page')).toBeInTheDocument();
  });

  it('renderiza el contenido protegido si está autenticado y tiene rol permitido', () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: { id: 1, email: 'admin@test.com', rol: 'administrador', nombre: 'Admin', apellido: 'Test', estado: 'activo' },
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
      loading: false,
    });

    const { getByTestId } = renderWithRouter(<ProtectedRoute allowedRoles={['administrador']} />);
    expect(getByTestId('protected-content')).toBeInTheDocument();
  });

  it('redirige a dashboard si no tiene rol permitido y es administrador', () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: { id: 1, email: 'admin@test.com', rol: 'administrador', nombre: 'Admin', apellido: 'Test', estado: 'activo' },
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
      loading: false,
    });

    const { getByTestId } = renderWithRouter(<ProtectedRoute allowedRoles={['empleado']} />);
    expect(getByTestId('dashboard-page')).toBeInTheDocument();
  });

  it('redirige a pedidos si no tiene rol permitido y es empleado', () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: { id: 2, email: 'emp@test.com', rol: 'empleado', nombre: 'Emp', apellido: 'Test', estado: 'activo' },
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
      loading: false,
    });

    const { getByTestId } = renderWithRouter(<ProtectedRoute allowedRoles={['administrador']} />);
    expect(getByTestId('pedidos-page')).toBeInTheDocument();
  });
});
