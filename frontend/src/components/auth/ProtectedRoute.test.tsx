import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ProtectedRoute } from './ProtectedRoute';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import * as AuthContext from '@/contexts/AuthContext';

vi.mock('@/contexts/AuthContext');

describe('ProtectedRoute', () => {
  const renderWithRouter = (ui: React.ReactElement, initialEntry = '/') => {
    return render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/" element={ui} />
          <Route path="/login" element={<div>Página de Login</div>} />
          <Route path="/dashboard" element={<div>Dashboard Admin</div>} />
          <Route path="/pedidos" element={<div>Dashboard Vendedor</div>} />
          <Route path="/protegida" element={<div>Página Protegida</div>} />
        </Routes>
      </MemoryRouter>
    );
  };

  it('redirige a login si no esta autenticado', () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: null,
      isAuthenticated: false,
      login: vi.fn(),
      logout: vi.fn(),
    });

    renderWithRouter(<ProtectedRoute />, '/');
    expect(screen.getByText('Página de Login')).toBeInTheDocument();
  });

  it('renderiza el outlet si esta autenticado', () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: { id: 1, email: 'admin@test.com', rol: 'administrador', nombre: 'Admin', apellido: 'Test' },
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<div>Contenido Protegido</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('Contenido Protegido')).toBeInTheDocument();
  });

  it('redirige si no tiene los permisos necesarios (admin intentando entrar a ruta no permitida)', () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: { id: 1, email: 'admin@test.com', rol: 'administrador', nombre: 'Admin', apellido: 'Test' },
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<ProtectedRoute allowedRoles={['vendedor']} />}>
            <Route path="/" element={<div>Contenido Protegido</div>} />
          </Route>
          <Route path="/dashboard" element={<div>Dashboard Admin</div>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('Dashboard Admin')).toBeInTheDocument();
  });

  it('redirige a /pedidos si no tiene los permisos necesarios (vendedor intentando entrar a ruta de administrador)', () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: { id: 2, email: 'vendedor@test.com', rol: 'vendedor', nombre: 'Vendedor', apellido: 'Test' },
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<ProtectedRoute allowedRoles={['administrador']} />}>
            <Route path="/" element={<div>Contenido Protegido</div>} />
          </Route>
          <Route path="/pedidos" element={<div>Dashboard Vendedor</div>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('Dashboard Vendedor')).toBeInTheDocument();
  });
});
