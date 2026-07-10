/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import Convenios from './Convenios';
import { apiFetch } from '@/lib/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

// Mock dependencies
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { rol: 'administrador' } }),
}));

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
  API_BASE_URL: 'http://localhost:3000/api',
}));

vi.mock('lucide-react', () => {
  const mockComponent = (name: string) => () => <div data-testid={`icon-${name}`} />;
  return {
    Plus: mockComponent('plus'),
    Pencil: mockComponent('pencil'),
    Users: mockComponent('users'),
    Building2: mockComponent('building'),
    Mail: mockComponent('mail'),
    Phone: mockComponent('phone'),
    CalendarDays: mockComponent('calendar'),
    Trash2: mockComponent('trash'),
    Search: mockComponent('search'),
    UserPlus: mockComponent('user-plus'),
    ArrowLeft: mockComponent('arrow-left'),
    FileDown: mockComponent('file-down'),
    ShieldCheck: mockComponent('shield-check'),
    Eye: mockComponent('eye'),
    Upload: mockComponent('upload'),
    History: mockComponent('history'),
    FileText: mockComponent('file-text'),
    X: mockComponent('x'),
  };
});

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual as any,
    useNavigate: () => vi.fn(),
    Link: ({ children, to, ...props }: any) => <a href={to} {...props}>{children}</a>,
  };
});

// Mock ResizeObserver for Recharts
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe('Convenios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = async () => {
    await act(async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <Convenios />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });
  };

  it('se renderiza correctamente y maneja carga de datos', async () => {
    const mockConvenios = [
      {
        id: 'conv1',
        ruc: '1799999999001',
        nombre_empresa: 'Empresa A',
        representante: 'Juan',
        telefono: '099',
        email: 'a@a.com',
        fecha_inicio: '2023-01-01',
        fecha_caducidad: '2026-12-31',
        cupo_maximo: 50,
        tipos_almuerzo_permitidos: ['almuerzo_completo'],
        activo: true,
      }
    ];

    (apiFetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes('/productos')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([{ id_categoria: 1, nombre: 'Almuerzo Completo', activo: true }]) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockConvenios) });
    });

    await renderComponent();

    // Validar renderizado básico
    await waitFor(() => {
      expect(screen.getByText('Convenios')).toBeInTheDocument();
      expect(screen.getByText('Empresa A')).toBeInTheDocument();
      expect(screen.getByText(/1799999999001/i)).toBeInTheDocument();
    });
  });
});
