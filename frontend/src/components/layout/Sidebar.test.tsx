import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { vi } from 'vitest';

// Mock useAuth
const mockLogout = vi.fn();
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));

// Mock useLocation
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useLocation: vi.fn(() => ({ pathname: '/dashboard' })),
  };
});

import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from 'react-router-dom';

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('se renderiza correctamente para administrador', () => {
    (useAuth as unknown).mockReturnValue({
      user: { nombre: 'Admin User', rol: 'administrador' },
      logout: mockLogout,
    });
    
    render(
      <BrowserRouter>
        <Sidebar />
      </BrowserRouter>
    );
    
    expect(screen.getByText('ECencia Andina')).toBeInTheDocument();
    expect(screen.getByText('Admin User')).toBeInTheDocument();
    expect(screen.getByText('administrador')).toBeInTheDocument();
    
    // Check if admin items are present
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Pedidos')).toBeInTheDocument();
    expect(screen.getByText('Menú Diario')).toBeInTheDocument();
    expect(screen.getByText('Reportes')).toBeInTheDocument();
    expect(screen.getByText('Convenios')).toBeInTheDocument();
    expect(screen.getByText('Clientes')).toBeInTheDocument();
    expect(screen.getByText('Empleados')).toBeInTheDocument();
    expect(screen.getByText('Productos')).toBeInTheDocument();
  });

  it('se renderiza correctamente para caja y oculta elementos de admin', () => {
    (useAuth as unknown).mockReturnValue({
      user: { nombre: 'Caja User', rol: 'caja' },
      logout: mockLogout,
    });
    (useLocation as unknown).mockReturnValue({ pathname: '/pedidos' });
    
    render(
      <BrowserRouter>
        <Sidebar />
      </BrowserRouter>
    );
    
    expect(screen.getByText('Caja User')).toBeInTheDocument();
    
    // Check if caja items are present
    expect(screen.getByText('Pedidos')).toBeInTheDocument();
    expect(screen.getByText('Menú Diario')).toBeInTheDocument();
    expect(screen.getByText('Convenios')).toBeInTheDocument();
    expect(screen.getByText('Clientes')).toBeInTheDocument();
    expect(screen.getByText('Productos')).toBeInTheDocument();
    
    // Admin items should NOT be present
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
    expect(screen.queryByText('Reportes')).not.toBeInTheDocument();
    expect(screen.queryByText('Empleados')).not.toBeInTheDocument();
  });

  it('llama a la función logout al hacer clic en el botón Cerrar Sesión', () => {
    (useAuth as unknown).mockReturnValue({
      user: { nombre: 'Test User', rol: 'caja' },
      logout: mockLogout,
    });
    
    render(
      <BrowserRouter>
        <Sidebar />
      </BrowserRouter>
    );
    
    const logoutBtn = screen.getByText('Cerrar Sesión');
    fireEvent.click(logoutBtn);
    
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });
  
  it('aplica las clases correctas al enlace activo', () => {
    (useAuth as unknown).mockReturnValue({
      user: { nombre: 'Admin User', rol: 'administrador' },
      logout: mockLogout,
    });
    (useLocation as unknown).mockReturnValue({ pathname: '/dashboard' });
    
    render(
      <BrowserRouter>
        <Sidebar />
      </BrowserRouter>
    );
    
    const activeLink = screen.getByText('Dashboard').closest('a');
    expect(activeLink).toHaveClass('bg-cafe');
    
    const inactiveLink = screen.getByText('Pedidos').closest('a');
    expect(inactiveLink).not.toHaveClass('bg-cafe');
  });
  
  it('renderiza sin errores si no hay usuario (caso extremo)', () => {
    (useAuth as unknown).mockReturnValue({
      user: null,
      logout: mockLogout,
    });
    
    render(
      <BrowserRouter>
        <Sidebar />
      </BrowserRouter>
    );
    
    // Debería renderizar la barra lateral pero sin elementos del menú, ya que todo requiere rol
    expect(screen.getByText('ECencia Andina')).toBeInTheDocument();
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
  });
});
