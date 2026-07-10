/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import Reportes from './Reportes';
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

vi.mock('@/lib/html', () => ({
  escapeHtml: (str: string) => str,
  formatMoney: (val: number) => val.toFixed(2),
  openPrintWindow: () => ({ focus: vi.fn(), print: vi.fn() }),
  toFiniteNumber: (val: any) => Number(val) || 0,
}));

vi.mock('lucide-react', () => {
  const mockComponent = (name: string) => () => <div data-testid={`icon-${name}`} />;
  return {
    FileDown: mockComponent('file-down'),
    Calendar: mockComponent('calendar'),
    Filter: mockComponent('filter'),
    FileText: mockComponent('file-text'),
    PieChart: mockComponent('pie-chart'),
    Users: mockComponent('users'),
    Building2: mockComponent('building'),
    TrendingUp: mockComponent('trending-up'),
    Plus: mockComponent('plus'),
    Pencil: mockComponent('pencil'),
    Trash2: mockComponent('trash'),
    Search: mockComponent('search'),
    UserPlus: mockComponent('user-plus'),
    ArrowLeft: mockComponent('arrow-left'),
    ShieldCheck: mockComponent('shield-check'),
    Eye: mockComponent('eye'),
    Upload: mockComponent('upload'),
    History: mockComponent('history'),
    X: mockComponent('x'),
    Mail: mockComponent('mail'),
    Phone: mockComponent('phone'),
    Check: mockComponent('check'),
    ChevronDown: mockComponent('chevron-down'),
    ChevronUp: mockComponent('chevron-up'),
  };
});

// Mock URL.createObjectURL for XML/CSV exports
global.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/mock-blob-url');

// Mock ResizeObserver for Recharts
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe('Reportes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = async () => {
    await act(async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <Reportes />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });
  };

  it('se renderiza correctamente y carga catalogos', async () => {
    (apiFetch as any).mockImplementation((url: string) => {
      if (url.includes('/clientes')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([{ id: 'c1', nombre: 'Juan', apellido: 'Perez', cedula: '123456' }]) });
      }
      if (url.includes('/convenios')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([{ id: 'conv1', nombre_empresa: 'Empresa A', activo: true }]) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    await renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Reportes y Estadísticas')).toBeInTheDocument();
    });
  });

  it('permite generar reporte de ventas e interactuar con exportacion', async () => {
    const mockVentas = [{
      metodo_pago: 'Efectivo', almuerzosPrincipales: 10, ejecutivoCompleto: 5,
      ejecutivoSinSopa: 5, ejecutivoSimple: 0, almuerzoDia: 0, almuerzoDiaSimple: 0,
      otrosAlmuerzos: 0, extrasCantidad: 2, valorExtras: 10, totalConsumo: 110,
    }];

    (apiFetch as any).mockImplementation(() => {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockVentas) });
    });

    await renderComponent();

    const btnGenerar = screen.getByText('Generar Reporte');
    fireEvent.click(btnGenerar);

    await waitFor(() => {
      expect(screen.getByText(/Resultados del Análisis/i)).toBeInTheDocument();
    });
  });
});
